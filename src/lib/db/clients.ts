import { supabase } from '../supabase';
import type { Client, ClientListItem } from '../../types/db';

/** Escape `%`, `_`, and `\` for use inside a Postgres ILIKE pattern (default escape `\`). */
function escapeIlikePattern(fragment: string): string {
  return fragment.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function normalizeClientSearchFragment(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export interface ClientSearchQuery {
  firstName?: string;
  lastName?: string;
}

export type ListClientItemsResult =
  | { data: ClientListItem[]; error: null }
  | { data: null; error: Error };

type ClientActivityRow = {
  client_id: string | null;
  agreement_date: string | null;
  created_at: string;
};

function getClientLatestActivityAt(row: ClientActivityRow): string {
  const agreementDate = row.agreement_date?.trim();
  return agreementDate ? `${agreementDate}T00:00:00Z` : row.created_at;
}

/**
 * Case-insensitive contains match on `clients.name`, scoped to the user.
 * Returns a broad candidate set for the caller to rank client-side.
 */
export const searchClients = async (
  userId: string,
  query: ClientSearchQuery
): Promise<Client[]> => {
  const firstName = normalizeClientSearchFragment(query.firstName ?? '');
  const lastName = normalizeClientSearchFragment(query.lastName ?? '');
  const terms = Array.from(new Set([firstName, lastName].filter(Boolean)));
  if (terms.length === 0) {
    return [];
  }

  let builder = supabase.from('clients').select('*').eq('user_id', userId);
  if (terms.length === 1) {
    builder = builder.ilike('name', `%${escapeIlikePattern(terms[0])}%`);
  } else {
    builder = builder.or(
      terms.map((term) => `name.ilike.%${escapeIlikePattern(term)}%`).join(',')
    );
  }

  const { data, error } = await builder
    .order('name', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Error searching clients:', error);
    return [];
  }

  return data ?? [];
};

export const listClients = async (userId: string): Promise<Client[]> => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing clients:', error);
    return [];
  }

  return data;
};

export const listClientItems = async (userId: string): Promise<ListClientItemsResult> => {
  const [{ data: clients, error: clientsError }, { data: jobs, error: jobsError }] =
    await Promise.all([
      supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true }),
      supabase
        .from('jobs')
        .select('client_id, agreement_date, created_at')
        .eq('user_id', userId)
        .not('client_id', 'is', null),
    ]);

  if (clientsError) {
    console.error('Error listing client items:', clientsError);
    return { data: null, error: new Error(clientsError.message) };
  }

  if (jobsError) {
    console.error('Error loading client activity:', jobsError);
    return { data: null, error: new Error(jobsError.message) };
  }

  const activityByClientId = new Map<string, { jobCount: number; latestActivityAt: string | null }>();

  for (const rawRow of (jobs ?? []) as ClientActivityRow[]) {
    const clientId = rawRow.client_id;
    if (!clientId) continue;

    const latestActivityAt = getClientLatestActivityAt(rawRow);
    const existing = activityByClientId.get(clientId);

    if (!existing) {
      activityByClientId.set(clientId, { jobCount: 1, latestActivityAt });
      continue;
    }

    activityByClientId.set(clientId, {
      jobCount: existing.jobCount + 1,
      latestActivityAt:
        existing.latestActivityAt && existing.latestActivityAt > latestActivityAt
          ? existing.latestActivityAt
          : latestActivityAt,
    });
  }

  const data = (clients ?? []).map((client) => {
    const activity = activityByClientId.get(client.id);
    return {
      ...client,
      jobCount: activity?.jobCount ?? 0,
      latestActivityAt: activity?.latestActivityAt ?? null,
    };
  });

  return { data, error: null };
};

export const getClientById = async (id: string): Promise<Client | null> => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error loading client by id:', error);
    return null;
  }
  return data ?? null;
};

export const upsertClient = async (client: Partial<Client> & { user_id: string }) => {
  const { data, error } = await supabase
    .from('clients')
    .upsert(client)
    .select()
    .single();

  return { data, error };
};

export const deleteClient = async (id: string) => {
  const { error } = await supabase.from('clients').delete().eq('id', id);

  return { error };
};
