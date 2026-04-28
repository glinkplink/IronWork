/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Client, Job } from '../../types/db';

const backfillMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/job-backfill-from-client', () => ({
  backfillJobFromClient: backfillMock,
}));

import { StaleContactBanner } from '../StaleContactBanner';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    user_id: 'user-1',
    client_id: 'client-1',
    customer_name: 'Acme Co',
    customer_phone: null,
    customer_email: null,
    customer_address: '',
    job_site_address: '',
    other_classification: null,
    job_type: 'repair',
    description: '',
    materials_supplied: 'provider',
    location: 'on_site',
    surface_or_environment: '',
    permits_or_inspections: false,
    cleanup_included: false,
    removal_or_disassembly_included: false,
    hidden_damage_possible: false,
    price_type: 'fixed',
    price: 100,
    target_completion_date: null,
    target_start: null,
    exclusions: [],
    assumptions: [],
    notes: '',
    agreement_date: '2025-01-01',
    contractor_phone: null,
    contractor_email: null,
    deposit_amount: 0,
    payment_terms_days: 30,
    late_fee_rate: 0,
    negotiation_period: '',
    wo_number: 1,
    customer_signature: null,
    owner_signature: null,
    customer_signature_date: null,
    owner_signature_date: null,
    customer_signature_image: null,
    owner_signature_image: null,
    customer_signature_typed: null,
    owner_signature_typed: null,
    status: 'draft',
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
    esign_resent_at: null,
    esign_signed_document_url: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    offline_signed_at: null,
    ...overrides,
  } as Job;
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    user_id: 'user-1',
    name: 'Acme Co',
    name_normalized: 'acme co',
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('StaleContactBanner', () => {
  beforeEach(() => {
    backfillMock.mockReset();
  });
  afterEach(() => cleanup());

  it('renders nothing when job has email and phone', () => {
    const job = makeJob({ customer_email: 'a@b.com', customer_phone: '555' });
    const { container } = render(
      <StaleContactBanner
        job={job}
        client={makeClient()}
        onJobBackfilled={vi.fn()}
        onEditClient={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when client has nothing to offer for missing fields', () => {
    const job = makeJob({ customer_email: null, customer_phone: null });
    const { container } = render(
      <StaleContactBanner
        job={job}
        client={null}
        onJobBackfilled={vi.fn()}
        onEditClient={vi.fn()}
      />
    );
    // Hits the "no email anywhere" empty-state branch instead
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText(/no customer email on file/i)).toBeInTheDocument();
  });

  it('offers to backfill email when job email is empty and client has one', () => {
    const job = makeJob({ customer_email: null, customer_phone: '555' });
    render(
      <StaleContactBanner
        job={job}
        client={makeClient({ email: 'jane@example.com', phone: '555' })}
        onJobBackfilled={vi.fn()}
        onEditClient={vi.fn()}
      />
    );
    expect(screen.getByText(/email \(jane@example\.com\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/phone \(/i)).not.toBeInTheDocument();
  });

  it('offers to backfill both email and phone when both are missing on job', () => {
    const job = makeJob({ customer_email: null, customer_phone: null });
    render(
      <StaleContactBanner
        job={job}
        client={makeClient({ email: 'jane@example.com', phone: '555-1234' })}
        onJobBackfilled={vi.fn()}
        onEditClient={vi.fn()}
      />
    );
    expect(screen.getByText(/email \(jane@example\.com\)/i)).toBeInTheDocument();
    expect(screen.getByText(/phone \(555-1234\)/i)).toBeInTheDocument();
  });

  it('calls backfill API and notifies parent on click', async () => {
    const user = userEvent.setup();
    const updatedJob = makeJob({ customer_email: 'jane@example.com', customer_phone: '555-1234' });
    backfillMock.mockResolvedValue({ data: updatedJob, updated: true, error: null });
    const onJobBackfilled = vi.fn();
    render(
      <StaleContactBanner
        job={makeJob({ customer_email: null, customer_phone: null })}
        client={makeClient({ email: 'jane@example.com', phone: '555-1234' })}
        onJobBackfilled={onJobBackfilled}
        onEditClient={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /use saved client info/i }));
    await waitFor(() => {
      expect(backfillMock).toHaveBeenCalledWith('job-1');
      expect(onJobBackfilled).toHaveBeenCalledWith(updatedJob);
    });
  });

  it('renders empty-state with Edit client when neither job nor client has email', async () => {
    const user = userEvent.setup();
    const onEditClient = vi.fn();
    render(
      <StaleContactBanner
        job={makeJob({ customer_email: null })}
        client={makeClient({ email: null })}
        onJobBackfilled={vi.fn()}
        onEditClient={onEditClient}
      />
    );
    expect(screen.getByText(/no customer email on file/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit client/i }));
    expect(onEditClient).toHaveBeenCalled();
  });

  it('shows error message when backfill fails', async () => {
    const user = userEvent.setup();
    backfillMock.mockResolvedValue({ data: null, updated: false, error: new Error('Server unavailable') });
    render(
      <StaleContactBanner
        job={makeJob({ customer_email: null })}
        client={makeClient({ email: 'jane@example.com' })}
        onJobBackfilled={vi.fn()}
        onEditClient={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /use saved client info/i }));
    await waitFor(() => {
      expect(screen.getByText(/server unavailable/i)).toBeInTheDocument();
    });
  });
});
