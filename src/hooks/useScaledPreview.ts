import { useLayoutEffect, useRef, useState } from 'react';

/** Letter width at 96dpi — preview layout matches PDF viewport. */
export const PREVIEW_LETTER_WIDTH_PX = 816;

/** Preview upscale only applies at this breakpoint and when measure width > 816px. */
export const PREVIEW_DESKTOP_UPSCALE_MQ = '(min-width: 1024px)';

/**
 * Shared scaled “mini sheet” preview: viewport + sheet refs, scale, and spacer dimensions
 * (spacer height = sheet.scrollHeight * scale — matches prior previewContentHeight * previewScale).
 */
export function useScaledPreview(...heightRefreshDeps: unknown[]) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetScrollHeight, setSheetScrollHeight] = useState(0);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const computeScale = () => {
      const w = viewport.getBoundingClientRect().width;
      if (w <= 0) return 1;

      const maxScale = window.matchMedia(PREVIEW_DESKTOP_UPSCALE_MQ).matches ? 1.5 : 1;
      return Math.min(w / PREVIEW_LETTER_WIDTH_PX, maxScale);
    };

    const updateScale = () => {
      setScale(computeScale());
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(viewport);
    const mq = window.matchMedia(PREVIEW_DESKTOP_UPSCALE_MQ);
    mq.addEventListener('change', updateScale);
    window.addEventListener('resize', updateScale);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', updateScale);
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  /* Spacer height: sheet content only — ResizeObserver here does not track scroll container size. */
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const updateHeight = () => {
      setSheetScrollHeight(sheet.scrollHeight);
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(sheet);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes refresh triggers (e.g. job, profile)
  }, heightRefreshDeps);

  const spacerHeight = sheetScrollHeight * scale;
  const spacerWidth = PREVIEW_LETTER_WIDTH_PX * scale;

  return {
    viewportRef,
    sheetRef,
    scale,
    spacerHeight,
    spacerWidth,
    letterWidthPx: PREVIEW_LETTER_WIDTH_PX,
  };
}
