import { createClient } from '@supabase/supabase-js';
import { verifyBearerUser } from './lib/auth.mjs';
import { log } from './lib/logger.mjs';

function env(name) {
  const value = process.env[name];
  return value != null && String(value).trim() !== '' ? String(value).trim() : '';
}

function getServiceSupabase() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
}

function getRequestPath(req) {
  return String(req.url || '').split('?')[0] || '/';
}

function jobIdFromPath(req, action) {
  const pathOnly = getRequestPath(req);
  const match = pathOnly.match(new RegExp(`^/api/jobs/([^/]+)/${action}$`));
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}

export async function tryHandleJobsRoute(req, res, helpers) {
  const { sendJson } = helpers;
  const pathOnly = getRequestPath(req);

  // POST /api/jobs/:jobId/backfill-from-client
  if (req.method === 'POST' && /^\/api\/jobs\/[^/]+\/backfill-from-client$/.test(pathOnly)) {
    return await handleBackfillFromClient(req, res, { sendJson });
  }

  // POST /api/jobs/:jobId/mark-downloaded
  if (req.method === 'POST' && /^\/api\/jobs\/[^/]+\/mark-downloaded$/.test(pathOnly)) {
    return await handleMarkDownloaded(req, res, { sendJson });
  }

  return false;
}

async function handleMarkDownloaded(req, res, { sendJson }) {
  const auth = await verifyBearerUser(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return true;
  }
  const { userId } = auth;

  const jobId = jobIdFromPath(req, 'mark-downloaded');
  if (!jobId) {
    sendJson(res, 400, { error: 'Invalid job ID' });
    return true;
  }

  const supabase = getServiceSupabase();

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, user_id, last_downloaded_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (jobErr) {
    log.error('mark-downloaded job load error', log.errCtx(jobErr));
    sendJson(res, 500, { error: 'Could not load work order.' });
    return true;
  }
  if (!job) {
    sendJson(res, 404, { error: 'Work order not found' });
    return true;
  }

  if (job.last_downloaded_at) {
    const { data: fresh } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .maybeSingle();
    sendJson(res, 200, { job: fresh || job, updated: false });
    return true;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('jobs')
    .update({ last_downloaded_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateErr) {
    log.error('mark-downloaded job update error', log.errCtx(updateErr));
    sendJson(res, 500, { error: 'Could not update work order.' });
    return true;
  }

  log.info('marked job downloaded', { jobId, userId });
  sendJson(res, 200, { job: updated, updated: true });
  return true;
}

async function handleBackfillFromClient(req, res, { sendJson }) {
  const auth = await verifyBearerUser(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return true;
  }
  const { userId } = auth;

  const jobId = jobIdFromPath(req, 'backfill-from-client');
  if (!jobId) {
    sendJson(res, 400, { error: 'Invalid job ID' });
    return true;
  }

  const supabase = getServiceSupabase();

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, user_id, client_id, customer_email, customer_phone')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (jobErr) {
    log.error('backfill-from-client job load error', log.errCtx(jobErr));
    sendJson(res, 500, { error: 'Could not load work order.' });
    return true;
  }
  if (!job) {
    sendJson(res, 404, { error: 'Work order not found' });
    return true;
  }
  if (!job.client_id) {
    sendJson(res, 409, { error: 'This work order has no linked client.' });
    return true;
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, email, phone')
    .eq('id', job.client_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (clientErr) {
    log.error('backfill-from-client client load error', log.errCtx(clientErr));
    sendJson(res, 500, { error: 'Could not load client.' });
    return true;
  }
  if (!client) {
    sendJson(res, 404, { error: 'Linked client not found' });
    return true;
  }

  const update = {};
  if (!job.customer_email?.trim() && client.email?.trim()) {
    update.customer_email = client.email.trim();
  }
  if (!job.customer_phone?.trim() && client.phone?.trim()) {
    update.customer_phone = client.phone.trim();
  }

  if (Object.keys(update).length === 0) {
    sendJson(res, 200, { job, updated: false });
    return true;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('jobs')
    .update(update)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateErr) {
    log.error('backfill-from-client update error', log.errCtx(updateErr));
    sendJson(res, 500, { error: 'Could not update work order.' });
    return true;
  }

  log.info('backfilled job contact info from client', { jobId, userId, fields: Object.keys(update) });
  sendJson(res, 200, { job: updated, updated: true });
  return true;
}
