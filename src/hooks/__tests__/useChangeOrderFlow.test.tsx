// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChangeOrderFlow } from '../useChangeOrderFlow';
import type { ChangeOrder, Job } from '../../types/db';

function minimalJob(): Job {
  return {
    id: 'job-1',
    user_id: 'u1',
    client_id: null,
    customer_name: 'Customer',
    customer_phone: null,
    job_location: '123 Main',
    job_type: 'repair',
    other_classification: null,
    asset_or_item_description: 'Gate',
    requested_work: 'Repair hinge',
    materials_provided_by: null,
    installation_included: null,
    grinding_included: null,
    paint_or_coating_included: null,
    removal_or_disassembly_included: null,
    hidden_damage_possible: null,
    price_type: 'fixed',
    price: 100,
    deposit_required: null,
    payment_terms: null,
    target_completion_date: null,
    exclusions: [],
    assumptions: [],
    change_order_required: null,
    workmanship_warranty_days: null,
    status: 'active',
    wo_number: 1,
    agreement_date: null,
    contractor_phone: null,
    contractor_email: null,
    customer_email: null,
    governing_state: null,
    target_start: null,
    deposit_amount: null,
    late_payment_terms: null,
    payment_terms_days: null,
    late_fee_rate: null,
    negotiation_period: null,
    customer_obligations: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    esign_submission_id: null,
    esign_submitter_id: null,
    esign_embed_src: null,
    esign_status: 'not_sent',
    esign_submission_state: null,
    esign_submitter_state: null,
    esign_sent_at: null,
    esign_opened_at: null,
    esign_completed_at: null,
    esign_declined_at: null,
    esign_decline_reason: null,
    esign_signed_document_url: null,
    esign_resent_at: null,
    offline_signed_at: null,
  };
}

function minimalChangeOrder(): ChangeOrder {
  return {
    id: 'co-1',
    user_id: 'u1',
    job_id: 'job-1',
    co_number: 1,
    description: 'Extra weld',
    reason: 'Field change',
    status: 'pending_approval',
    requires_approval: true,
    line_items: [],
    time_amount: 0,
    time_unit: 'hours',
    time_note: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    esign_status: 'opened',
    esign_submission_id: null,
    esign_submitter_id: null,
    esign_embed_src: null,
    esign_submission_state: null,
    esign_submitter_state: null,
    esign_sent_at: null,
    esign_opened_at: null,
    esign_completed_at: null,
    esign_declined_at: null,
    esign_decline_reason: null,
    esign_signed_document_url: null,
  };
}

describe('useChangeOrderFlow', () => {
  it('returns to Work Orders when a change order was opened from the Work Orders list', () => {
    const navigateTo = vi.fn();
    const setChangeOrderListVersion = vi.fn();
    const job = minimalJob();
    const co = minimalChangeOrder();

    const { result } = renderHook(() =>
      useChangeOrderFlow(job, navigateTo, setChangeOrderListVersion)
    );

    act(() => {
      result.current.actions.handleOpenCODetail(co, 'work-orders');
    });

    expect(result.current.state.coDetailCO?.id).toBe('co-1');
    expect(result.current.state.coDetailBackTarget).toBe('work-orders');
    expect(navigateTo).toHaveBeenCalledWith('co-detail');

    act(() => {
      result.current.actions.handleBackFromCODetail();
    });

    expect(result.current.state.coDetailCO).toBeNull();
    expect(result.current.state.coDetailBackTarget).toBe('work-order-detail');
    expect(navigateTo).toHaveBeenLastCalledWith('work-orders');
  });
});
