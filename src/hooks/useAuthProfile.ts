import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/db/profile';
import type { BusinessProfile } from '../types/db';
import type { AppView } from './useAppNavigation';

const POST_CAPTURE_KEY = 'scope-lock-post-capture';
const POST_CAPTURE_TTL_MS = 5 * 60 * 1000;

type PostCapturePayload = { userId: string; ts: number; pdfOk: boolean };

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
    (pdfOk: boolean) => {
      setWorkOrdersSuccessBanner(
        pdfOk
          ? 'Work order saved. PDF downloaded.'
          : 'Work order saved. PDF could not be generated — open the work order to try again.'
      );
      replaceView('work-orders');
    },
    [replaceView, setWorkOrdersSuccessBanner]
  );

  const handleCaptureFlowFinished = useCallback(
    async ({ pdfOk }: { pdfOk: boolean }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const payload: PostCapturePayload = { userId: uid, ts: Date.now(), pdfOk };

      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        runPostCaptureRedirect(pdfOk);
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

      let parsed: PostCapturePayload | null = null;
      try {
        parsed = JSON.parse(raw) as PostCapturePayload;
      } catch {
        try {
          sessionStorage.removeItem(POST_CAPTURE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

      if (
        !parsed ||
        typeof parsed.ts !== 'number' ||
        typeof parsed.userId !== 'string' ||
        typeof parsed.pdfOk !== 'boolean'
      ) {
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
      runPostCaptureRedirect(parsed.pdfOk);
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
