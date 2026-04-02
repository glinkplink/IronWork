import { useEffect, useRef } from 'react';
import { ESIGN_POLL_INTERVAL_MS } from '../lib/esign-live';

interface UseEsignPollerOptions {
  enabled: boolean;
  pollOnce: () => Promise<boolean>;
}

/** Shared timer + visibility wiring for short-lived e-sign polling surfaces. */
export function useEsignPoller({ enabled, pollOnce }: UseEsignPollerOptions) {
  const pollOnceRef = useRef(pollOnce);

  useEffect(() => {
    pollOnceRef.current = pollOnce;
  }, [pollOnce]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const runPoll = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      let shouldContinue = true;
      try {
        shouldContinue = await pollOnceRef.current();
      } catch (err) {
        console.error('[useEsignPoller] poll error (will retry):', err);
      }
      if (cancelled) return;
      if (shouldContinue) {
        schedule();
      }
    };

    const schedule = () => {
      clearTimer();
      timerId = setTimeout(() => {
        void runPoll();
      }, ESIGN_POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        clearTimer();
        void runPoll();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    schedule();

    return () => {
      cancelled = true;
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled]);
}
