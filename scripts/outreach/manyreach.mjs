const BASE_URL = 'https://api.manyreach.com/api/v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const PAGE_LIMIT = 30;

/**
 * @param {Record<string, string | number | string[] | undefined>} params
 * @returns {string}
 */
export function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

/**
 * @param {string} apiKey
 * @param {string} path
 * @param {Record<string, string | number | string[] | undefined>} [query]
 * @returns {Promise<unknown>}
 */
export async function manyreachGet(apiKey, path, query = {}) {
  const qs = buildQueryString(query);
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (/** @type {Error} */ (error).name === 'AbortError') {
      throw new Error(`Manyreach request timed out after ${DEFAULT_TIMEOUT_MS}ms: GET ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    console.error('Manyreach rate limit exceeded (HTTP 429). Wait and rerun the command.');
    process.exit(1);
  }

  let body;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Manyreach returned non-JSON (${response.status}) for GET ${path}`);
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(/** @type {{ message?: string }} */ (body).message)
        : text.slice(0, 200);
    throw new Error(`Manyreach GET ${path} failed (${response.status}): ${message}`);
  }

  return body;
}

/** @param {string} apiKey */
export async function probeAuth(apiKey) {
  return manyreachGet(apiKey, '/tags', { limit: 1 });
}

/**
 * @param {string} apiKey
 * @param {string} campaignId
 */
export async function getCampaign(apiKey, campaignId) {
  return manyreachGet(apiKey, `/campaigns/${encodeURIComponent(campaignId)}`);
}

/**
 * @typedef {{ email?: string; sendingStatus?: string }} Prospect
 */

/**
 * @param {string} apiKey
 * @param {string} campaignId
 * @returns {Promise<Map<string, Prospect>>}
 */
export async function fetchAllCampaignProspects(apiKey, campaignId) {
  /** @type {Map<string, Prospect>} */
  const byEmail = new Map();
  let page = 1;

  while (true) {
    const query = {
      'includeCampaignIds.campaignIds': [campaignId],
      page,
      limit: PAGE_LIMIT,
    };

    const data = /** @type {{ items?: Prospect[]; pagination?: { nextCursor?: string | number; totalItems?: number; currentPage?: number; pageSize?: number } }} */ (
      await manyreachGet(apiKey, '/prospects', query)
    );

    const items = data.items ?? [];
    for (const prospect of items) {
      const email = prospect.email?.trim();
      if (!email) {
        continue;
      }
      byEmail.set(normalizeEmail(email), prospect);
    }

    const pagination = data.pagination;
    const fetchedSoFar = (page - 1) * PAGE_LIMIT + items.length;
    const hasMoreByTotal =
      pagination?.totalItems != null && fetchedSoFar < pagination.totalItems;
    const hasMoreByItems = items.length >= PAGE_LIMIT;

    if (!hasMoreByTotal && !hasMoreByItems) {
      break;
    }

    page += 1;
  }

  return byEmail;
}

/**
 * @typedef {{ toEmail?: string; createdAt?: string }} SentMessage
 */

/**
 * @param {string} apiKey
 * @param {string} campaignId
 * @returns {Promise<Map<string, string>>}
 */
export async function fetchEarliestSentByEmail(apiKey, campaignId) {
  /** @type {Map<string, string>} */
  const earliestByEmail = new Map();
  let page = 1;

  while (true) {
    const query = {
      type: 'Sent',
      campaignId,
      page,
      limit: PAGE_LIMIT,
    };

    const data = /** @type {{ items?: SentMessage[]; pagination?: { nextCursor?: string; totalItems?: number; currentPage?: number; pageSize?: number } }} */ (
      await manyreachGet(apiKey, '/messages', query)
    );

    const items = data.items ?? [];
    for (const message of items) {
      const toEmail = message.toEmail?.trim();
      const createdAt = message.createdAt;
      if (!toEmail || !createdAt) {
        continue;
      }
      const key = normalizeEmail(toEmail);
      const existing = earliestByEmail.get(key);
      if (!existing || Date.parse(createdAt) < Date.parse(existing)) {
        earliestByEmail.set(key, createdAt);
      }
    }

    const pagination = data.pagination;
    const fetchedSoFar = (page - 1) * PAGE_LIMIT + items.length;
    const hasMoreByTotal =
      pagination?.totalItems != null && fetchedSoFar < pagination.totalItems;
    const hasMoreByItems = items.length >= PAGE_LIMIT;

    if (!hasMoreByTotal && !hasMoreByItems) {
      break;
    }

    page += 1;
  }

  return earliestByEmail;
}

/** @param {string} email */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export { BASE_URL, PAGE_LIMIT };
