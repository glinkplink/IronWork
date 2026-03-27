import { useEffect, useRef, type KeyboardEvent } from 'react';
import './InvoicePreviewModal.css';

interface InvoicePreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** Full inner markup from `generateInvoiceHtml` (includes `.agreement-document` root). */
  htmlMarkup: string;
}

export function InvoicePreviewModal({ open, onClose, htmlMarkup }: InvoicePreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  function handleOverlayKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      closeButtonRef.current?.focus();
    }
  }

  return (
    <div
      className="invoice-preview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice preview"
      onKeyDown={handleOverlayKeyDown}
    >
      <div className="invoice-preview-modal-toolbar">
        <button
          ref={closeButtonRef}
          type="button"
          className="home-work-orders-link"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="invoice-preview-modal-scroll">
        <div
          className="invoice-preview-modal-sheet"
          dangerouslySetInnerHTML={{ __html: htmlMarkup }}
        />
      </div>
    </div>
  );
}
