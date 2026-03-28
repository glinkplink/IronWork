// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useEsignPoller } from '../useEsignPoller';
import { ESIGN_POLL_INTERVAL_MS } from '../../lib/esign-live';

const visibilityStateRef = { current: 'visible' as DocumentVisibilityState };

function setVisibilityState(next: DocumentVisibilityState) {
  visibilityStateRef.current = next;
}

function PollerHarness({
  enabled,
  pollOnce,
}: {
  enabled: boolean;
  pollOnce: () => Promise<boolean>;
}) {
  useEsignPoller({ enabled, pollOnce });
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setVisibilityState('visible');
});

describe('useEsignPoller', () => {
  it('does not poll when disabled', async () => {
    vi.useFakeTimers();
    const pollOnce = vi.fn(async () => true);

    render(<PollerHarness enabled={false} pollOnce={pollOnce} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESIGN_POLL_INTERVAL_MS * 2);
    });

    expect(pollOnce).not.toHaveBeenCalled();
  });

  it('polls on the configured interval and stops when callback returns false', async () => {
    vi.useFakeTimers();
    const pollOnce = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    render(<PollerHarness enabled pollOnce={pollOnce} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESIGN_POLL_INTERVAL_MS);
    });
    expect(pollOnce).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESIGN_POLL_INTERVAL_MS);
    });
    expect(pollOnce).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESIGN_POLL_INTERVAL_MS * 2);
    });
    expect(pollOnce).toHaveBeenCalledTimes(2);
  });

  it('pauses while the tab is hidden and polls immediately when visible again', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get() {
        return visibilityStateRef.current;
      },
    });

    const pollOnce = vi.fn(async () => true);
    render(<PollerHarness enabled pollOnce={pollOnce} />);

    setVisibilityState('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESIGN_POLL_INTERVAL_MS);
    });
    expect(pollOnce).not.toHaveBeenCalled();

    setVisibilityState('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(pollOnce).toHaveBeenCalledTimes(1);
  });
});
