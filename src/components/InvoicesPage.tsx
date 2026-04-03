import { useEffect, useState } from 'react';
import type { ChangeOrder, Job, Invoice, InvoiceLineItem } from '../types/db';
import type { InvoiceWithCustomerName } from '../lib/db/invoices';
import { listInvoicesWithCustomerName, getInvoiceBusinessStatus } from '../lib/db/invoices';
import { getJobById } from '../lib/db/jobs';
import { getChangeOrderById } from '../lib/db/change-orders';
import { formatUsd } from '../lib/work-order-dashboard-display';
import './InvoicesPage.css';

interface InvoicesPageProps {
  userId: string;
  onOpenInvoice: (job: Job, invoice: Invoice) => void;
  onOpenCoInvoice: (job: Job, changeOrder: ChangeOrder, invoice: Invoice) => void;
}

/** Returns the single CO id if exactly one unique change_order_id exists across line items; otherwise null. */
function getSingleCoId(lineItems: InvoiceLineItem[]): string | null {
  const ids = new Set(
    lineItems.map((i) => i.change_order_id).filter((id): id is string => Boolean(id))
  );
  return ids.size === 1 ? [...ids][0] : null;
}

function formatInvoiceDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatInvoiceLabel(invoiceNumber: number): string {
  return `INV #${String(invoiceNumber).padStart(4, '0')}`;
}

interface InvoiceRowProps {
  invoice: InvoiceWithCustomerName;
  busy: boolean;
  onOpen: (invoice: InvoiceWithCustomerName) => void;
}

function InvoiceRow({ invoice, busy, onOpen }: InvoiceRowProps) {
  const businessStatus = getInvoiceBusinessStatus(invoice);

  let badgeEl: React.ReactNode;
  if (invoice.payment_status === 'paid') {
    badgeEl = <span className="badge-paid">Paid</span>;
  } else if (invoice.payment_status === 'offline') {
    badgeEl = <span className="badge-offline">Paid Offline</span>;
  } else if (businessStatus === 'draft') {
    badgeEl = <span className="badge-draft">Draft</span>;
  } else {
    badgeEl = <span className="badge-invoiced">Invoiced</span>;
  }

  return (
    <button
      type="button"
      className={`invoices-page-row${busy ? ' invoices-page-row--busy' : ''}`}
      onClick={() => onOpen(invoice)}
      disabled={busy}
    >
      <div className="invoices-page-row-main">
        <span className="invoices-page-row-label">{formatInvoiceLabel(invoice.invoice_number)}</span>
        <span className="invoices-page-row-client">{invoice.customer_name ?? '—'}</span>
      </div>
      <div className="invoices-page-row-meta">
        <span className="invoices-page-row-amount">{formatUsd(invoice.total)}</span>
        <span className="invoices-page-row-date">{formatInvoiceDate(invoice.invoice_date)}</span>
        {badgeEl}
      </div>
    </button>
  );
}

export function InvoicesPage({ userId, onOpenInvoice, onOpenCoInvoice }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<InvoiceWithCustomerName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset state before async fetch when userId changes */
    setLoading(true);
    setError(null);
    setInvoices([]);
    /* eslint-enable react-hooks/set-state-in-effect */

    void listInvoicesWithCustomerName(userId).then((result) => {
      if (cancelled) return;
      setInvoices(result);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError('Failed to load invoices.');
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

  const handleRowOpen = async (invoice: InvoiceWithCustomerName) => {
    if (busyId) return;
    setBusyId(invoice.id);
    try {
      const coId = getSingleCoId(invoice.line_items);
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
    <div className="invoices-page">
      <div className="invoices-page-header">
        <h1 className="invoices-page-title">Invoices</h1>
      </div>

      {loading && (
        <div className="invoices-page-status">Loading…</div>
      )}

      {!loading && error && (
        <div className="invoices-page-status invoices-page-status--error">{error}</div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <div className="invoices-page-status">No invoices yet.</div>
      )}

      {!loading && !error && invoices.length > 0 && (
        <div className="invoices-page-list">
          {invoices.map((inv) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              busy={busyId === inv.id}
              onOpen={handleRowOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
