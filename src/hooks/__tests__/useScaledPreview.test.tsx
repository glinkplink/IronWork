// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useScaledPreview,
  PREVIEW_LETTER_WIDTH_PX,
  PREVIEW_DESKTOP_UPSCALE_MQ,
} from '../useScaledPreview';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation((cb: ResizeObserverCallback) => ({
      observe: vi.fn(() => {
        cb([], {} as ResizeObserver);
      }),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    }))
  );
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('useScaledPreview', () => {
  it('exports shared layout constants', () => {
    expect(PREVIEW_LETTER_WIDTH_PX).toBe(816);
    expect(PREVIEW_DESKTOP_UPSCALE_MQ).toBe('(min-width: 1024px)');
  });

  it('returns refs, scale, spacerWidth tied to scale, and spacerHeight as scrollHeight * scale', () => {
    const { result } = renderHook(() => useScaledPreview('a'));

    expect(result.current.letterWidthPx).toBe(816);
    expect(result.current.viewportRef).toBeDefined();
    expect(result.current.sheetRef).toBeDefined();

    // No viewport mounted: scale stays 1; sheet scrollHeight 0 → spacer 0
    expect(result.current.scale).toBe(1);
    expect(result.current.spacerWidth).toBe(816);
    expect(result.current.spacerHeight).toBe(0);
  });
});
