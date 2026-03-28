import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { buildEsignRowFromSubmission, pickCustomerSubmitter, DOCUSEAL_CUSTOMER_ROLE } from './docuseal-esign-state.mjs';

/** Max UTF-8 bytes for all HTML fields forwarded to DocuSeal on send (abuse / accident guard). */
const ESIGN_MAX_HTML_BYTES = 2 * 1024 * 1024;

const SEND_DOCUMENTS_ERROR =
  'Body must include exactly one document: [{ html, name?, html_header?, html_footer? }].';

function env(name, fallback = '') {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

function esignConfigError(message) {
  const err = new Error(message);
  err.code = 'ESIGN_CONFIG';
  return err;
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s)
  );
}

/** Compare webhook shared secret to header using SHA-256 digests (fixed length; avoids length short-circuit). */
function timingSafeEqualString(secret, headerVal) {
  try {
    const a = crypto.createHash('sha256').update(Buffer.from(String(secret), 'utf8')).digest();
    const b = crypto.createHash('sha256').update(Buffer.from(String(headerVal ?? ''), 'utf8')).digest();
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getBearerToken(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}

function getWebhookHeader(req, configuredName) {
  if (!configuredName) return '';
  const lower = configuredName.toLowerCase();
  return req.headers[lower] ?? req.headers[configuredName] ?? '';
}

let serviceSupabaseSingleton = null;

/** Clears memoized service client (Vitest only — keeps per-test createClient mocks working). */
export function resetEsignServiceSupabaseSingleton() {
  serviceSupabaseSingleton = null;
}

function getServiceSupabase() {
  if (serviceSupabaseSingleton) return serviceSupabaseSingleton;
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw esignConfigError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for e-sign routes.');
  }
  serviceSupabaseSingleton = createClient(url, key);
  return serviceSupabaseSingleton;
}

function docusealBase() {
  return env('DOCUSEAL_BASE_URL', 'https://api.docuseal.com').replace(/\/$/, '');
}

function docusealHeaders() {
  const key = env('DOCUSEAL_API_KEY');
  if (!key) throw esignConfigError('DOCUSEAL_API_KEY is not set.');
  return {
    'Content-Type': 'application/json',
    'X-Auth-Token': key,
  };
}

async function docusealFetchJson(path, init = {}) {
  const url = `${docusealBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...docusealHeaders(), ...init.headers },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && json.error
        ? String(json.error)
        : text || res.statusText;
    const err = new Error(`DocuSeal ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** @returns {string|null} error message or null if valid */
function validateSendDocuments(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return SEND_DOCUMENTS_ERROR;
  }
  if (documents.length !== 1) {
    return SEND_DOCUMENTS_ERROR;
  }
  for (const doc of documents) {
    if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
      return SEND_DOCUMENTS_ERROR;
    }
    if (typeof doc.html !== 'string') {
      return SEND_DOCUMENTS_ERROR;
    }
    if (doc.html_header != null && typeof doc.html_header !== 'string') {
      return SEND_DOCUMENTS_ERROR;
    }
    if (doc.html_footer != null && typeof doc.html_footer !== 'string') {
      return SEND_DOCUMENTS_ERROR;
    }
  }
  return null;
}

function countEsignHtmlUtf8Bytes(documents) {
  let n = 0;
  for (const doc of documents) {
    n += Buffer.byteLength(doc.html, 'utf8');
    if (typeof doc.html_header === 'string') {
      n += Buffer.byteLength(doc.html_header, 'utf8');
    }
    if (typeof doc.html_footer === 'string') {
      n += Buffer.byteLength(doc.html_footer, 'utf8');
    }
  }
  return n;
}

function publicEsignPayload(row) {
  return {
    esign_submission_id: row.esign_submission_id,
    esign_submitter_id: row.esign_submitter_id,
    esign_embed_src: row.esign_embed_src,
    esign_status: row.esign_status,
    esign_submission_state: row.esign_submission_state,
    esign_submitter_state: row.esign_submitter_state,
    esign_sent_at: row.esign_sent_at,
    esign_opened_at: row.esign_opened_at,
    esign_completed_at: row.esign_completed_at,
    esign_declined_at: row.esign_declined_at,
    esign_decline_reason: row.esign_decline_reason,
    esign_signed_document_url: row.esign_signed_document_url,
  };
}

async function resolveJobForWebhook(supabase, webhookData, verifiedSubmission) {
  const d = webhookData || {};
  const verifiedSubmissionId = verifiedSubmission?.id;
  if (verifiedSubmissionId != null) {
    const { data: row } = await supabase
      .from('jobs')
      .select('*')
      .eq('esign_submission_id', String(verifiedSubmissionId))
      .maybeSingle();
    if (row) {
      return { job: row, resolvedBy: 'submission_id' };
    }
  }

  const verifiedExternalId = pickCustomerSubmitter(verifiedSubmission)?.external_id;
  if (verifiedExternalId && isUuid(verifiedExternalId)) {
    const { data: row } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', String(verifiedExternalId))
      .maybeSingle();
    if (row) {
      return { job: row, resolvedBy: 'verified_external_id' };
    }
  }

  const payloadExternalId = d.external_id || d.submitters?.[0]?.external_id;
  if (payloadExternalId && isUuid(payloadExternalId)) {
    const { data: row } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', String(payloadExternalId))
      .maybeSingle();
    if (row) {
      return { job: row, resolvedBy: 'payload_external_id' };
    }
  }

  return null;
}

function matchEsignPath(method, pathname) {
  if (method === 'POST' && pathname === '/api/webhooks/docuseal') {
    return { kind: 'webhook' };
  }
  const m = pathname.match(/^\/api\/esign\/work-orders\/([0-9a-fA-F-]{36})\/(send|resend)$/);
  if (method === 'POST' && m) {
    return { kind: 'esign', jobId: m[1], action: m[2] };
  }
  return null;
}

async function handleSend(req, res, readJsonBody, sendJson, sendText, jobId) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'Missing or invalid Authorization bearer token.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return;
  }

  const supabase = getServiceSupabase();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    sendJson(res, 401, { error: 'Invalid or expired session.' });
    return;
  }
  const userId = userData.user.id;

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (jobErr) {
    sendJson(res, 500, { error: jobErr.message });
    return;
  }
  if (!job) {
    sendJson(res, 404, { error: 'Work order not found.' });
    return;
  }

  const email = (job.customer_email || '').trim();
  if (!email) {
    sendJson(res, 400, { error: 'Customer email is required to send for signature.' });
    return;
  }

  const documents = body.documents;
  const docErr = validateSendDocuments(documents);
  if (docErr) {
    sendJson(res, 400, { error: docErr });
    return;
  }

  const htmlBytes = countEsignHtmlUtf8Bytes(documents);
  if (htmlBytes > ESIGN_MAX_HTML_BYTES) {
    sendJson(res, 413, {
      error: `Document HTML exceeds maximum size (${ESIGN_MAX_HTML_BYTES} bytes).`,
    });
    return;
  }

  const payload = {
    name: body.name || `Work Order #${String(job.wo_number ?? '').padStart(4, '0')}`,
    send_email: body.send_email !== false,
    documents,
    submitters: [
      {
        role: DOCUSEAL_CUSTOMER_ROLE,
        email,
        external_id: jobId,
      },
    ],
  };
  if (body.message && typeof body.message === 'object') {
    payload.message = body.message;
  }
  if (body.order) payload.order = body.order;
  if (body.completed_redirect_url) payload.completed_redirect_url = body.completed_redirect_url;

  let submission;
  try {
    submission = await docusealFetchJson('/submissions/html', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    sendJson(res, status, { error: e instanceof Error ? e.message : 'DocuSeal request failed.' });
    return;
  }

  const patch = buildEsignRowFromSubmission(submission);
  if (!patch) {
    sendJson(res, 502, { error: 'DocuSeal response missing submitters.' });
    return;
  }

  const { data: updated, error: upErr } = await supabase
    .from('jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (upErr || !updated) {
    sendJson(res, 500, { error: upErr?.message || 'Failed to update work order after DocuSeal send.' });
    return;
  }

  sendJson(res, 200, { jobId, ...publicEsignPayload(updated) });
}

async function handleResend(req, res, readJsonBody, sendJson, jobId) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'Missing or invalid Authorization bearer token.' });
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }

  const supabase = getServiceSupabase();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    sendJson(res, 401, { error: 'Invalid or expired session.' });
    return;
  }
  const userId = userData.user.id;

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (jobErr) {
    sendJson(res, 500, { error: jobErr.message });
    return;
  }
  if (!job) {
    sendJson(res, 404, { error: 'Work order not found.' });
    return;
  }

  const submitterId = job.esign_submitter_id;
  if (!submitterId) {
    sendJson(res, 400, { error: 'No signature request to resend. Send first.' });
    return;
  }

  const putBody = { send_email: true };
  if (body.message && typeof body.message === 'object') {
    putBody.message = body.message;
  }

  let reconcileFromSubmission = false;
  try {
    await docusealFetchJson(`/submitters/${submitterId}`, {
      method: 'PUT',
      body: JSON.stringify(putBody),
    });
  } catch (e) {
    if (e?.status === 422 && job.esign_submission_id) {
      reconcileFromSubmission = true;
    } else {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
      sendJson(res, status, { error: e instanceof Error ? e.message : 'DocuSeal resend failed.' });
      return;
    }
  }

  // Fallback patch: if the optional submission refresh below fails, we still
  // know the resend happened, so write a consistent "sent" state rather than
  // returning the stale pre-resend row.
  const resendFallbackPatch = reconcileFromSubmission
    ? null
    : {
        esign_status: 'sent',
        esign_sent_at: new Date().toISOString(),
        esign_submission_state: 'sent',
        esign_submitter_state: 'sent',
        esign_opened_at: null,
        esign_completed_at: null,
        esign_declined_at: null,
        esign_decline_reason: null,
        esign_signed_document_url: null,
      };

  let submission = null;
  if (job.esign_submission_id) {
    try {
      submission = await docusealFetchJson(`/submissions/${job.esign_submission_id}`, {
        method: 'GET',
      });
    } catch (submissionErr) {
      if (reconcileFromSubmission) {
        const status =
          submissionErr?.status && submissionErr.status >= 400 && submissionErr.status < 600
            ? submissionErr.status
            : 502;
        sendJson(res, status, {
          error:
            submissionErr instanceof Error
              ? submissionErr.message
              : 'DocuSeal refresh after resend failed.',
        });
        return;
      }
      submission = null;
    }
  }

  if (submission) {
    const patch = buildEsignRowFromSubmission(submission);
    if (patch) {
      const { data: updated, error: upErr } = await supabase
        .from('jobs')
        .update(patch)
        .eq('id', jobId)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (!upErr && updated) {
        sendJson(res, 200, { jobId, ...publicEsignPayload(updated) });
        return;
      }
    }
  }

  // Submission refresh failed or returned no usable patch — apply the
  // fallback so the UI reflects "sent" rather than stale pre-resend state.
  if (resendFallbackPatch) {
    const { data: fallbackUpdated, error: fbErr } = await supabase
      .from('jobs')
      .update(resendFallbackPatch)
      .eq('id', jobId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (!fbErr && fallbackUpdated) {
      sendJson(res, 200, { jobId, ...publicEsignPayload(fallbackUpdated) });
      return;
    }
  }

  sendJson(res, 500, {
    error: 'Resend succeeded, but local state could not be refreshed. Reload to see current status.',
    jobId,
  });
}

async function handleWebhook(req, res, readJsonBody, sendJson, sendText) {
  const headerName = env('DOCUSEAL_WEBHOOK_HEADER_NAME');
  const headerSecret = env('DOCUSEAL_WEBHOOK_HEADER_VALUE');
  if (!headerName || !headerSecret) {
    sendJson(res, 503, { error: 'Webhook verification is not configured.' });
    return;
  }

  const received = getWebhookHeader(req, headerName);
  if (!timingSafeEqualString(headerSecret, received)) {
    sendText(res, 401, 'Unauthorized');
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    sendText(res, 400, 'Invalid JSON');
    return;
  }

  const eventType = payload.event_type || '';
  const data = payload.data || {};

  let submissionId = data.submission?.id ?? null;
  if (submissionId == null && typeof eventType === 'string' && eventType.startsWith('submission.')) {
    submissionId = data.id ?? null;
  }

  if (submissionId == null) {
    sendJson(res, 200, { ok: true, ignored: true });
    return;
  }

  let verified;
  try {
    verified = await docusealFetchJson(`/submissions/${submissionId}`, { method: 'GET' });
  } catch (e) {
    console.error('DocuSeal verify submission failed:', e);
    sendJson(res, 502, { error: 'Could not verify submission with DocuSeal.' });
    return;
  }

  const supabase = getServiceSupabase();
  const resolved = await resolveJobForWebhook(supabase, data, verified);
  if (!resolved) {
    sendJson(res, 200, { ok: true, ignored: true });
    return;
  }

  const { job, resolvedBy } = resolved;

  // When resolved by submission_id, the row is already anchored to the verified
  // submission id. External-id fallbacks need an explicit stale check before we
  // let the verified DocuSeal state overwrite the job row.
  if (
    resolvedBy !== 'submission_id' &&
    job.esign_submission_id &&
    String(verified.id) !== String(job.esign_submission_id)
  ) {
    sendJson(res, 200, { ok: true, ignored: true, reason: 'stale_submission' });
    return;
  }

  const patch = buildEsignRowFromSubmission(verified);
  if (!patch) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const { error: upErr } = await supabase.from('jobs').update(patch).eq('id', job.id);
  if (upErr) {
    console.error('Webhook job update failed:', upErr);
    sendJson(res, 500, { error: 'Database update failed.' });
    return;
  }

  sendJson(res, 200, { ok: true });
}

/**
 * @returns {boolean} true if this request was handled (caller should not fall through)
 */
export async function tryHandleEsignRoute(req, res, helpers) {
  const { readJsonBody, sendJson, sendText } = helpers;
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/api/webhooks/docuseal') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  const route = matchEsignPath(method, pathname);
  if (!route) return false;

  try {
    if (route.kind === 'webhook') {
      await handleWebhook(req, res, readJsonBody, sendJson, sendText);
      return true;
    }
    if (route.kind === 'esign' && route.action === 'send') {
      await handleSend(req, res, readJsonBody, sendJson, sendText, route.jobId);
      return true;
    }
    if (route.kind === 'esign' && route.action === 'resend') {
      await handleResend(req, res, readJsonBody, sendJson, route.jobId);
      return true;
    }
  } catch (e) {
    console.error('E-sign route error:', e);
    const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
    if (code === 'ESIGN_CONFIG') {
      sendJson(res, 503, { error: 'E-sign is temporarily unavailable.' });
      return true;
    }
    sendJson(res, 500, { error: 'E-sign route failed.' });
    return true;
  }

  return false;
}
