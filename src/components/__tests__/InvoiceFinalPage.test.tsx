// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { BusinessProfile, Invoice, Job } from '../../types/db';
import { InvoiceFinalPage } from '../InvoiceFinalPage';

const fetchInvoicePdfBlob = vi.fn();
const downloadPdfBlobToFile = vi.fn();
const updateInvoice = vi.fn();
const getInvoice = vi.fn();
const sendInvoiceForSignature = vi.fn();
const resendInvoiceSignature = vi.fn();
const pollInvoiceEsignStatus = vi.fn();
const downloadSignedDocumentFile = vi.fn();
const buildDocusealProviderSignatureImage = vi.fn();
const buildInvoiceEsignSendPayload = vi.fn();
const buildInvoiceEsignNotificationMessage = vi.fn();

vi.mock('../../lib/agreement-pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/agreement-pdf')>();
  return {
    ...actual,
    fetchInvoicePdfBlob: (...args: unknown[]) => fetchInvoicePdfBlob(...args),
    downloadPdfBlobToFile: (...args: unknown[]) => downloadPdfBlobToFile(...args),
  };
});

vi.mock('../../lib/db/invoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/db/invoices')>();
  return {
    ...actual,
    updateInvoice: (...args: unknown[]) => updateInvoice(...args),
    getInvoice: (...args: unknown[]) => getInvoice(...args),
  };
});

vi.mock('../../lib/esign-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/esign-api')>();
  return {
    ...actual,
    sendInvoiceForSignature: (...args: unknown[]) => sendInvoiceForSignature(...args),
    resendInvoiceSignature: (...args: unknown[]) => resendInvoiceSignature(...args),
    pollInvoiceEsignStatus: (...args: unknown[]) => pollInvoiceEsignStatus(...args),
    downloadSignedDocumentFile: (...args: unknown[]) => downloadSignedDocumentFile(...args),
  };
});

vi.mock('../../hooks/useScaledPreview', () => ({
  useScaledPreview: () => ({
    viewportRef: { current: null },
    sheetRef: { current: null },
    scale: 1,
    spacerHeight: 400,
    spacerWidth: 300,
    letterWidthPx: 300,
  }),
}));

vi.mock('../../lib/docuseal-signature-image', () => ({
  buildDocusealProviderSignatureImage: (...args: unknown[]) =>
    buildDocusealProviderSignatureImage(...args),
}));

vi.mock('../../lib/docuseal-invoice-html', () => ({
  buildInvoiceEsignSendPayload: (...args: unknown[]) => buildInvoiceEsignSendPayload(...args),
  buildInvoiceEsignNotificationMessage: (...args: unknown[]) =>
    buildInvoiceEsignNotificationMessage(...args),
}));

function baseJob(): Job {
  return {
    id: 'job-1',
    user_id: 'u1',
    client_id: null,
    customer_name: 'Customer A',
    customer_phone: null,
    job_location: '123 Main St',
    job_type: 'repair',
    other_classification: null,
    asset_or_item_description: 'Gate',
    requested_work: 'Repair',
    materials_provided_by: null,
    installation_included: null,
    grinding_included: null,
    paint_or_coating_included: null,
    removal_or_disassembly_included: null,
    hidden_damage_possible: null,
    price_type: 'fixed',
    price: 250,
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

function baseProfile(): BusinessProfile {
  return {
    id: 'prof-1',
    user_id: 'u1',
    business_name: 'Welder Co',
    owner_name: 'Billy Welder',
    phone: '555-111-2222',
    email: 'welder@example.com',
    address: null,
    google_business_profile_url: null,
    default_exclusions: [],
    default_assumptions: [],
    next_wo_number: 2,
    next_invoice_number: 2,
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

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    user_id: 'u1',
    job_id: 'job-1',
    invoice_number: 1,
    invoice_date: '2025-01-02',
    due_date: '2025-01-16',
    status: 'draft',
    issued_at: null,
    line_items: [],
    subtotal: 250,
    tax_rate: 0,
    tax_amount: 0,
    total: 250,
    payment_methods: ['Cash'],
    notes: null,
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
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
    ...overrides,
  };
}

function renderPage(initialInvoice: Invoice = baseInvoice()) {
  const onWorkOrders = vi.fn();
  const onEditInvoice = vi.fn();

  function Harness() {
    const [invoice, setInvoice] = useState(initialInvoice);
    return (
      <InvoiceFinalPage
        invoice={invoice}
        job={baseJob()}
        profile={baseProfile()}
        onWorkOrders={onWorkOrders}
        onEditInvoice={onEditInvoice}
        onInvoiceUpdated={setInvoice}
      />
    );
  }

  render(<Harness />);
  return { onWorkOrders, onEditInvoice };
}

describe('InvoiceFinalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInvoicePdfBlob.mockResolvedValue(new Blob(['pdf']));
    updateInvoice.mockResolvedValue({ data: null, error: null });
    getInvoice.mockResolvedValue(baseInvoice());
    buildDocusealProviderSignatureImage.mockResolvedValue('data:image/png;base64,abc');
    buildInvoiceEsignSendPayload.mockReturnValue({ documents: [{ html: '<p>Invoice</p>' }] });
    buildInvoiceEsignNotificationMessage.mockReturnValue({
      subject: 'Invoice',
      body: 'Please sign',
    });
    const sentResponse = {
      invoiceId: 'inv-1',
      jobId: 'job-1',
      issued_at: '2025-01-03T10:00:00Z',
      esign_submission_id: 'sub-1',
      esign_submitter_id: 'submitter-1',
      esign_embed_src: 'https://example.com/sign',
      esign_status: 'sent',
      esign_submission_state: 'sent',
      esign_submitter_state: 'sent',
      esign_sent_at: '2025-01-03T10:00:00Z',
      esign_opened_at: null,
      esign_completed_at: null,
      esign_declined_at: null,
      esign_decline_reason: null,
      esign_signed_document_url: null,
    };
    sendInvoiceForSignature.mockResolvedValue(sentResponse);
    resendInvoiceSignature.mockResolvedValue(sentResponse);
    pollInvoiceEsignStatus.mockResolvedValue(sentResponse);
  });

  afterEach(() => {
    cleanup();
  });

  it('sends a draft invoice for signature, stamps issuance, and swaps to resend state', async () => {
    const user = userEvent.setup();
    const { onEditInvoice } = renderPage();

    expect(screen.getByText('Ready to send for signature.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send invoice/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit invoice/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /send invoice/i }));

    await waitFor(() => {
      expect(sendInvoiceForSignature).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ documents: expect.any(Array) })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend invoice/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Signature request sent to customer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy signing link/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit invoice/i })).toBeNull();
    expect(onEditInvoice).not.toHaveBeenCalled();
  });

  it('downloads the invoice PDF without navigating away', async () => {
    const user = userEvent.setup();
    const { onWorkOrders } = renderPage();

    await user.click(screen.getByRole('button', { name: /^Download Invoice$/i }));

    await waitFor(() => {
      expect(fetchInvoicePdfBlob).toHaveBeenCalledTimes(1);
      expect(downloadPdfBlobToFile).toHaveBeenCalledTimes(1);
    });
    expect(onWorkOrders).not.toHaveBeenCalled();
  });

  it('shows signed invoice controls for completed e-sign state', async () => {
    const user = userEvent.setup();
    renderPage(
      baseInvoice({
        issued_at: '2025-01-03T10:00:00Z',
        esign_submission_id: 'sub-1',
        esign_submitter_id: 'submitter-1',
        esign_status: 'completed',
        esign_sent_at: '2025-01-03T10:00:00Z',
        esign_opened_at: '2025-01-03T10:05:00Z',
        esign_completed_at: '2025-01-03T10:10:00Z',
        esign_signed_document_url: 'https://example.com/signed.pdf',
      })
    );

    expect(screen.getByText('Invoice has been signed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download signed pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resend invoice/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /download signed pdf/i }));

    await waitFor(() => {
      expect(downloadSignedDocumentFile).toHaveBeenCalledWith('https://example.com/signed.pdf');
    });
  });
});
