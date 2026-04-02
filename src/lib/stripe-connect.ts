import { fetchWithSupabaseAuth } from './fetch-with-supabase-auth';

export type StripeConnectUiStatus = 'not_connected' | 'incomplete' | 'connected';

export interface StripeConnectStartResponse {
  accountId: string;
  url: string;
}

export interface StripeConnectStatusResponse {
  accountId: string | null;
  onboardingComplete: boolean;
  status: StripeConnectUiStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : text || res.statusText;
    throw new Error(msg);
  }

  return json as T;
}

export async function startStripeConnect(): Promise<StripeConnectStartResponse> {
  const res = await fetchWithSupabaseAuth('/api/stripe/connect/start', {
    method: 'POST',
  });
  return readJsonOrThrow<StripeConnectStartResponse>(res);
}

export async function getStripeConnectStatus(): Promise<StripeConnectStatusResponse> {
  const res = await fetchWithSupabaseAuth('/api/stripe/connect/status', {
    method: 'GET',
  });
  return readJsonOrThrow<StripeConnectStatusResponse>(res);
}

export function redirectToStripeConnect(url: string): void {
  window.location.assign(url);
}
