import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/db/profile';
import type { BusinessProfile } from '../types/db';
import type { AppView } from './useAppNavigation';
import type { CaptureFlowFinishedPayload } from '../types/capture-flow';

const POST_CAPTURE_KEY = 'scope-lock-post-capture';
const POST_CAPTURE_TTL_MS = 5 * 60 * 1000;

type PostCapturePayloadV2 = {
  userId: string;
  ts: number;
  captureKind: 'pdf' | 'esign';
  ok: boolean;
};

/** Legacy sessionStorage shape (treated as PDF outcome). */
type PostCapturePayloadLegacy = { userId: string; ts: number; pdfOk: boolean };

export type UseAuthProfileOptions = {
  replaceView: (next: AppView) => void;
  setWorkOrdersSuccessBanner: (msg: string | null) => void;
};

export function useAuthProfile({
  replaceView,
  setWorkOrdersSuccessBanner,
}: UseAuthProfileOptions) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const runPostCaptureRedirect = useCallback(
    ({ captureKind, ok }: CaptureFlowFinishedPayload) => {
      if (captureKind === 'esign') {
        setWorkOrdersSuccessBanner(
          ok
            ? 'Work order saved. Signature request sent to the customer.'
            : 'Work order saved. Signature email could not be sent — open the work order to try again.'
        );
      } else {
        setWorkOrdersSuccessBanner(
          ok
            ? 'Work order saved. PDF downloaded.'
            : 'Work order saved. PDF could not be generated — open the work order to try again.'
        );
      }
      replaceView('work-orders');
    },
    [replaceView, setWorkOrdersSuccessBanner]
  );

  const handleCaptureFlowFinished = useCallback(
    async (opts: CaptureFlowFinishedPayload) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const payload: PostCapturePayloadV2 = {
        userId: uid,
        ts: Date.now(),
        captureKind: opts.captureKind,
        ok: opts.ok,
      };

      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        runPostCaptureRedirect(opts);
        return;
      }

      try {
        sessionStorage.setItem(POST_CAPTURE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [runPostCaptureRedirect]
  );

  useEffect(() => {
    const tryFlushPendingPostCapture = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      const uid = user?.id;
      if (!uid) return;

      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(POST_CAPTURE_KEY);
      } catch {
        return;
      }
      if (!raw) return;

      let parsed: PostCapturePayloadV2 | PostCapturePayloadLegacy | null = null;
      try {
        parsed = JSON.parse(raw) as PostCapturePayloadV2 | PostCapturePayloadLegacy;
      } catch {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      if (!parsed || typeof parsed.ts !== 'number' || typeof parsed.userId !== 'string') {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      let normalized: CaptureFlowFinishedPayload | null = null;
      if ('captureKind' in parsed && 'ok' in parsed) {
        if (
          (parsed.captureKind === 'pdf' || parsed.captureKind === 'esign') &&
          typeof parsed.ok === 'boolean'
        ) {
          normalized = { captureKind: parsed.captureKind, ok: parsed.ok };
        }
      } else if ('pdfOk' in parsed && typeof parsed.pdfOk === 'boolean') {
        normalized = { captureKind: 'pdf', ok: parsed.pdfOk };
      }

      if (!normalized) {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      if (parsed.userId !== uid) {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      if (Date.now() - parsed.ts > POST_CAPTURE_TTL_MS) {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      try {
        sessionStorage.removeItem(POST_CAPTURE_KEY);
      } catch {
        /* ignore */
      }
      runPostCaptureRedirect(normalized);
    };

    document.addEventListener('visibilitychange', tryFlushPendingPostCapture);
    tryFlushPendingPostCapture();
    return () => document.removeEventListener('visibilitychange', tryFlushPendingPostCapture);
  }, [user?.id, runPostCaptureRedirect]);

  useEffect(() => {
    const uid = user?.id;
    if (uid) {
      const run = async () => {
        setProfileLoading(true);
        const data = await getProfile(uid);
        if (data) {
          setProfile(data);
        } else {
          setProfile((prev) => (prev?.user_id === uid ? prev : null));
        }
        setProfileLoading(false);
      };
      void run();
    } else {
      Promise.resolve().then(() => {
        setProfile(null);
        setProfileLoading(false);
      });
    }
  }, [user?.id]);

  const loadProfile = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      if (!silent) setProfileLoading(false);
      return;
    }
    if (!silent) setProfileLoading(true);
    const data = await getProfile(uid);
    if (data) {
      setProfile(data);
    } else {
      setProfile((prev) => (prev?.user_id === uid ? prev : null));
    }
    if (!silent) setProfileLoading(false);
  };

  return {
    user,
    authLoading,
    profile,
    profileLoading,
    setProfile,
    loadProfile,
    handleCaptureFlowFinished,
  };
}
