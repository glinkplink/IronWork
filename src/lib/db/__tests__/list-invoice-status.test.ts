import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const supabaseState: { rows: unknown[]; error: { message: string } | null } = {
  rows: [],
  error: null,
};

vi.mock('../../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({
                get data() {
                  return supabaseState.rows;
                },
                get error() {
                  return supabaseState.error;
                },
              }),
          }),
          order: () =>
            Promise.resolve({
              get data() {
                return supabaseState.rows;
              },
              get error() {
                return supabaseState.error;
              },
            }),
        }),
      }),
    }),
  },
}));

import {
  changeOrderInvoiceStatusMapFromRows,
  invoiceStatusMapFromRows,
  listInvoiceStatusByChangeOrder,
  listInvoiceStatusByJob,
} from '../invoices';

describe('invoiceStatusMapFromRows', () => {
  it('keeps the first row per job_id (latest when input is created_at desc)', () => {
    const map = invoiceStatusMapFromRows([
      {
        id: 'inv-new',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 2,
        created_at: '2025-02-02T00:00:00Z',
      },
      {
        id: 'inv-old',
        job_id: 'j1',
        status: 'downloaded',
        invoice_number: 1,
        created_at: '2025-01-01T00:00:00Z',
      },
    ]);
    expect(map.get('j1')?.id).toBe('inv-new');
  });
});

describe('changeOrderInvoiceStatusMapFromRows', () => {
  it('keeps the first row per change_order_id (latest when input is created_at desc)', () => {
    const map = changeOrderInvoiceStatusMapFromRows([
      {
        id: 'inv-new',
        job_id: 'j1',
        change_order_id: 'co-1',
        status: 'draft',
        invoice_number: 2,
        created_at: '2025-02-02T00:00:00Z',
      },
      {
        id: 'inv-old',
        job_id: 'j1',
        change_order_id: 'co-1',
        status: 'downloaded',
        invoice_number: 1,
        created_at: '2025-01-01T00:00:00Z',
      },
    ]);
    expect(map.get('co-1')?.id).toBe('inv-new');
  });
});

describe('listInvoiceStatusByJob', () => {
  beforeEach(() => {
    supabaseState.rows = [];
    supabaseState.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns mapped rows when all rows are valid', async () => {
    supabaseState.rows = [
      {
        id: 'i1',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
        line_items: [],
      },
    ];
    const result = await listInvoiceStatusByJob('user-1');
    expect(result.error).toBeNull();
    expect(result.warning).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'i1',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
      },
    ]);
  });

  it('returns query error when Supabase errors', async () => {
    supabaseState.error = { message: 'network' };
    const result = await listInvoiceStatusByJob('user-1');
    expect(result.data).toBeNull();
    expect(result.warning).toBeNull();
    expect(result.error?.message).toContain('network');
  });

  it('returns partial data, warning, and logs when any row is malformed', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseState.rows = [
      {
        id: 'i-good',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
        line_items: [],
      },
      {
        id: 'i-bad',
        job_id: 'j2',
        status: 'draft',
        invoice_number: 'nope',
        created_at: '2025-01-01T00:00:00Z',
        line_items: [],
      },
    ];
    const result = await listInvoiceStatusByJob('user-1');
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'i-good',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
      },
    ]);
    expect(result.warning).toMatch(/skipped/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('skips CO-scoped invoices so WO status only reflects true work-order invoices', async () => {
    supabaseState.rows = [
      {
        id: 'i-co',
        job_id: 'j1',
        status: 'downloaded',
        invoice_number: 2,
        created_at: '2025-01-03T00:00:00Z',
        line_items: [{ change_order_id: 'co-1' }],
      },
      {
        id: 'i-wo',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
        line_items: [{ description: 'Original scope' }],
      },
    ];
    const result = await listInvoiceStatusByJob('user-1');
    expect(result.error).toBeNull();
    expect(result.warning).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'i-wo',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
      },
    ]);
  });
});

describe('listInvoiceStatusByChangeOrder', () => {
  beforeEach(() => {
    supabaseState.rows = [];
    supabaseState.error = null;
  });

  it('maps rows with exactly one change_order_id in line items', async () => {
    supabaseState.rows = [
      {
        id: 'i1',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
        line_items: [{ change_order_id: 'co-1' }],
      },
    ];
    const result = await listInvoiceStatusByChangeOrder('user-1', 'j1');
    expect(result.error).toBeNull();
    expect(result.warning).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'i1',
        job_id: 'j1',
        change_order_id: 'co-1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
      },
    ]);
  });

  it('skips rows without a single change order anchor', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseState.rows = [
      {
        id: 'i-good',
        job_id: 'j1',
        status: 'downloaded',
        invoice_number: 2,
        created_at: '2025-01-03T00:00:00Z',
        line_items: [{ change_order_id: 'co-1' }],
      },
      {
        id: 'i-bad',
        job_id: 'j1',
        status: 'draft',
        invoice_number: 1,
        created_at: '2025-01-02T00:00:00Z',
        line_items: [{ change_order_id: 'co-1' }, { change_order_id: 'co-2' }],
      },
    ];
    const result = await listInvoiceStatusByChangeOrder('user-1', 'j1');
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'i-good',
        job_id: 'j1',
        change_order_id: 'co-1',
        status: 'downloaded',
        invoice_number: 2,
        created_at: '2025-01-03T00:00:00Z',
      },
    ]);
    expect(result.warning).toMatch(/skipped/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
