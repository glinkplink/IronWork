import { supabase } from '../supabase';
import type { Client } from '../../types/db';

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
