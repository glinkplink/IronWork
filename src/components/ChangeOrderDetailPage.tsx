import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job, BusinessProfile, ChangeOrder } from '../types/db';
import {
  fetchHtmlPdfBlob,
  getCoPdfFilename,
  getPdfFooterBusinessName,
  getPdfFooterPhone,
  downloadPdfBlobToFile,
} from '../lib/agreement-pdf';
import { generateChangeOrderHtml } from '../lib/change-order-generator';
import { buildDocusealChangeOrderHtmlDocument } from '../lib/docuseal-change-order-html';
import '../lib/change-order-document.css';
import { deleteChangeOrder, getChangeOrderById } from '../lib/db/change-orders';
import { jobRowToWelderJob } from '../lib/job-to-welder-job';
import { shouldPollEsignStatus } from '../lib/esign-live';
import { getEsignProgressModel, formatEsignTimestamp } from '../lib/esign-progress';
import { useEsignPoller } from '../hooks/useEsignPoller';
import {
  sendChangeOrderForSignature,
  resendChangeOrderSignature,
} from '../lib/esign-api';
import './ChangeOrderDetailPage.css';

interface ChangeOrderDetailPageProps {
  userId: string;
  co: ChangeOrder;
  job: Job;
  profile: BusinessProfile | null;
  onBack: () => void;
  onEdit: (co: ChangeOrder) => void;
  onDelete: () => void;
  onCoUpdated?: (co: ChangeOrder) => void;
}

export function ChangeOrderDetailPage({
  userId,
  co,
  job,
  profile,
  onBack,
  onEdit,
  onDelete,
  onCoUpdated,
}: ChangeOrderDetailPageProps) {
  const [pdfError, setPdfError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const coLabel = `CO #${String(co.co_number).padStart(4, '0')}`;
  const customerTitle = job.customer_name.trim() || 'Customer';

  const welderJob = useMemo(() => jobRowToWelderJob(job, profile), [job, profile]);
  const footerMeta = useMemo(() => ({
    providerName: getPdfFooterBusinessName(profile, welderJob),
    providerPhone: getPdfFooterPhone(profile, welderJob),
  }), [profile, welderJob]);

  const handleDownload = async () => {
    setPdfError('');
    setDownloading(true);
    try {
      const inner = generateChangeOrderHtml(co, job, profile);
      const filename = getCoPdfFilename(co.co_number, job.customer_name);
      const woLabel = job.wo_number != null ? `WO #${String(job.wo_number).padStart(4, '0')}` : '';
      const blob = await fetchHtmlPdfBlob({
        filename,
        innerMarkup: inner,
        marginHeaderLeft: coLabel,
        workOrderNumber: woLabel,
        providerName: footerMeta.providerName,
        providerPhone: footerMeta.providerPhone,
      });
      downloadPdfBlobToFile(blob, filename);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'PDF download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const [coEsignBusy, setCoEsignBusy] = useState(false);
  const [coSigningLinkCopied, setCoSigningLinkCopied] = useState(false);
  const copySigningLinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const esignProgress = useMemo(
    () => getEsignProgressModel(co.esign_status),
    [co.esign_status]
  );

  const refreshCoRow = useCallback(async () => {
    const row = await getChangeOrderById(co.id);
    if (row && onCoUpdated) {
      onCoUpdated(row);
    }
    return row;
  }, [co.id, onCoUpdated]);

  useEsignPoller({
    enabled: Boolean(onCoUpdated) && shouldPollEsignStatus(co.esign_status),
    pollOnce: async () => {
      const row = await refreshCoRow();
      return Boolean(row) && shouldPollEsignStatus(row.esign_status);
    },
  });

  useEffect(() => {
    return () => {
      if (copySigningLinkTimeoutRef.current !== null) {
        clearTimeout(copySigningLinkTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCoSigningLinkCopied(false);
    if (copySigningLinkTimeoutRef.current !== null) {
      clearTimeout(copySigningLinkTimeoutRef.current);
      copySigningLinkTimeoutRef.current = null;
    }
  }, [co.id, co.esign_embed_src]);

  const buildCoEsignPayload = async () => {
    const coLabelNum = String(co.co_number).padStart(4, '0');
    const html = buildDocusealChangeOrderHtmlDocument(co, job, profile);
    return {
      documents: [{ html, name: `Change Order #${coLabelNum}` }],
    };
  };

  const handleSendForSignature = async () => {
    setPdfError('');
    setCoEsignBusy(true);
    try {
      const r = await sendChangeOrderForSignature(co.id, await buildCoEsignPayload());
      onCoUpdated?.({ ...co, ...r });
      await refreshCoRow();
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Failed to send for signature');
    } finally {
      setCoEsignBusy(false);
    }
  };

  const handleResendSignature = async () => {
    setPdfError('');
    setCoEsignBusy(true);
    try {
      const r = await resendChangeOrderSignature(co.id);
      onCoUpdated?.({ ...co, ...r });
      await refreshCoRow();
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Failed to resend signature request');
    } finally {
      setCoEsignBusy(false);
    }
  };

  const handleCopySigningLink = () => {
    const link = co.esign_embed_src;
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCoSigningLinkCopied(true);
      copySigningLinkTimeoutRef.current = setTimeout(() => {
        setCoSigningLinkCopied(false);
      }, 2000);
    });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${coLabel}?`)) return;
    const { error } = await deleteChangeOrder(userId, co.id);
    if (error) {
      setPdfError(error.message);
      return;
    }
    onDelete();
  };

  const innerHtml = generateChangeOrderHtml(co, job, profile);

  return (
    <div className="work-order-detail-page">
      <div className="invoice-final-nav">
        <button type="button" className="invoice-final-nav-plain" onClick={onBack}>
          Go Back
        </button>
      </div>
      <hgroup>
        <h1 className="invoice-final-heading">{customerTitle}</h1>
        <p className="invoice-final-heading-sub">{coLabel}</p>
      </hgroup>

      {pdfError ? (
        <div className="error-banner" role="alert">
          {pdfError}
        </div>
      ) : null}

      {/* E-sign section */}
      {co.esign_status === 'not_sent' ? (
        <div className="wo-esign-section">
          <button
            type="button"
            className="btn-primary btn-large"
            disabled={coEsignBusy}
            onClick={() => void handleSendForSignature()}
          >
            {coEsignBusy ? 'Sending…' : 'Send for Signature'}
          </button>
        </div>
      ) : (
        <div className="wo-esign-section">
          {esignProgress ? (
            <div className="wo-esign-progress-strip">
              <span className={`wo-esign-status-badge wo-esign-status-${co.esign_status}`}>
                {esignProgress.label}
              </span>
              {esignProgress.tone === 'success' && co.esign_completed_at && (
                <span className="wo-esign-timestamp">
                  {formatEsignTimestamp(co.esign_completed_at)}
                </span>
              )}
            </div>
          ) : null}

          <div className="wo-esign-actions">
            {(co.esign_status === 'sent' || co.esign_status === 'opened') && (
              <button
                type="button"
                className="btn-secondary"
                disabled={coEsignBusy}
                onClick={() => void handleResendSignature()}
              >
                {coEsignBusy ? 'Resending…' : 'Resend'}
              </button>
            )}
            {co.esign_embed_src && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleCopySigningLink()}
              >
                {coSigningLinkCopied ? 'Copied!' : 'Copy signing link'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="work-order-detail-scroll">
        <div
          className="agreement-document work-order-detail-document"
          dangerouslySetInnerHTML={{ __html: innerHtml }}
        />
      </div>

      <div className="work-order-detail-footer">
        <button
          type="button"
          className="btn-secondary btn-large work-order-detail-download"
          onClick={() => onEdit(co)}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn-primary btn-large work-order-detail-download"
          disabled={downloading}
          onClick={() => void handleDownload()}
        >
          {downloading ? 'Downloading…' : 'Download Change Order'}
        </button>
        <button
          type="button"
          className="btn-secondary btn-large work-order-detail-download"
          onClick={() => void handleDelete()}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
