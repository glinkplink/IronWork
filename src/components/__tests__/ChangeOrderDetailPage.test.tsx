// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { BusinessProfile, ChangeOrder, Job } from '../../types/db';
import { ChangeOrderDetailPage } from '../ChangeOrderDetailPage';

vi.mock('../../lib/change-order-generator', () => ({
  generateChangeOrderHtml: () => '<div>Change Order Preview</div>',
}));

function minimalProfile(): BusinessProfile {
  return {
    id: 'prof-1',
    user_id: 'u1',
    business_name: 'Welder Co',
    owner_name: null,
    phone: null,
    email: null,
    address: null,
    google_business_profile_url: null,
    default_exclusions: [],
    default_assumptions: [],
    next_wo_number: 2,
    next_invoice_number: 1,
    default_warranty_period: 30,
    default_negotiation_period: 10,
    default_payment_methods: [],
    default_tax_rate: 0,
    default_late_payment_terms: '',
    default_payment_terms_days: 30,
    default_late_fee_rate: 0,
    default_card_fee_note: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
}

function minimalJob(): Job {
  return {
    id: 'job-1',
    user_id: 'u1',
    client_id: null,
    customer_name: 'Customer A',
    customer_phone: null,
    job_location: 'Here',
    job_type: 'repair',
    other_classification: null,
    asset_or_item_description: 'Thing',
    requested_work: 'Weld',
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
    customer_email: 'customer@example.com',
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
  };
}

function changeOrderWithEsign(status: ChangeOrder['esign_status']): ChangeOrder {
  const co: ChangeOrder = {
    id: 'co-1',
    user_id: 'u1',
    job_id: 'job-1',
    co_number: 1,
    description: 'Add support',
    reason: 'Needed for fit-up',
    status: 'pending_approval',
    requires_approval: true,
    line_items: [],
    time_amount: 0,
    time_unit: 'hours',
    time_note: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    esign_submission_id: 'sub-1',
    esign_submitter_id: 'submitter-1',
    esign_embed_src: 'https://example.com/sign',
    esign_status: status,
    esign_submission_state: 'sent',
    esign_submitter_state: 'sent',
    esign_sent_at: '2025-01-01T08:00:00Z',
    esign_opened_at: status === 'opened' || status === 'completed' ? '2025-01-01T09:00:00Z' : null,
    esign_completed_at: status === 'completed' ? '2025-01-01T10:00:00Z' : null,
    esign_declined_at: null,
    esign_decline_reason: null,
    esign_signed_document_url: status === 'completed' ? 'https://example.com/signed.pdf' : null,
  };
  return co;
}

describe('ChangeOrderDetailPage', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows copy signing link before the change order is signed', () => {
    render(
      <ChangeOrderDetailPage
        userId="u1"
        co={changeOrderWithEsign('sent')}
        job={minimalJob()}
        profile={minimalProfile()}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /copy signing link/i })).toBeInTheDocument();
  });

  it('hides copy signing link once the change order is signed', () => {
    render(
      <ChangeOrderDetailPage
        userId="u1"
        co={changeOrderWithEsign('completed')}
        job={minimalJob()}
        profile={minimalProfile()}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /copy signing link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view signed pdf/i })).toBeInTheDocument();
  });
});
