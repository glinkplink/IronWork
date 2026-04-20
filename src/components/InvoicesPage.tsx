import { useEffect, useState } from 'react';
import type { ChangeOrder, Job, Invoice, InvoiceLineItem, WorkOrdersDashboardSummary } from '../types/db';
import type { InvoiceWithCustomerName } from '../lib/db/invoices';
import { listInvoicesWithCustomerName, getInvoiceBusinessStatus } from '../lib/db/invoices';
import { getJobById, getWorkOrdersDashboardSummary } from '../lib/db/jobs';
import { getChangeOrderById } from '../lib/db/change-orders';
import { formatUsd } from '../lib/work-order-dashboard-display';
import './WorkOrdersPage.css';
import './InvoicesPage.css';

interface InvoicesPageProps {
  userId: string;
  onOpenInvoice: (job: Job, invoice: Invoice) => void;
  onOpenCoInvoice: (job: Job, changeOrder: ChangeOrder, invoice: Invoice) => void;
}

/**
 * Returns the CO id when this is a CO-only invoice:
 * - exactly one unique `change_order_id`
 * - no base-scope lines (original/labor/material/manual/etc without a CO id)
 */
function getSingleCoIdForCoOnlyInvoice(lineItems: InvoiceLineItem[]): string | null {
  if (lineItems.length === 0) return null;

  const ids = new Set(
    lineItems.map((i) => i.change_order_id).filter((id): id is string => Boolean(id))
  );
  if (ids.size !== 1) return null;

  const hasBaseScopeLine = lineItems.some((line) => {
    const hasCoId = typeof line.change_order_id === 'string' && line.change_order_id.trim() !== '';
    return !hasCoId && line.source !== 'change_order';
  });

  return hasBaseScopeLine ? null : [...ids][0];
}

function formatInvoiceDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatInvoiceLabel(invoiceNumber: number): string {
  return `INV #${String(invoiceNumber).padStart(4, '0')}`;
}

/** Matches `formatWorkOrderDashboardWoLabel` in `work-order-dashboard-display.ts`. */
function formatWoLabel(woNumber: number | null): string {
  return woNumber != null ? `WO #${String(woNumber).padStart(4, '0')}` : 'WO (no #)';
}

function invoiceRowStatusPill(invoice: InvoiceWithCustomerName): { className: string; label: string } {
  const businessStatus = getInvoiceBusinessStatus(invoice);
  if (invoice.payment_status === 'paid') {
    return { className: 'wo-row-invoice-btn wo-row-invoice-btn--paid', label: 'Paid' };
  }
  if (invoice.payment_status === 'offline') {
    return { className: 'wo-row-invoice-btn wo-row-invoice-btn--offline', label: 'Paid Offline' };
  }
  if (businessStatus === 'draft') {
    return { className: 'wo-row-invoice-btn wo-row-invoice-btn--draft', label: 'Invoice draft' };
  }
  return { className: 'wo-row-invoice-btn wo-row-invoice-btn--invoiced', label: 'Invoiced' };
}

interface InvoiceRowProps {
  invoice: InvoiceWithCustomerName;
  busy: boolean;
  onOpen: (invoice: InvoiceWithCustomerName) => void;
}

/** Row DOM mirrors `WorkOrderRow` in `WorkOrdersPage.tsx` so `WorkOrdersPage.css` applies. */
function InvoiceRow({ invoice, busy, onOpen }: InvoiceRowProps) {
  const pill = invoiceRowStatusPill(invoice);

  return (
    <li className={`work-orders-row${busy ? ' work-orders-row--busy' : ''}`}>
      <button
        type="button"
        className="invoices-row-full-hit"
        disabled={busy}
        onClick={() => onOpen(invoice)}
      >
        <div className="work-orders-row-main">
          <span className="work-orders-row-heading">
            <span className="work-orders-wo">{formatInvoiceLabel(invoice.invoice_number)}</span>
            <span className="work-orders-wo-date">{`· ${formatInvoiceDate(invoice.invoice_date)}`}</span>
          </span>
          <span className="work-orders-customer">{invoice.customer_name ?? '—'}</span>
          <span className="invoices-row-wo-line">{formatWoLabel(invoice.wo_number)}</span>
        </div>
        <div className="work-orders-row-actions">
          <div className="invoices-row-actions-stack">
            <span className="invoices-row-amount">{formatUsd(invoice.total)}</span>
            <span className={pill.className}>{pill.label}</span>
          </div>
        </div>
      </button>
    </li>
  );
}

export function InvoicesPage({ userId, onOpenInvoice, onOpenCoInvoice }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<InvoiceWithCustomerName[]>([]);
  const [summary, setSummary] = useState<WorkOrdersDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset state before async fetch when userId changes */
    setLoading(true);
    setError(null);
    setInvoices([]);
    setSummary(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    void Promise.all([listInvoicesWithCustomerName(userId), getWorkOrdersDashboardSummary(userId)])
      .then(([listResult, summaryResult]) => {
        if (cancelled) return;
        if (listResult.error) {
          setError('Failed to load invoices.');
          setInvoices([]);
          setSummary(null);
          setLoading(false);
          return;
        }
        setInvoices(listResult.data);
        setSummary(summaryResult.error ? null : summaryResult.data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load invoices.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleRowOpen = async (invoice: InvoiceWithCustomerName) => {
    if (busyId) return;
    setBusyId(invoice.id);
    try {
      const coId = getSingleCoIdForCoOnlyInvoice(invoice.line_items);
      const job = await getJobById(invoice.job_id);
      if (!job) {
        setBusyId(null);
        return;
      }
      if (coId) {
        const changeOrder = await getChangeOrderById(coId);
        if (changeOrder) {
          onOpenCoInvoice(job, changeOrder, invoice);
          return;
        }
      }
      onOpenInvoice(job, invoice);
    } catch {
      setBusyId(null);
    }
  };

  return (
    <div className="invoices-page work-orders-page">
      <div className="work-orders-toolbar">
        <h1 className="work-orders-title">Invoices</h1>
      </div>

      {loading && (
        <div className="work-orders-loading">Loading…</div>
      )}

      {!loading && error && (
        <div className="invoices-page-status invoices-page-status--error">{error}</div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <div className="work-orders-loading">No invoices yet.</div>
      )}

      {!loading && !error && summary !== null && (
        <div
          className="work-orders-stat-strip"
          role="group"
          aria-label="Invoiced and pending invoice totals from dashboard summary"
        >
          <div className="work-orders-stat-card work-orders-stat-card--blue">
            <div className="work-orders-stat-num">{formatUsd(summary.invoicedContractTotal)}</div>
            <div className="work-orders-stat-label">Invoiced</div>
          </div>
          <div className="work-orders-stat-card work-orders-stat-card--green">
            <div className="work-orders-stat-num">{formatUsd(summary.pendingContractTotal)}</div>
            <div className="work-orders-stat-label">Pending invoice</div>
          </div>
        </div>
      )}

      {!loading && !error && invoices.length > 0 && (
        <ul className="work-orders-list">
          {invoices.map((inv) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              busy={busyId === inv.id}
              onOpen={handleRowOpen}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
