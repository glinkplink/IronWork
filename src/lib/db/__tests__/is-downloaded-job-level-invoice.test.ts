import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
}));

vi.mock('../../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () =>
            Promise.resolve({
              get data() {
                return mockState.rows;
              },
              get error() {
                return mockState.error;
              },
            }),
        }),
      }),
    }),
  },
}));

import { getBlocksNewChangeOrdersForJob, isDownloadedJobLevelInvoiceRow } from '../invoices';

describe('isDownloadedJobLevelInvoiceRow', () => {
  it('is true for downloaded with no change_order_id on lines', () => {
    expect(
      isDownloadedJobLevelInvoiceRow({
        status: 'downloaded',
        line_items: [{ description: 'Scope' }],
      })
    ).toBe(true);
    expect(isDownloadedJobLevelInvoiceRow({ status: 'downloaded', line_items: [] })).toBe(true);
  });

  it('is false for draft job-level rows', () => {
    expect(
      isDownloadedJobLevelInvoiceRow({
        status: 'draft',
        line_items: [{ description: 'Scope' }],
      })
    ).toBe(false);
  });

  it('is false when any line has change_order_id', () => {
    expect(
      isDownloadedJobLevelInvoiceRow({
        status: 'downloaded',
        line_items: [{ change_order_id: 'co-1' }],
      })
    ).toBe(false);
    expect(
      isDownloadedJobLevelInvoiceRow({
        status: 'downloaded',
        line_items: [{ description: 'x' }, { change_order_id: 'co-1' }],
      })
    ).toBe(false);
  });
});

describe('getBlocksNewChangeOrdersForJob', () => {
  beforeEach(() => {
    mockState.rows = [];
    mockState.error = null;
  });

  it('returns blocks true when a downloaded job-level row exists', async () => {
    mockState.rows = [{ status: 'downloaded', line_items: [] }];
    const result = await getBlocksNewChangeOrdersForJob('u1', 'j1');
    expect(result.error).toBeNull();
    expect(result.blocks).toBe(true);
  });

  it('returns blocks false when only CO-scoped downloaded rows exist', async () => {
    mockState.rows = [{ status: 'downloaded', line_items: [{ change_order_id: 'co-1' }] }];
    const result = await getBlocksNewChangeOrdersForJob('u1', 'j1');
    expect(result.error).toBeNull();
    expect(result.blocks).toBe(false);
  });

  it('returns blocks false for draft job-level only', async () => {
    mockState.rows = [{ status: 'draft', line_items: [{ description: 'x' }] }];
    const result = await getBlocksNewChangeOrdersForJob('u1', 'j1');
    expect(result.error).toBeNull();
    expect(result.blocks).toBe(false);
  });

  it('fail-closes on query error', async () => {
    mockState.error = { message: 'network failed' };
    const result = await getBlocksNewChangeOrdersForJob('u1', 'j1');
    expect(result.blocks).toBe(true);
    expect(result.error?.message).toContain('network failed');
  });
});
