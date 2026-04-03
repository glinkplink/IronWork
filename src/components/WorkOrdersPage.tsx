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
const PROFILE_NUDGE_DISMISS_MS = 48 * 60 * 60 * 1000;
const WORK_ORDERS_PAGE_SIZE = 25;

function readProfileNudgeDismissedActive(userId: string): boolean {
  try {
    const raw = localStorage.getItem(`${HIDE_COMPLETE_PROFILE_CTA_PREFIX}${userId}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PROFILE_NUDGE_DISMISS_MS;
  } catch {
    return false;
  }
}

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
            className="wo-row-invoice-btn wo-row-invoice-btn--outline"
            disabled={rowBusy}
            onClick={() => onStartInvoice(job)}
          >
            Invoice
          </button>
        ) : invoice.payment_status === 'paid' ? (
          <button
            type="button"
            className="wo-row-invoice-btn wo-row-invoice-btn--paid"
            disabled={rowBusy}
            onClick={() => onOpenPendingInvoice(job)}
          >
            Paid
          </button>
        ) : invoice.payment_status === 'offline' ? (
          <button
            type="button"
            className="wo-row-invoice-btn wo-row-invoice-btn--offline"
            disabled={rowBusy}
            onClick={() => onOpenPendingInvoice(job)}
          >
            Paid Offline
          </button>
        ) : getInvoiceBusinessStatus(invoice) === 'draft' ? (
          <button
            type="button"
            className="wo-row-invoice-btn wo-row-invoice-btn--draft"
            disabled={rowBusy}
            onClick={() => onOpenPendingInvoice(job)}
          >
            Draft
          </button>
        ) : (
          <button
            type="button"
            className="wo-row-invoice-btn wo-row-invoice-btn--invoiced"
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
  const [profileNudgeDismissedActive, setProfileNudgeDismissedActive] = useState(() =>
    readProfileNudgeDismissedActive(userId)
  );

  useEffect(() => {
    setProfileNudgeDismissedActive(readProfileNudgeDismissedActive(userId));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setJobsLoading(true);
    setJobsError(null);
    setJobs([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadMoreError(null);
    setSummary(null);

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

  const showProfileNudge = !hasBusinessPhone(profile) && !profileNudgeDismissedActive;

  const handleNotNowCompleteProfile = () => {
    try {
      localStorage.setItem(hideCtaKey, String(Date.now()));
    } catch {
      /* ignore */
    }
    setProfileNudgeDismissedActive(true);
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
        <button type="button" className="btn-primary work-orders-toolbar-cta" onClick={onCreateWorkOrder}>
          Create Work Order
        </button>
      </div>

      {showProfileNudge ? (
        <div className="work-orders-profile-nudge">
          <p className="work-orders-profile-nudge-helper">
            Add your business phone so it appears on agreements and PDFs. Defaults you set in your
            profile (exclusions, customer obligations) apply to new work orders.
          </p>
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
            className="work-orders-stat-strip"
            role="group"
            aria-label="Invoiced and pending invoice totals from work order prices"
          >
            <div className="work-orders-stat-card work-orders-stat-card--blue">
              <div className="work-orders-stat-num">{summaryInvoicedDisplay}</div>
              <div className="work-orders-stat-label">Invoiced</div>
            </div>
            <div className="work-orders-stat-card work-orders-stat-card--green">
              <div className="work-orders-stat-num">{summaryPendingDisplay}</div>
              <div className="work-orders-stat-label">Pending invoice</div>
            </div>
          </div>
          {jobs.length === 0 ? (
            <div className="work-orders-empty-state">
              <p className="work-orders-empty-title">No work orders yet</p>
              <p className="work-orders-empty-lead">
                Create your first agreement and it will show up here.
              </p>
              <button
                type="button"
                className="btn-primary work-orders-empty-cta"
                aria-label="Create your first work order"
                onClick={onCreateWorkOrder}
              >
                Create Work Order
              </button>
            </div>
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
