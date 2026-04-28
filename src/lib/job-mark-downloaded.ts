import { fetchWithSupabaseAuth } from './fetch-with-supabase-auth';
import type { Job } from '../types/db';

export async function markJobDownloaded(jobId: string): Promise<{
  data: Job | null;
  error: Error | null;
}> {
  try {
    const res = await fetchWithSupabaseAuth(
      `/api/jobs/${encodeURIComponent(jobId)}/mark-downloaded`,
      { method: 'POST' }
    );

    const json = (await res.json().catch(() => ({}))) as {
      job?: Job;
      error?: string;
    };

    if (!res.ok) {
      return {
        data: null,
        error: new Error(json.error || 'Could not mark work order as downloaded'),
      };
    }

    return { data: json.job || null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Could not mark work order as downloaded'),
    };
  }
}
