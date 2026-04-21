import { useEffect, useRef, useState } from 'react';
import type { BusinessProfile, WorkOrderDashboardJob, WorkOrdersDashboardSummary } from '../types/db';
import { getWorkOrdersDashboardSummary, listWorkOrdersDashboardPage } from '../lib/db/jobs';
import { splitFullNameForForm } from '../lib/owner-name';
import {
  compactWorkOrderDashboardStatusLabel,
  formatUsd,
  formatWorkOrderDashboardRowDate,
  formatWorkOrderDashboardWoLabel,
} from '../lib/work-order-dashboard-display';
import './HomePage.css';

const HOME_RECENT_LIMIT = 5;

function greetingTimePhrase(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export interface HomePageProps {
  userId: string | null;
  profile: BusinessProfile | null;
  onCreateAgreement: () => void;
  onOpenWorkOrders: () => void;
  onOpenWorkOrderDetail: (jobId: string) => void;
}

export function HomePage({
  userId,
  profile,
  onCreateAgreement,
  onOpenWorkOrders,
  onOpenWorkOrderDetail,
}: HomePageProps) {
  const [summary, setSummary] = useState<WorkOrdersDashboardSummary | null>(null);
  const [recentJobs, setRecentJobs] = useState<WorkOrderDashboardJob[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const retryLoadRef = useRef<() => void>(() => {});

  useEffect(() => {
    const uid = userId;
    const prof = profile;

    if (!uid || !prof) {
      loadSeq.current += 1;
      /* eslint-disable react-hooks/set-state-in-effect -- clear dashboard on sign-out or missing profile */
      setSummary(null);
      setRecentJobs([]);
      setDashboardError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      retryLoadRef.current = () => {};
      return;
    }

    let cancelled = false;

    const performLoad = () => {
      const seq = ++loadSeq.current;
      setDashboardError(null);

      void Promise.all([
        listWorkOrdersDashboardPage(uid, HOME_RECENT_LIMIT, null),
        getWorkOrdersDashboardSummary(uid),
      ]).then(([pageResult, summaryResult]) => {
        if (cancelled || seq !== loadSeq.current) return;

        if (pageResult.error || summaryResult.error) {
          const msg =
            pageResult.error?.message ?? summaryResult.error?.message ?? 'Unknown error';
          setSummary(null);
          setRecentJobs([]);
          setDashboardError(`Could not load dashboard (${msg}).`);
          return;
        }

        setSummary(summaryResult.data);
        setRecentJobs(pageResult.data ?? []);
        setDashboardError(null);
      });
    };

    retryLoadRef.current = performLoad;
    performLoad();

    return () => {
      cancelled = true;
    };
  }, [userId, profile]);

  const signedIn = Boolean(userId && profile);

  if (!signedIn) {
    return (
      <div className="home-page home-page--guest">
        <section className="home-hero">
          <h1 className="home-hero-title">IronWork</h1>
          <p className="home-hero-lead">Stop working for free. Get it in writing.</p>
          <p className="home-hero-sub">
            Work orders, change orders, and invoices for solo welders. Ready in 2 minutes.
          </p>
          <button type="button" className="btn-primary btn-large home-hero-cta" onClick={onCreateAgreement}>
            Try it free
          </button>
        </section>

        <section className="home-pain" aria-labelledby="home-pain-heading">
          <h2 id="home-pain-heading" className="home-section-heading">Sound familiar?</h2>
          <ul className="home-pain-list">
            <li>Clients change the scope mid-job.</li>
            <li>You chase payments for weeks.</li>
            <li>Your handwritten invoices don't look professional.</li>
          </ul>
        </section>

        <section className="home-shots" aria-labelledby="home-shots-heading">
          <h2 id="home-shots-heading" className="home-section-heading">What you get</h2>
          <div className="home-shots-grid">
            <div className="home-shot-placeholder" aria-label="Work order PDF preview (coming soon)">
              <span>Work Order PDF</span>
            </div>
            <div className="home-shot-placeholder" aria-label="Invoice PDF preview (coming soon)">
              <span>Invoice PDF</span>
            </div>
            <div className="home-shot-placeholder home-shot-placeholder--phone" aria-label="Mobile app preview (coming soon)">
              <span>On your phone</span>
            </div>
          </div>
        </section>

        <section className="home-steps" aria-labelledby="home-steps-heading">
          <h2 id="home-steps-heading" className="home-section-heading">How it works</h2>
          <ol className="home-steps-list">
            <li>
              <span className="home-step-num">1</span>
              <span className="home-step-text">Fill in the job details.</span>
            </li>
            <li>
              <span className="home-step-num">2</span>
              <span className="home-step-text">Preview the agreement.</span>
            </li>
            <li>
              <span className="home-step-num">3</span>
              <span className="home-step-text">Download it or send for e-signature.</span>
            </li>
          </ol>
        </section>

        <section className="home-cta-footer">
          <h2 className="home-section-heading">Ready to get paid for the work you actually did?</h2>
          <button type="button" className="btn-primary btn-large home-hero-cta" onClick={onCreateAgreement}>
            Try it free
          </button>
        </section>
      </div>
    );
  }

  const firstName = splitFullNameForForm(profile!.owner_name ?? '').first;
  const greetingName = firstName ? `, ${firstName}` : '';
  const awaitingDashboard = !dashboardError && summary === null;
  const jobCount = summary?.jobCount ?? 0;
  const subline =
    summary === null
      ? ''
      : jobCount === 0
        ? 'No work orders yet — tap + to create one.'
        : `You have ${jobCount} work order${jobCount === 1 ? '' : 's'}.`;

  return (
    <div className="home-page home-page--dashboard" aria-busy={awaitingDashboard}>
      <div className="home-dash-greeting">
        <h1 className="home-dash-greeting-title">
          {greetingTimePhrase()}
          {greetingName}
        </h1>
        {subline ? <p className="home-dash-greeting-sub">{subline}</p> : null}
      </div>

      {dashboardError ? (
        <div className="home-dash-error" role="alert">
          <p>{dashboardError}</p>
          <button type="button" className="btn-secondary" onClick={() => retryLoadRef.current()}>
            Retry
          </button>
        </div>
      ) : awaitingDashboard ? (
        <p className="home-dash-loading">Loading…</p>
      ) : (
        <>
          <div
            className="home-stat-strip"
            role="group"
            aria-label="Work order totals from dashboard summary"
          >
            <div className="home-stat-card home-stat-card--spark">
              <div className="home-stat-num">{jobCount}</div>
              <div className="home-stat-label">Work orders</div>
            </div>
            <div className="home-stat-card home-stat-card--blue">
              <div className="home-stat-num">{formatUsd(summary?.invoicedContractTotal)}</div>
              <div className="home-stat-label">Invoiced</div>
            </div>
            <div className="home-stat-card home-stat-card--paid">
              <div className="home-stat-num">{formatUsd(summary?.paidContractTotal)}</div>
              <div className="home-stat-label">Paid</div>
            </div>
            <div className="home-stat-card home-stat-card--green">
              <div className="home-stat-num">{formatUsd(summary?.pendingContractTotal)}</div>
              <div className="home-stat-label">Pending invoice</div>
            </div>
          </div>

          <div className="home-section-head">
            <h2 className="home-section-title">Recent work orders</h2>
            <button type="button" className="home-section-link" onClick={onOpenWorkOrders}>
              View all
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <p className="home-dash-empty">No work orders yet.</p>
          ) : (
            <ul className="home-recent-list">
              {recentJobs.map((job) => {
                const statusLabel = compactWorkOrderDashboardStatusLabel(job);
                return (
                  <li key={job.id}>
                    <button
                      type="button"
                      className="home-dash-card"
                      onClick={() => onOpenWorkOrderDetail(job.id)}
                    >
                      <div className="home-dash-card-top">
                        <span className="home-dash-card-wo">{formatWorkOrderDashboardWoLabel(job)}</span>
                        {statusLabel ? (
                          <span className="home-dash-card-status">{statusLabel}</span>
                        ) : null}
                      </div>
                      <div className="home-dash-card-title">{job.job_type}</div>
                      <div className="home-dash-card-client">{job.customer_name}</div>
                      <div className="home-dash-card-footer">
                        <span className="home-dash-card-amount">{formatUsd(job.price)}</span>
                        <span className="home-dash-card-date">{formatWorkOrderDashboardRowDate(job)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
