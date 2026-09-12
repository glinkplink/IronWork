/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_URL,
  buildQueryString,
  fetchAllCampaignProspects,
  fetchEarliestSentByEmail,
  getCampaign,
  manyreachGet,
  normalizeEmail,
  probeAuth,
} from '../manyreach.mjs';

describe('buildQueryString', () => {
  it('serializes campaign filter and pagination without pageQuery keys', () => {
    const qs = buildQueryString({
      'includeCampaignIds.campaignIds': ['123'],
      page: 1,
      limit: 30,
    });
    expect(qs).toBe('includeCampaignIds.campaignIds=123&page=1&limit=30');
    expect(qs).not.toContain('pageQuery');
    expect(qs).not.toContain('[');
  });

  it('serializes message filters with campaignId', () => {
    const qs = buildQueryString({
      type: 'Sent',
      campaignId: 456,
      page: 2,
      limit: 30,
    });
    expect(qs).toBe('type=Sent&campaignId=456&page=2&limit=30');
  });
});

describe('manyreachGet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls GET with X-API-Key and surfaces API errors', async () => {
    vi.mocked(fetch).mockResolvedValue(
      /** @type {Response} */ ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Invalid API key' }),
      })
    );

    await expect(manyreachGet('bad-key', '/tags')).rejects.toThrow(
      'Manyreach GET /tags failed (401): Invalid API key'
    );

    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/tags`, {
      method: 'GET',
      headers: {
        'X-API-Key': 'bad-key',
        Accept: 'application/json',
      },
      signal: expect.any(AbortSignal),
    });
  });

  it('exits on HTTP 429', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(fetch).mockResolvedValue(
      /** @type {Response} */ ({
        ok: false,
        status: 429,
        text: async () => '{}',
      })
    );

    await expect(manyreachGet('key', '/tags')).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith(
      'Manyreach rate limit exceeded (HTTP 429). Wait and rerun the command.'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('pagination helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('paginates prospects across multiple pages', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        pageResponse({
          items: [{ email: 'a@example.com', sendingStatus: 'NotSet' }],
          pagination: { currentPage: 1, pageSize: 30, totalItems: 2 },
        })
      )
      .mockResolvedValueOnce(
        pageResponse({
          items: [{ email: 'b@example.com', sendingStatus: 'Interested' }],
          pagination: { currentPage: 2, pageSize: 30, totalItems: 2 },
        })
      );

    const map = await fetchAllCampaignProspects('key', '99');
    expect(map.size).toBe(2);
    expect(map.get(normalizeEmail('a@example.com'))?.sendingStatus).toBe('NotSet');
    expect(map.get(normalizeEmail('b@example.com'))?.sendingStatus).toBe('Interested');

    const firstUrl = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(firstUrl).toContain('/prospects?');
    expect(firstUrl).toContain('includeCampaignIds.campaignIds=99');
    expect(firstUrl).toContain('page=1');
    expect(firstUrl).toContain('limit=30');

    const secondUrl = String(vi.mocked(fetch).mock.calls[1][0]);
    expect(secondUrl).toContain('page=2');
    expect(secondUrl).not.toContain('startingAfter');
  });

  it('paginates sent messages and scopes by campaignId', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        pageResponse({
          items: [
            { toEmail: 'x@example.com', createdAt: '2026-01-02T12:00:00Z' },
          ],
          pagination: { currentPage: 1, pageSize: 30, totalItems: 2 },
        })
      )
      .mockResolvedValueOnce(
        pageResponse({
          items: [
            { toEmail: 'x@example.com', createdAt: '2026-01-01T12:00:00Z' },
            { toEmail: 'y@example.com', createdAt: '2026-01-03T12:00:00Z' },
          ],
          pagination: { currentPage: 2, pageSize: 30, totalItems: 2 },
        })
      );

    const map = await fetchEarliestSentByEmail('key', '55');
    expect(map.get(normalizeEmail('x@example.com'))).toBe('2026-01-01T12:00:00Z');
    expect(map.get(normalizeEmail('y@example.com'))).toBe('2026-01-03T12:00:00Z');

    const firstUrl = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(firstUrl).toContain('/messages?');
    expect(firstUrl).toContain('type=Sent');
    expect(firstUrl).toContain('campaignId=55');

    const secondUrl = String(vi.mocked(fetch).mock.calls[1][0]);
    expect(secondUrl).toContain('page=2');
    expect(secondUrl).not.toContain('startingAfter');
  });

  it('probeAuth and getCampaign use GET paths', async () => {
    vi.mocked(fetch).mockResolvedValue(pageResponse({ items: [] }));

    await probeAuth('key');
    await getCampaign('key', '7');

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/tags');
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/campaigns/7');
  });
});

/** @param {unknown} body */
function pageResponse(body) {
  return /** @type {Response} */ ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
}
