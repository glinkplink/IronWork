import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Job, BusinessProfile, Invoice } from '../types/db';
import { generateInvoiceHtml } from '../lib/invoice-generator';
import { markInvoiceDownloaded, updateInvoice } from '../lib/db/invoices';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { useScaledPreview } from '../hooks/useScaledPreview';
import {
  downloadPdfBlobToFile,
  fetchInvoicePdfBlob,
  getInvoicePdfFilename,
} from '../lib/agreement-pdf';
import './InvoiceFinalPage.css';

interface InvoiceFinalPageProps {
  invoice: Invoice;
  job: Job;
  profile: BusinessProfile;
  onWorkOrders: () => void;
  onEditInvoice: () => void;
  onAfterDownload: (invoice: Invoice) => void;
  onInvoiceUpdated: (invoice: Invoice) => void;
}

export function InvoiceFinalPage({
  invoice: invoiceProp,
  job,
  profile,
  onWorkOrders,
  onEditInvoice,
  onAfterDownload,
  onInvoiceUpdated,
}: InvoiceFinalPageProps) {
  const [invoice, setInvoice] = useState(invoiceProp);
  const [modalOpen, setModalOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(invoiceProp.notes ?? '');
  const [downloadError, setDownloadError] = useState('');
  const [notesError, setNotesError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  /** After first successful download that updates DB, further clicks only fetch PDF (no markInvoiceDownloaded / redirect callback). */
  const [hasPersistedDownloadOnce, setHasPersistedDownloadOnce] = useState(
    () => invoiceProp.status === 'downloaded'
  );

  const documentRef = useRef<HTMLDivElement | null>(null);

  const previewHtml = generateInvoiceHtml(invoice, job, profile);
  const isReadOnly = invoice.status === 'downloaded';
  const customerTitle = job.customer_name.trim() || 'Customer';
  const invoiceSubline = `Invoice #${String(invoice.invoice_number).padStart(4, '0')}`;

  const {
    viewportRef: previewViewportRef,
    sheetRef: previewSheetRef,
    scale: previewScale,
    spacerHeight,
    spacerWidth,
    letterWidthPx,
  } = useScaledPreview(invoice, job, profile);

  useLayoutEffect(() => {
    setInvoice(invoiceProp);
    setNotesDraft(invoiceProp.notes ?? '');
  }, [invoiceProp]);

  useEffect(() => {
    if (invoiceProp.status === 'downloaded') setHasPersistedDownloadOnce(true);
  }, [invoiceProp.status]);

  const handleDownload = async () => {
    setDownloadError('');
    if (!documentRef.current) {
      setDownloadError('Preview is not ready. Try again.');
      return;
    }
    setDownloading(true);
    try {
      const blob = await fetchInvoicePdfBlob(invoice, job, profile, documentRef.current);
      downloadPdfBlobToFile(blob, getInvoicePdfFilename(invoice.invoice_number, job.customer_name));

      if (!hasPersistedDownloadOnce) {
        const { error } = await markInvoiceDownloaded(invoice.id);
        if (error) {
          setDownloadError(`PDF downloaded, but status could not be updated: ${error.message}`);
          return;
        }
        setHasPersistedDownloadOnce(true);
        const nextInv = { ...invoice, status: 'downloaded' as const };
        setInvoice(nextInv);
        onInvoiceUpdated(nextInv);
        onAfterDownload(nextInv);
      }
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveNotes = async () => {
    setNotesError('');
    setSavingNotes(true);
    try {
      const next: Invoice = {
        ...invoice,
        notes: notesDraft.trim() || null,
      };
      const { data, error } = await updateInvoice(next);
      if (error || !data) {
        setNotesError(error?.message || 'Could not save notes.');
        return;
      }
      setInvoice(data);
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
                <input
                  id="invoice-notes"
                  type="text"
                  className="invoice-final-notes-input"
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
          {downloading
            ? 'Downloading…'
            : isReadOnly
              ? 'Download Invoice'
              : hasPersistedDownloadOnce
                ? 'Download PDF'
                : 'Download Invoice'}
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
