import { fetchWithSupabaseAuth } from './fetch-with-supabase-auth';
import type { Job } from '../types/db';

export async function backfillJobFromClient(jobId: string): Promise<{
  data: Job | null;
  updated: boolean;
  error: Error | null;
}> {
  try {
    const res = await fetchWithSupabaseAuth(
      `/api/jobs/${encodeURIComponent(jobId)}/backfill-from-client`,
      { method: 'POST' }
    );

    const json = (await res.json().catch(() => ({}))) as {
      job?: Job;
      updated?: boolean;
      error?: string;
    };

    if (!res.ok) {
      return {
        data: null,
        updated: false,
        error: new Error(json.error || 'Could not update work order from client.'),
      };
    }

    return { data: json.job || null, updated: Boolean(json.updated), error: null };
  } catch (err) {
    return {
      data: null,
      updated: false,
      error: err instanceof Error ? err : new Error('Could not update work order from client.'),
    };
  }
}
