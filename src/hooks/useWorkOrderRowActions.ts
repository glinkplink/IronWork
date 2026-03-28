import { useEffect, useRef, useState } from 'react';
import type {
  ChangeOrder,
  Invoice,
  Job,
  WorkOrderListChangeOrderPreview,
  WorkOrderInvoiceStatus,
  WorkOrderListJob,
} from '../types/db';

export type WorkOrderRowActionsDeps = {
  userId: string;
  getJobById: (jobId: string) => Promise<Job | null>;
  getChangeOrderById: (changeOrderId: string) => Promise<ChangeOrder | null>;
  getInvoice: (invoiceId: string) => Promise<Invoice | null>;
  onOpenWorkOrderDetail: (job: Job) => void;
  onOpenChangeOrderDetail: (job: Job, changeOrder: ChangeOrder) => void;
  onStartInvoice: (job: Job) => void;
  onOpenPendingInvoice: (job: Job, invoice: Invoice) => void;
};

/**
 * Per-row hydration + loading locks for work order list actions.
 * One row busy does not block other rows.
 */
export function useWorkOrderRowActions({
  userId,
  getJobById,
  getChangeOrderById,
  getInvoice,
  onOpenWorkOrderDetail,
  onOpenChangeOrderDetail,
  onStartInvoice,
  onOpenPendingInvoice,
}: WorkOrderRowActionsDeps) {
  const [actionLoadingJobIds, setActionLoadingJobIds] = useState<Set<string>>(() => new Set());
  const actionLoadingIdsRef = useRef<Set<string>>(new Set());
  const jobCacheRef = useRef<Map<string, Job>>(new Map());
  const changeOrderCacheRef = useRef<Map<string, ChangeOrder>>(new Map());
  const invoiceCacheRef = useRef<Map<string, Invoice>>(new Map());

  useEffect(() => {
    jobCacheRef.current = new Map();
    changeOrderCacheRef.current = new Map();
    invoiceCacheRef.current = new Map();
    actionLoadingIdsRef.current = new Set();
    setActionLoadingJobIds(new Set());
  }, [userId]);

  const beginRowAction = (jobId: string) => {
    if (actionLoadingIdsRef.current.has(jobId)) return false;
    actionLoadingIdsRef.current.add(jobId);
    setActionLoadingJobIds(new Set(actionLoadingIdsRef.current));
    return true;
  };

  const endRowAction = (jobId: string) => {
    actionLoadingIdsRef.current.delete(jobId);
    setActionLoadingJobIds(new Set(actionLoadingIdsRef.current));
  };

  const runWithJobHydration = async (
    listJob: WorkOrderListJob,
    fn: (fullJob: Job) => void
  ) => {
    if (!beginRowAction(listJob.id)) return;
    try {
      let full: Job | undefined = jobCacheRef.current.get(listJob.id);
      if (full === undefined) {
        const fetched = await getJobById(listJob.id);
        if (fetched) {
          jobCacheRef.current.set(listJob.id, fetched);
          full = fetched;
        }
      }
      if (full) fn(full);
      else console.error('WorkOrdersPage: getJobById returned no row for', listJob.id);
    } finally {
      endRowAction(listJob.id);
    }
  };

  const handleOpenDetail = (listJob: WorkOrderListJob) => {
    void runWithJobHydration(listJob, (full) => onOpenWorkOrderDetail(full));
  };

  const handleStartInvoice = (listJob: WorkOrderListJob) => {
    void runWithJobHydration(listJob, (full) => onStartInvoice(full));
  };

  const handleOpenChangeOrderDetail = (
    listJob: WorkOrderListJob,
    changeOrderPreview: WorkOrderListChangeOrderPreview
  ) => {
    if (!beginRowAction(listJob.id)) return;
    void (async () => {
      try {
        let fullJob: Job | undefined = jobCacheRef.current.get(listJob.id);
        if (fullJob === undefined) {
          const job = await getJobById(listJob.id);
          if (job) {
            jobCacheRef.current.set(listJob.id, job);
            fullJob = job;
          }
        }

        let fullChangeOrder: ChangeOrder | undefined = changeOrderCacheRef.current.get(
          changeOrderPreview.id
        );
        if (fullChangeOrder === undefined) {
          const changeOrder = await getChangeOrderById(changeOrderPreview.id);
          if (changeOrder) {
            changeOrderCacheRef.current.set(changeOrderPreview.id, changeOrder);
            fullChangeOrder = changeOrder;
          }
        }

        if (fullJob && fullChangeOrder) {
          onOpenChangeOrderDetail(fullJob, fullChangeOrder);
        } else {
          console.error('WorkOrdersPage: missing full job or change order for detail flow');
        }
      } finally {
        endRowAction(listJob.id);
      }
    })();
  };

  const handleOpenPendingInvoice = (listJob: WorkOrderListJob, status: WorkOrderInvoiceStatus) => {
    if (!beginRowAction(listJob.id)) return;
    void (async () => {
      try {
        let fullJob: Job | undefined = jobCacheRef.current.get(listJob.id);
        if (fullJob === undefined) {
          const j = await getJobById(listJob.id);
          if (j) {
            jobCacheRef.current.set(listJob.id, j);
            fullJob = j;
          }
        }
        let fullInv: Invoice | undefined = invoiceCacheRef.current.get(status.id);
        if (fullInv === undefined) {
          const inv = await getInvoice(status.id);
          if (inv) {
            invoiceCacheRef.current.set(status.id, inv);
            fullInv = inv;
          }
        }
        if (fullJob && fullInv) onOpenPendingInvoice(fullJob, fullInv);
        else console.error('WorkOrdersPage: missing full job or invoice for pending flow');
      } finally {
        endRowAction(listJob.id);
      }
    })();
  };

  return {
    busyJobIds: actionLoadingJobIds,
    handleOpenDetail,
    handleOpenChangeOrderDetail,
    handleStartInvoice,
    handleOpenPendingInvoice,
  };
}
