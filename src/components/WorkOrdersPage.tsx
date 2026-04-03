import { memo, useCallback, useEffect, useState } from 'react';
import type {
  BusinessProfile,
  Invoice,
  Job,
  WorkOrderDashboardJob,
  WorkOrdersDashboardCursor,
  WorkOrdersDashboardSummary,
} from '../types/db';
import {
  getJobById,
  getWorkOrdersDashboardSummary,
  listWorkOrdersDashboardPage,
} from '../lib/db/jobs';
import { getInvoice, getInvoiceBusinessStatus } from '../lib/db/invoices';
import { useWorkOrderRowActions } from '../hooks/useWorkOrderRowActions';
import { getEsignProgressModel } from '../lib/esign-progress';
import { getWorkOrderSignatureState } from '../lib/work-order-signature';
import {
  formatUsd,
  formatWorkOrderDashboardRowDate,
  formatWorkOrderDashboardWoLabel,
} from '../lib/work-order-dashboard-display';
import './WorkOrdersPage.css';

const HIDE_COMPLETE_PROFILE_CTA_PREFIX = 'scope-lock-hide-complete-profile-cta:';
const WORK_ORDERS_PAGE_SIZE = 25;

function hasBusinessPhone(profile: BusinessProfile | null): boolean {
  return Boolean(profile?.phone?.replace(/\D/g, '').length);
}

function renderEsignStrip(
  status: WorkOrderDashboardJob['esign_status'],
  offlineSignedAt: string | null
) {
  const { displayLabel, isSignatureSatisfied } = getWorkOrderSignatureState(status, offlineSignedAt);
  if (!isSignatureSatisfied && status === 'not_sent') return null;

  if (displayLabel === 'Signed offline' || displayLabel === 'Signed') {
    return (
      <span
        className="esign-strip"
        title={`Signature: ${displayLabel}`}
        aria-label={`Signature status: ${displayLabel}`}
      >
        <span className="esign-strip-segment esign-strip-segment-success" aria-hidden="true" />
        <span className="esign-strip-segment esign-strip-segment-success" aria-hidden="true" />
        <span className="esign-strip-segment esign-strip-segment-success" aria-hidden="true" />
        <span className="esign-strip-text">{displayLabel}</span>
      </span>
    );
  }

  const progress = getEsignProgressModel(status);
  return (
    <span
      className="esign-strip"
      title={`E-signature: ${progress.title}`}
      aria-label={`E-signature status: ${progress.title}`}
    >
      {progress.steps.map((step) => (
        <span
          key={step.key}
          className={`esign-strip-segment esign-strip-segment-${step.tone}`}
          aria-hidden="true"
        />
      ))}
      <span className="esign-strip-text">{progress.title}</span>
    </span>
  );
}

function appendDashboardRows(
  currentJobs: WorkOrderDashboardJob[],
  nextJobs: WorkOrderDashboardJob[]
): WorkOrderDashboardJob[] {
  if (nextJobs.length === 0) return currentJobs;

  const mergedJobs = [...currentJobs];
  const indexById = new Map(currentJobs.map((job, index) => [job.id, index]));

  nextJobs.forEach((job) => {
    const existingIndex = indexById.get(job.id);
    if (existingIndex == null) {
      indexById.set(job.id, mergedJobs.length);
      mergedJobs.push(job);
      return;
    }
    mergedJobs[existingIndex] = job;
  });

  return mergedJobs;
}

type WorkOrderRowProps = {
  job: WorkOrderDashboardJob;
  rowBusy: boolean;
  onOpenDetail: (job: WorkOrderDashboardJob) => void;
  onOpenChangeOrdersSection: (job: WorkOrderDashboardJob) => void;
  onStartInvoice: (job: WorkOrderDashboardJob) => void;
  onOpenPendingInvoice: (job: WorkOrderDashboardJob) => void;
};

const WorkOrderRow = memo(function WorkOrderRow({
  job,
  rowBusy,
  onOpenDetail,
  onOpenChangeOrdersSection,
  onStartInvoice,
  onOpenPendingInvoice,
}: WorkOrderRowProps) {
  const woLabel = formatWorkOrderDashboardWoLabel(job);
  const invoice = job.latestInvoice;
  const jobMetaLabel = formatWorkOrderDashboardRowDate(job);

  return (
    <li className="work-orders-row">
      <div className="work-orders-row-main">
        <button
          type="button"
          className="work-orders-row-detail-hit"
          disabled={rowBusy}
          onClick={() => onOpenDetail(job)}
        >
          <span className="work-orders-row-heading">
            <span className="work-orders-wo">{woLabel}</span>
            <span className="work-orders-wo-date">{`· ${jobMetaLabel}`}</span>
          </span>
          <span className="work-orders-customer">{job.customer_name}</span>
        </button>
        {job.changeOrderCount > 0 ? (
          <button
            type="button"
            className="work-orders-change-orders-link"
            disabled={rowBusy}
            onClick={() => onOpenChangeOrdersSection(job)}
          >
            View & Create Change Orders
          </button>
        ) : null}
        {renderEsignStrip(job.esign_status, job.offline_signed_at)}
      </div>
      <div className="work-orders-row-actions">
        {!invoice ? (
          <button
            type="button"
            className="wo-row-create-invoice-outline"
            disabled={rowBusy}
            onClick={() => onStartInvoice(job)}
          >
            Invoice
          </button>
        ) : invoice.payment_status === 'paid' ? (
          <button
            type="button"
            className="badge-paid"
            disabled={rowBusy}
            onClick={() => onOpenPendingInvoice(job)}
          >
            Paid
          </button>
        ) : getInvoiceBusinessStatus(invoice) === 'draft' ? (
          <button
            type="button"
            className="badge-pending"
            disabled={rowBusy}
            onClick={() => onOpenPendingInvoice(job)}
          >
            Draft
          </button>
        ) : (
          <button
            type="button"
            className="badge-invoiced"
            disabled={rowBusy}
            onClick={() => onOpenPendingInvoice(job)}
          >
            Invoiced
          </button>
        )}
      </div>
    </li>
  );
});

interface WorkOrdersPageProps {
  userId: string;
  profile: BusinessProfile | null;
  successBanner: string | null;
  onClearSuccessBanner: () => void;
  onCreateWorkOrder: () => void;
  onCompleteProfileClick: () => void;
  onStartInvoice: (job: Job) => void;
  onOpenPendingInvoice: (job: Job, invoice: Invoice) => void;
  onOpenWorkOrderDetail: (jobId: string, targetSection?: 'top' | 'change-orders') => void;
}

export function WorkOrdersPage({
  userId,
  profile,
  successBanner,
  onClearSuccessBanner,
  onCreateWorkOrder,
  onCompleteProfileClick,
  onStartInvoice,
  onOpenPendingInvoice,
  onOpenWorkOrderDetail,
}: WorkOrdersPageProps) {
  const [jobs, setJobs] = useState<WorkOrderDashboardJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<WorkOrdersDashboardCursor | null>(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkOrdersDashboardSummary | null>(null);

  const {
    busyJobIds: actionLoadingJobIds,
    handleOpenDetail,
    handleStartInvoice,
    handleOpenPendingInvoice,
  } = useWorkOrderRowActions({
    userId,
    getJobById,
    getInvoice,
    onOpenWorkOrderDetail,
    onStartInvoice,
    onOpenPendingInvoice,
  });

  const hideCtaKey = `${HIDE_COMPLETE_PROFILE_CTA_PREFIX}${userId}`;
  const [hideCompleteProfileCta, setHideCompleteProfileCta] = useState(() => {
    try {
      return sessionStorage.getItem(`${HIDE_COMPLETE_PROFILE_CTA_PREFIX}${userId}`) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset list state before async fetch when userId changes */
    setJobsLoading(true);
    setJobsError(null);
    setJobs([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadMoreError(null);
    setSummary(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    void Promise.all([
      listWorkOrdersDashboardPage(userId, WORK_ORDERS_PAGE_SIZE),
      getWorkOrdersDashboardSummary(userId),
    ]).then(([pageResult, summaryResult]) => {
      if (cancelled) return;

      if (pageResult.error) {
        setJobs([]);
        setHasMore(false);
        setNextCursor(null);
        setJobsError(`Could not load work orders (${pageResult.error.message}).`);
      } else {
        setJobs(pageResult.data);
        setHasMore(pageResult.hasMore);
        setNextCursor(pageResult.nextCursor);
        setJobsError(null);
      }

      if (summaryResult.error) {
        setSummary(null);
      } else {
        setSummary(summaryResult.data);
      }

      setJobsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => onClearSuccessBanner(), 10000);
    return () => clearTimeout(t);
  }, [successBanner, onClearSuccessBanner]);

  const showProfileNudge = !hasBusinessPhone(profile);

  const handleNotNowCompleteProfile = () => {
    try {
      sessionStorage.setItem(hideCtaKey, '1');
    } catch {
      /* ignore */
    }
    setHideCompleteProfileCta(true);
  };

  const handleOpenPendingInvoiceForRow = useCallback(
    (job: WorkOrderDashboardJob) => {
      if (!job.latestInvoice) return;
      handleOpenPendingInvoice(job, job.latestInvoice);
    },
    [handleOpenPendingInvoice]
  );

  const handleOpenChangeOrdersSection = useCallback(
    (job: WorkOrderDashboardJob) => {
      onOpenWorkOrderDetail(job.id, 'change-orders');
    },
    [onOpenWorkOrderDetail]
  );

  const handleLoadMore = useCallback(() => {
    if (loadMoreLoading || !hasMore || !nextCursor) return;

    setLoadMoreLoading(true);
    setLoadMoreError(null);

    void listWorkOrdersDashboardPage(userId, WORK_ORDERS_PAGE_SIZE, nextCursor).then((result) => {
      if (result.error) {
        setLoadMoreError(`Could not load more work orders (${result.error.message}).`);
        setLoadMoreLoading(false);
        return;
      }

      setJobs((currentJobs) => appendDashboardRows(currentJobs, result.data));
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setLoadMoreLoading(false);
    });
  }, [hasMore, loadMoreLoading, nextCursor, userId]);

  const summaryInvoicedDisplay = formatUsd(summary?.invoicedContractTotal);
  const summaryPendingDisplay = formatUsd(summary?.pendingContractTotal);

  return (
    <div className="work-orders-page">
      <div className="work-orders-toolbar">
        <h1 className="work-orders-title">Work Orders</h1>
        <button
          type="button"
          className="work-orders-create-btn"
          onClick={onCreateWorkOrder}
        >
          Create Work Order
        </button>
      </div>

      {showProfileNudge ? (
        <div className="work-orders-profile-nudge">
          <p className="work-orders-profile-nudge-helper">
            Add your business phone so it appears on agreements and PDFs. Defaults you set in your
            profile (exclusions, customer obligations) apply to new work orders.
          </p>
          {!hideCompleteProfileCta ? (
            <div className="work-orders-profile-nudge-actions">
              <button
                type="button"
                className="work-orders-complete-profile-btn"
                onClick={onCompleteProfileClick}
              >
                Complete Profile
              </button>
              <button
                type="button"
                className="work-orders-nudge-not-now"
                onClick={handleNotNowCompleteProfile}
              >
                Not now
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {successBanner ? (
        <div className="success-banner work-orders-success-banner" role="status">
          <span className="work-orders-success-banner-text">{successBanner}</span>
          <button
            type="button"
            className="btn-dismiss-banner"
            onClick={onClearSuccessBanner}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      {jobsError ? (
        <div className="error-banner work-orders-invoice-status-banner" role="alert">
          {jobsError}
        </div>
      ) : null}

      {jobsLoading ? (
        <p className="work-orders-loading">Loading…</p>
      ) : (
        <>
          <div
            className="work-orders-summary-strip"
            role="group"
            aria-label="Invoiced and pending invoice totals from work order prices"
          >
            <span className="work-orders-summary-item work-orders-summary-invoiced">
              <span className="work-orders-summary-label">Invoiced:</span>
              <span className="work-orders-summary-amount">{summaryInvoicedDisplay}</span>
            </span>
            <span className="work-orders-summary-item work-orders-summary-pending">
              <span className="work-orders-summary-label">Pending Invoice:</span>
              <span className="work-orders-summary-amount">{summaryPendingDisplay}</span>
            </span>
          </div>
          {jobs.length === 0 ? (
            <p className="work-orders-empty">No work orders yet.</p>
          ) : (
            <>
              <ul className="work-orders-list">
                {jobs.map((job) => (
                  <WorkOrderRow
                    key={job.id}
                    job={job}
                    rowBusy={actionLoadingJobIds.has(job.id)}
                    onOpenDetail={handleOpenDetail}
                    onOpenChangeOrdersSection={handleOpenChangeOrdersSection}
                    onStartInvoice={handleStartInvoice}
                    onOpenPendingInvoice={handleOpenPendingInvoiceForRow}
                  />
                ))}
              </ul>
              {loadMoreError ? (
                <div className="error-banner work-orders-load-more-error" role="alert">
                  {loadMoreError}
                </div>
              ) : null}
              {hasMore ? (
                <div className="work-orders-load-more-wrap">
                  <button
                    type="button"
                    className="work-orders-load-more-btn"
                    disabled={loadMoreLoading}
                    onClick={handleLoadMore}
                  >
                    {loadMoreLoading ? 'Loading…' : 'Load More'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
