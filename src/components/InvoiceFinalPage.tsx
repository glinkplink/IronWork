import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Job, BusinessProfile, Invoice } from '../types/db';
import { generateInvoiceHtml } from '../lib/invoice-generator';
import { getInvoice, getInvoiceBusinessStatus, updateInvoice } from '../lib/db/invoices';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { useScaledPreview } from '../hooks/useScaledPreview';
import {
  downloadPdfBlobToFile,
  fetchInvoicePdfBlob,
  getInvoicePdfFilename,
} from '../lib/agreement-pdf';
import {
  downloadSignedDocumentFile,
  mergeEsignResponseIntoInvoice,
  pollInvoiceEsignStatus,
  resendInvoiceSignature,
  sendInvoiceForSignature,
} from '../lib/esign-api';
import {
  buildInvoiceEsignNotificationMessage,
  buildInvoiceEsignSendPayload,
} from '../lib/docuseal-invoice-html';
import { buildDocusealProviderSignatureImage } from '../lib/docuseal-signature-image';
import { formatEsignTimestamp, shouldPollEsignStatus } from '../lib/esign-live';
import { getEsignProgressModel } from '../lib/esign-progress';
import { useEsignPoller } from '../hooks/useEsignPoller';
import './InvoiceFinalPage.css';

interface InvoiceFinalPageProps {
  invoice: Invoice;
  job: Job;
  profile: BusinessProfile;
  onWorkOrders: () => void;
  onEditInvoice: () => void;
  onInvoiceUpdated: (invoice: Invoice) => void;
}

export function InvoiceFinalPage({
  invoice: invoiceProp,
  job,
  profile,
  onWorkOrders,
  onEditInvoice,
  onInvoiceUpdated,
}: InvoiceFinalPageProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(() => invoiceProp.notes ?? '');
  const [downloadError, setDownloadError] = useState('');
  const [notesError, setNotesError] = useState('');
  const [esignError, setEsignError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [esignBusy, setEsignBusy] = useState(false);
  const [signedDocBusy, setSignedDocBusy] = useState(false);
  const [signingLinkCopied, setSigningLinkCopied] = useState(false);

  const documentRef = useRef<HTMLDivElement | null>(null);
  const copySigningLinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewHtml = generateInvoiceHtml(invoiceProp, job, profile);
  const businessStatus = getInvoiceBusinessStatus(invoiceProp);
  const isIssued = businessStatus === 'invoiced';
  const isReadOnly = isIssued;
  const customerTitle = job.customer_name.trim() || 'Customer';
  const invoiceSubline = `Invoice #${String(invoiceProp.invoice_number).padStart(4, '0')}`;
  const esignProgress = useMemo(
    () => getEsignProgressModel(invoiceProp.esign_status, 'invoice'),
    [invoiceProp.esign_status]
  );
  const showCopySigningLink = Boolean(
    invoiceProp.esign_embed_src && invoiceProp.esign_status !== 'completed'
  );

  const {
    viewportRef: previewViewportRef,
    sheetRef: previewSheetRef,
    scale: previewScale,
    spacerHeight,
    spacerWidth,
    letterWidthPx,
  } = useScaledPreview(invoiceProp, job, profile);

  useEffect(() => {
    setNotesDraft(invoiceProp.notes ?? '');
  }, [invoiceProp.id, invoiceProp.notes]);

  useEffect(() => {
    setSigningLinkCopied(false);
    if (copySigningLinkTimeoutRef.current !== null) {
      clearTimeout(copySigningLinkTimeoutRef.current);
      copySigningLinkTimeoutRef.current = null;
    }
  }, [invoiceProp.id, invoiceProp.esign_embed_src]);

  useEffect(() => {
    return () => {
      if (copySigningLinkTimeoutRef.current !== null) {
        clearTimeout(copySigningLinkTimeoutRef.current);
      }
    };
  }, []);

  const refreshInvoiceRow = useCallback(async () => {
    try {
      const response = await pollInvoiceEsignStatus(invoiceProp.id);
      const updatedInvoice = mergeEsignResponseIntoInvoice(invoiceProp, response);
      onInvoiceUpdated(updatedInvoice);
      return updatedInvoice;
    } catch {
      const row = await getInvoice(invoiceProp.id);
      if (row) onInvoiceUpdated(row);
      return row;
    }
  }, [invoiceProp, onInvoiceUpdated]);

  useEsignPoller({
    enabled: shouldPollEsignStatus(invoiceProp.esign_status),
    pollOnce: async () => {
      const row = await refreshInvoiceRow();
      if (!row) return false;
      return shouldPollEsignStatus(row.esign_status);
    },
  });

  const handleDownload = async () => {
    setDownloadError('');
    if (!documentRef.current) {
      setDownloadError('Preview is not ready. Try again.');
      return;
    }
    setDownloading(true);
    try {
      const blob = await fetchInvoicePdfBlob(invoiceProp, job, profile, documentRef.current);
      downloadPdfBlobToFile(
        blob,
        getInvoicePdfFilename(invoiceProp.invoice_number, job.customer_name)
      );
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSendForSignature = async () => {
    setEsignError('');
    if (!(job.customer_email || '').trim()) {
      setEsignError('Customer email is missing on this work order. Edit the job to add it.');
      return;
    }
    setEsignBusy(true);
    try {
      const providerSignatureDataUrl = await buildDocusealProviderSignatureImage(
        profile?.owner_name?.trim() || profile.business_name.trim()
      );
      const payload = buildInvoiceEsignSendPayload(invoiceProp, job, profile, {
        providerSignatureDataUrl,
      });
      const response = await sendInvoiceForSignature(invoiceProp.id, payload);
      onInvoiceUpdated(mergeEsignResponseIntoInvoice(invoiceProp, response));
      await refreshInvoiceRow();
    } catch (e) {
      setEsignError(e instanceof Error ? e.message : 'Failed to send invoice for signature.');
    } finally {
      setEsignBusy(false);
    }
  };

  const handleResendSignature = async () => {
    setEsignError('');
    setEsignBusy(true);
    try {
      const response = await resendInvoiceSignature(
        invoiceProp.id,
        buildInvoiceEsignNotificationMessage(invoiceProp, job, profile)
      );
      onInvoiceUpdated(mergeEsignResponseIntoInvoice(invoiceProp, response));
      await refreshInvoiceRow();
    } catch (e) {
      setEsignError(e instanceof Error ? e.message : 'Failed to resend invoice signature request.');
    } finally {
      setEsignBusy(false);
    }
  };

  const handleCopySigningLink = async () => {
    if (!invoiceProp.esign_embed_src) return;
    setEsignError('');
    try {
      await navigator.clipboard.writeText(invoiceProp.esign_embed_src);
      setSigningLinkCopied(true);
      copySigningLinkTimeoutRef.current = setTimeout(() => {
        copySigningLinkTimeoutRef.current = null;
        setSigningLinkCopied(false);
      }, 1000);
    } catch {
      setEsignError('Could not copy signing link.');
    }
  };

  const handleViewSignedDoc = async () => {
    if (!invoiceProp.esign_signed_document_url) return;
    setEsignError('');
    setSignedDocBusy(true);
    try {
      await downloadSignedDocumentFile(invoiceProp.esign_signed_document_url);
    } catch (e) {
      setEsignError(e instanceof Error ? e.message : 'Could not load signed document.');
    } finally {
      setSignedDocBusy(false);
    }
  };

  const handleSaveNotes = async () => {
    setNotesError('');
    setSavingNotes(true);
    try {
      const next: Invoice = {
        ...invoiceProp,
        notes: notesDraft.trim() || null,
      };
      const { data, error } = await updateInvoice(next);
      if (error || !data) {
        setNotesError(error?.message || 'Could not save notes.');
        return;
      }
      onInvoiceUpdated(data);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className={`invoice-final-page${!isReadOnly ? ' invoice-final-page--draft' : ''}`}>
      <div className="invoice-final-nav">
        <button type="button" className="invoice-final-nav-plain" onClick={onWorkOrders}>
          Go Back
        </button>
      </div>

      <hgroup>
        <h1 className="invoice-final-heading">{customerTitle}</h1>
        <p className="invoice-final-heading-sub">{invoiceSubline}</p>
      </hgroup>

      {!isReadOnly ? (
        <div className="invoice-final-notes-heading-slot">
          {!notesOpen ? (
            <button type="button" className="btn-text invoice-final-notes-toggle" onClick={() => setNotesOpen(true)}>
              Add Notes
            </button>
          ) : (
            <div className="invoice-final-notes-panel">
              <div className="form-group">
                <label htmlFor="invoice-notes">Notes</label>
                <textarea
                  id="invoice-notes"
                  className="invoice-final-notes-input"
                  rows={3}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {notesError ? <p className="invoice-notes-error">{notesError}</p> : null}
              <button
                type="button"
                className="btn-primary btn-large invoice-final-notes-save"
                disabled={savingNotes}
                onClick={() => void handleSaveNotes()}
              >
                {savingNotes ? 'Saving…' : 'Save Notes'}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {downloadError ? (
        <div className="error-banner" role="alert">
          {downloadError}
        </div>
      ) : null}
      {esignError ? (
        <div className="error-banner" role="alert">
          {esignError}
        </div>
      ) : null}

      <section className="wo-esign-card invoice-final-esign-card" aria-labelledby="invoice-esign-heading">
        <h2 id="invoice-esign-heading" className="wo-esign-heading">
          Customer signature
        </h2>
        <div
          className="wo-esign-timeline"
          role="group"
          aria-label={`Customer signature status: ${esignProgress.title}`}
        >
          {esignProgress.steps.map((step, index) => (
            <div
              key={step.key}
              className={`wo-esign-step wo-esign-step-${step.tone}`}
              aria-current={step.tone !== 'inactive' ? 'step' : undefined}
            >
              <span
                className={`wo-esign-step-dot${step.tone === 'inactive' ? '' : ' wo-esign-step-dot-filled'}`}
                aria-hidden="true"
              />
              <span className="wo-esign-step-label">{step.label}</span>
              {index < esignProgress.steps.length - 1 ? (
                <span className="wo-esign-step-line" aria-hidden="true" />
              ) : null}
            </div>
          ))}
        </div>
        <p className="wo-esign-summary">{esignProgress.summary}</p>
        <dl className="wo-esign-meta">
          {invoiceProp.issued_at ? (
            <div className="wo-esign-meta-row">
              <dt>Issued</dt>
              <dd>{formatEsignTimestamp(invoiceProp.issued_at)}</dd>
            </div>
          ) : null}
          {invoiceProp.esign_sent_at ? (
            <div className="wo-esign-meta-row">
              <dt>Sent</dt>
              <dd>{formatEsignTimestamp(invoiceProp.esign_sent_at)}</dd>
            </div>
          ) : null}
          {invoiceProp.esign_opened_at ? (
            <div className="wo-esign-meta-row">
              <dt>Opened</dt>
              <dd>{formatEsignTimestamp(invoiceProp.esign_opened_at)}</dd>
            </div>
          ) : null}
          {invoiceProp.esign_completed_at ? (
            <div className="wo-esign-meta-row">
              <dt>Signed</dt>
              <dd>{formatEsignTimestamp(invoiceProp.esign_completed_at)}</dd>
            </div>
          ) : null}
          {invoiceProp.esign_declined_at ? (
            <div className="wo-esign-meta-row">
              <dt>Declined</dt>
              <dd>{formatEsignTimestamp(invoiceProp.esign_declined_at)}</dd>
            </div>
          ) : null}
          {invoiceProp.esign_decline_reason ? (
            <div className="wo-esign-meta-row wo-esign-meta-row-reason">
              <dt>Decline reason</dt>
              <dd>{invoiceProp.esign_decline_reason}</dd>
            </div>
          ) : null}
        </dl>
        <div className="wo-esign-actions">
          {!invoiceProp.esign_submitter_id ? (
            <button
              type="button"
              className="btn-primary btn-action wo-esign-actions-primary"
              disabled={esignBusy || !job.customer_email?.trim()}
              title={
                !job.customer_email?.trim()
                  ? 'Customer email is required to send for signature'
                  : undefined
              }
              onClick={() => void handleSendForSignature()}
            >
              {esignBusy ? 'Sending…' : 'Send Invoice'}
            </button>
          ) : invoiceProp.esign_status !== 'completed' ? (
            <button
              type="button"
              className="btn-primary btn-action wo-esign-actions-primary"
              disabled={esignBusy}
              onClick={() => void handleResendSignature()}
            >
              {esignBusy ? 'Sending…' : 'Resend Invoice'}
            </button>
          ) : null}
          {showCopySigningLink ? (
            <button
              type="button"
              className="btn-secondary btn-action wo-esign-actions-copy"
              disabled={esignBusy}
              onClick={() => void handleCopySigningLink()}
            >
              <span aria-live="polite">
                {signingLinkCopied ? 'Copied to clipboard' : 'Copy signing link'}
              </span>
            </button>
          ) : null}
          {invoiceProp.esign_signed_document_url ? (
            <button
              type="button"
              className="btn-primary btn-action"
              disabled={signedDocBusy}
              onClick={() => void handleViewSignedDoc()}
            >
              {signedDocBusy ? 'Loading…' : 'Download signed PDF'}
            </button>
          ) : null}
        </div>
      </section>

      <div
        ref={previewViewportRef}
        className="agreement-preview-scale-viewport invoice-final-mini-viewport"
      >
        <div
          role="button"
          tabIndex={0}
          className="invoice-final-mini-preview-hitbox"
          aria-label="Open full invoice preview"
          onClick={() => setModalOpen(true)}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setModalOpen(true);
            }
          }}
        >
          <div
            className="agreement-preview-scale-spacer"
            style={{
              width: spacerWidth,
              height: spacerHeight,
            }}
          >
            <div
              ref={previewSheetRef}
              className="agreement-preview-scale-sheet"
              style={{
                width: letterWidthPx,
                transform: previewScale !== 1 ? `scale(${previewScale})` : undefined,
                transformOrigin: 'top left',
                willChange: previewScale !== 1 ? 'transform' : undefined,
              }}
            >
              <div
                ref={documentRef}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="invoice-final-actions">
        <button
          type="button"
          className="btn-primary btn-large invoice-final-download-btn"
          disabled={downloading}
          onClick={() => void handleDownload()}
        >
          {downloading ? 'Downloading…' : 'Download Invoice'}
        </button>
        {!isReadOnly ? (
          <button
            type="button"
            className="btn-primary btn-large invoice-final-download-btn"
            onClick={onEditInvoice}
          >
            Edit Invoice
          </button>
        ) : null}
      </div>

      <InvoicePreviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        htmlMarkup={previewHtml}
      />
    </div>
  );
}
