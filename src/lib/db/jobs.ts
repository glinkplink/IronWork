import { supabase } from '../supabase';
import type { Job } from '../../types/db';

export const listJobs = async (userId: string): Promise<Job[]> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing jobs:', error);
    return [];
  }

  return data;
};

export const createJob = async (job: Partial<Job> & { user_id: string }) => {
  const { data, error } = await supabase
    .from('jobs')
    .insert(job)
    .select()
    .single();

  return { data, error };
};

export const updateJob = async (id: string, job: Partial<Job>) => {
  const { data, error } = await supabase
    .from('jobs')
    .update(job)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
};

export const deleteJob = async (id: string) => {
  const { error } = await supabase.from('jobs').delete().eq('id', id);

  return { error };
};
