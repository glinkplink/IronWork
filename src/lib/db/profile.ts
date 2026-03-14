import { supabase } from '../supabase';
import type { BusinessProfile } from '../../types/db';

export const getProfile = async (userId: string): Promise<BusinessProfile | null> => {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data;
};

export const upsertProfile = async (
  profile: Partial<BusinessProfile> & { user_id: string }
) => {
  const { data, error } = await supabase
    .from('business_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();

  return { data, error };
};
