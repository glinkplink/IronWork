import { useState, useCallback, useRef, useEffect } from 'react';
import type { Job, Invoice } from '../types/db';
import type { AppView } from './useAppNavigation';

export type InvoiceFlowState = {
  invoiceFlowJob: Job | null;
  wizardExistingInvoice: Invoice | null;
  activeInvoice: Invoice | null;
};

const initialInvoice: InvoiceFlowState = {
  invoiceFlowJob: null,
  wizardExistingInvoice: null,
  activeInvoice: null,
};

type LoadProfile = (opts?: { silent?: boolean }) => void | Promise<void>;

export function useInvoiceFlow(
  navigateTo: (view: AppView) => void,
  setWorkOrdersSuccessBanner: (msg: string) => void,
  loadProfile: LoadProfile
) {
  const [invoice, setInvoice] = useState<InvoiceFlowState>(initialInvoice);
  const invoiceRef = useRef(invoice);
  useEffect(() => {
    invoiceRef.current = invoice;
  }, [invoice]);

  const handleStartInvoice = useCallback(
    (jobRow: Job) => {
      setInvoice((inv) => ({
        ...inv,
        invoiceFlowJob: jobRow,
        wizardExistingInvoice: null,
        activeInvoice: null,
      }));
      navigateTo('invoice-wizard');
    },
    [navigateTo]
  );

  const handleOpenPendingInvoice = useCallback(
    (jobRow: Job, inv: Invoice) => {
      setInvoice((i) => ({
        ...i,
        invoiceFlowJob: jobRow,
        activeInvoice: inv,
      }));
      navigateTo('invoice-final');
    },
    [navigateTo]
  );

  const handleInvoiceWizardSuccess = useCallback(
    (inv: Invoice) => {
      setInvoice((i) => ({
        ...i,
        activeInvoice: inv,
        wizardExistingInvoice: null,
      }));
      navigateTo('invoice-final');
      void loadProfile({ silent: true });
    },
    [navigateTo, loadProfile]
  );

  const handleInvoiceWizardCancel = useCallback(() => {
    const i = invoiceRef.current;
    if (i.wizardExistingInvoice) {
      setInvoice((prev) => ({ ...prev, wizardExistingInvoice: null }));
      navigateTo('invoice-final');
    } else {
      setInvoice((prev) => ({
        ...prev,
        invoiceFlowJob: null,
        activeInvoice: null,
      }));
      navigateTo('work-orders');
    }
  }, [navigateTo]);

  const handleInvoiceFinalWorkOrders = useCallback(() => {
    navigateTo('work-orders');
    setInvoice((i) => ({
      ...i,
      invoiceFlowJob: null,
      activeInvoice: null,
      wizardExistingInvoice: null,
    }));
  }, [navigateTo]);

  const handleEditInvoice = useCallback(() => {
    if (!invoiceRef.current.activeInvoice) return;
    setInvoice((i) => ({
      ...i,
      wizardExistingInvoice: i.activeInvoice,
    }));
    navigateTo('invoice-wizard');
  }, [navigateTo]);

  const handleAfterInvoiceDownload = useCallback(
    (inv: Invoice) => {
      setWorkOrdersSuccessBanner(
        `Invoice #${String(inv.invoice_number).padStart(4, '0')} downloaded and saved!`
      );
      navigateTo('work-orders');
      setInvoice((i) => ({
        ...i,
        invoiceFlowJob: null,
        activeInvoice: null,
      }));
      void loadProfile({ silent: true });
    },
    [navigateTo, loadProfile, setWorkOrdersSuccessBanner]
  );

  const handleInvoiceUpdated = useCallback((inv: Invoice) => {
    setInvoice((i) => ({ ...i, activeInvoice: inv }));
  }, []);

  const resetInvoiceFlow = useCallback(() => {
    setInvoice(initialInvoice);
  }, []);

  return {
    state: invoice,
    actions: {
      handleStartInvoice,
      handleOpenPendingInvoice,
      handleInvoiceWizardSuccess,
      handleInvoiceWizardCancel,
      handleInvoiceFinalWorkOrders,
      handleEditInvoice,
      handleAfterInvoiceDownload,
      handleInvoiceUpdated,
      resetInvoiceFlow,
    },
  };
}
