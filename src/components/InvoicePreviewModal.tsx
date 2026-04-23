import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import './InvoicePreviewModal.css';

interface InvoicePreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** Full inner markup from `generateInvoiceHtml` (includes `.agreement-document` root). */
  htmlMarkup: string;
}

/** Letter width at 96dpi — must match the PDF viewport so text does not reflow. */
const LETTER_WIDTH_PX = 816;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    const ti = el.getAttribute('tabindex');
    if (ti === '-1') return false;
    if (el.hidden) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

export function InvoicePreviewModal({ open, onClose, htmlMarkup }: InvoicePreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const scroll = scrollRef.current;
    if (!scroll) return;

    const computeScale = () => {
      const style = window.getComputedStyle(scroll);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = scroll.clientWidth - padX;
      if (available <= 0) return 1;
      return Math.min(1, available / LETTER_WIDTH_PX);
    };

    const updateScale = () => setScale(computeScale());

    updateScale();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScale) : null;
    ro?.observe(scroll);
    window.addEventListener('resize', updateScale);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const updateHeight = () => setSheetHeight(sheet.scrollHeight);

    updateHeight();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : null;
    ro?.observe(sheet);
    return () => ro?.disconnect();
  }, [open, htmlMarkup]);

  if (!open) return null;

  function handleDialogKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key !== 'Tab' || !dialogRef.current) return;

    const list = tabbableElements(dialogRef.current);
    if (list.length === 0) return;

    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (!active || !dialogRef.current.contains(active)) {
      e.preventDefault();
      first.focus();
      return;
    }

    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const scaledWidth = LETTER_WIDTH_PX * scale;
  const scaledHeight = sheetHeight * scale;

  return (
    <div
      ref={dialogRef}
      className="invoice-preview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice preview"
      onKeyDown={handleDialogKeyDown}
    >
      <div className="invoice-preview-modal-toolbar">
        <div className="invoice-preview-modal-heading">
          <p className="invoice-preview-modal-kicker">Invoice preview</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="invoice-preview-modal-close"
          onClick={onClose}
        >
          Close preview
        </button>
      </div>
      <div ref={scrollRef} className="invoice-preview-modal-scroll">
        <div
          className="invoice-preview-modal-stage"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          <div
            ref={sheetRef}
            className="invoice-preview-modal-sheet"
            style={{
              width: LETTER_WIDTH_PX,
              transform: scale !== 1 ? `scale(${scale})` : undefined,
              transformOrigin: 'top left',
            }}
            dangerouslySetInnerHTML={{ __html: htmlMarkup }}
          />
        </div>
      </div>
    </div>
  );
}
