/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

// @ts-expect-error Test imports a server-only JS module through the Vitest alias.
import { tryHandleJobsRoute } from '@scope-server/jobs-routes.mjs';

const USER_UUID = '660e8400-e29b-41d4-a716-446655440001';
const JOB_UUID = '880e8400-e29b-41d4-a716-446655440003';
const CLIENT_UUID = '990e8400-e29b-41d4-a716-446655440004';

function captureRes() {
  let status = 0;
  let body = '';
  return {
    get status() {
      return status;
    },
    get body() {
      return body;
    },
    writeHead(code: number) {
      status = code;
    },
    end(chunk: string) {
      body = chunk;
    },
  };
}

function helpers() {
  return {
    readJsonBody: async () => ({}),
    sendJson(res: unknown, code: number, payload: unknown) {
      const r = res as ReturnType<typeof captureRes>;
      r.writeHead(code);
      r.end(JSON.stringify(payload));
    },
    sendText(res: unknown, code: number, message: string) {
      const r = res as ReturnType<typeof captureRes>;
      r.writeHead(code);
      r.end(message);
    },
  };
}

type JobRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

type ClientRow = {
  id: string;
  email: string | null;
  phone: string | null;
};

function fullJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_UUID,
    user_id: USER_UUID,
    client_id: null,
    customer_email: null,
    customer_phone: null,
    last_downloaded_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockSupabase(opts: {
  job: JobRow | null;
  client: ClientRow | null;
  updated?: Partial<JobRow> & { id: string };
}) {
  const update = vi.fn();
  const updateSingle = vi.fn(async () => ({
    data: { ...(opts.job ?? { id: JOB_UUID }), ...(opts.updated ?? {}) },
    error: null,
  }));
  update.mockReturnValue({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({ single: updateSingle })),
      })),
    })),
  });

  const jobMaybeSingle = vi.fn(async () => ({ data: opts.job, error: null }));
  const jobLoadEqUser = vi.fn(() => ({ maybeSingle: jobMaybeSingle }));
  const jobLoadEqId = vi.fn(() => ({ eq: jobLoadEqUser }));

  const clientMaybeSingle = vi.fn(async () => ({ data: opts.client, error: null }));
  const clientLoadEqUser = vi.fn(() => ({ maybeSingle: clientMaybeSingle }));
  const clientLoadEqId = vi.fn(() => ({ eq: clientLoadEqUser }));

  const from = vi.fn((table: string) => {
    if (table === 'jobs') return { select: vi.fn(() => ({ eq: jobLoadEqId })), update };
    if (table === 'clients') return { select: vi.fn(() => ({ eq: clientLoadEqId })) };
    return { select: vi.fn(() => ({ eq: jobLoadEqId })) };
  });

  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_UUID } }, error: null })) },
    from,
  };
  createClientMock.mockReturnValue(supabase);
  return { update, updateSingle };
}

describe('tryHandleJobsRoute backfill-from-client', () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    prevEnv.SUPABASE_URL = process.env.SUPABASE_URL;
    prevEnv.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    createClientMock.mockReset();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  });

  afterEach(() => {
    process.env.SUPABASE_URL = prevEnv.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('returns 401 without authorization', async () => {
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/backfill-from-client`,
        headers: {},
      },
      res,
      helpers()
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when job is not found', async () => {
    mockSupabase({ job: null, client: null });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/backfill-from-client`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when job has no linked client', async () => {
    mockSupabase({
      job: {
        id: JOB_UUID,
        user_id: USER_UUID,
        client_id: null,
        customer_email: '',
        customer_phone: '',
      },
      client: null,
    });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/backfill-from-client`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(409);
  });

  it('writes email and phone from client into job when both job fields are empty', async () => {
    const { update } = mockSupabase({
      job: {
        id: JOB_UUID,
        user_id: USER_UUID,
        client_id: CLIENT_UUID,
        customer_email: '',
        customer_phone: '',
      },
      client: { id: CLIENT_UUID, email: 'jane@example.com', phone: '555-1234' },
      updated: {
        id: JOB_UUID,
        customer_email: 'jane@example.com',
        customer_phone: '555-1234',
      },
    });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/backfill-from-client`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      customer_email: 'jane@example.com',
      customer_phone: '555-1234',
    });
    expect(JSON.parse(res.body).updated).toBe(true);
  });

  it('only fills empty fields, leaving job-populated fields untouched', async () => {
    const { update } = mockSupabase({
      job: {
        id: JOB_UUID,
        user_id: USER_UUID,
        client_id: CLIENT_UUID,
        customer_email: 'job@example.com',
        customer_phone: '',
      },
      client: { id: CLIENT_UUID, email: 'client@example.com', phone: '555-9999' },
      updated: { id: JOB_UUID, customer_phone: '555-9999' },
    });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/backfill-from-client`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ customer_phone: '555-9999' });
  });

  it('returns updated:false when nothing to backfill', async () => {
    mockSupabase({
      job: {
        id: JOB_UUID,
        user_id: USER_UUID,
        client_id: CLIENT_UUID,
        customer_email: 'job@example.com',
        customer_phone: '555-1234',
      },
      client: { id: CLIENT_UUID, email: 'client@example.com', phone: '555-9999' },
    });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/backfill-from-client`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).updated).toBe(false);
  });
});

describe('tryHandleJobsRoute mark-downloaded', () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    prevEnv.SUPABASE_URL = process.env.SUPABASE_URL;
    prevEnv.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    createClientMock.mockReset();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  });

  afterEach(() => {
    process.env.SUPABASE_URL = prevEnv.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.SUPABASE_SERVICE_ROLE_KEY;
  });

  function mockDownloadSupabase(opts: {
    job: Record<string, unknown> | null;
    updated?: Record<string, unknown>;
  }) {
    const update = vi.fn();
    const updateSingle = vi.fn(async () => ({
      data: opts.updated ?? fullJobRow({ last_downloaded_at: '2025-01-02T00:00:00Z' }),
      error: null,
    }));
    update.mockReturnValue({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({ single: updateSingle })),
        })),
      })),
    });

    const jobMaybeSingle = vi.fn(async () => ({ data: opts.job, error: null }));
    const freshMaybeSingle = vi.fn(async () => ({ data: opts.job, error: null }));
    const jobLoadEqUser = vi.fn(() => ({ maybeSingle: jobMaybeSingle }));
    const freshLoadEqUser = vi.fn(() => ({ maybeSingle: freshMaybeSingle }));
    const jobLoadEqId = vi.fn(() => ({ eq: jobLoadEqUser }));
    const freshLoadEqId = vi.fn(() => ({ eq: freshLoadEqUser }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ eq: jobLoadEqId })
      .mockReturnValue({ eq: freshLoadEqId });
    const from = vi.fn(() => ({ select, update }));

    const supabase = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_UUID } }, error: null })) },
      from,
    };
    createClientMock.mockReturnValue(supabase);
    return { update };
  }

  it('returns 401 without authorization', async () => {
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/mark-downloaded`,
        headers: {},
      },
      res,
      helpers()
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when job is not found', async () => {
    mockDownloadSupabase({ job: null });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/mark-downloaded`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(404);
  });

  it('marks a work order as downloaded', async () => {
    const { update } = mockDownloadSupabase({ job: fullJobRow() });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/mark-downloaded`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ last_downloaded_at: expect.any(String) });
    expect(JSON.parse(res.body).updated).toBe(true);
  });

  it('returns 200 idempotently when work order is already downloaded', async () => {
    const { update } = mockDownloadSupabase({
      job: fullJobRow({ last_downloaded_at: '2025-01-02T00:00:00Z' }),
    });
    const res = captureRes();
    await tryHandleJobsRoute(
      {
        method: 'POST',
        url: `/api/jobs/${JOB_UUID}/mark-downloaded`,
        headers: { authorization: 'Bearer token' },
      },
      res,
      helpers()
    );
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).updated).toBe(false);
  });
});
