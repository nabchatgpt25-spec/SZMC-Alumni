import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://hjuyiqyviohinbhzaipl.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'sb_publishable_uTT8ybm0tcIb04W4cN54Tg_YujRpZQg';

function resolveCredentials(): { url: string; anonKey: string } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  const envSupabaseUrl = (import.meta.env.SUPABASE_URL as string | undefined)?.trim();
  const envSupabaseAnonKey = (import.meta.env.SUPABASE_ANON_KEY as string | undefined)?.trim();

  // Find a candidate that is a valid URL starting with http:// or https://
  let resolvedUrl = [envUrl, envSupabaseUrl, envAnonKey].find(
    (val) => typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('placeholder.supabase.co')
  );

  // If user pasted publishable key or JWT into VITE_SUPABASE_URL, or swapped them
  let resolvedKey = [envAnonKey, envSupabaseAnonKey, envUrl].find(
    (val) => typeof val === 'string' && (val.startsWith('eyJ') || val.startsWith('sb_publishable_'))
  );

  if (!resolvedUrl) {
    resolvedUrl = DEFAULT_SUPABASE_URL;
  }
  if (!resolvedKey) {
    resolvedKey = DEFAULT_SUPABASE_ANON_KEY;
  }

  return { url: resolvedUrl, anonKey: resolvedKey };
}

const { url: effectiveUrl, anonKey: effectiveAnonKey } = resolveCredentials();

export const isSupabaseConfigured = Boolean(
  effectiveUrl &&
  effectiveAnonKey &&
  effectiveUrl.startsWith('http') &&
  !effectiveUrl.includes('placeholder.supabase.co')
);

export const SUPABASE_API_URL = effectiveUrl;
export const SUPABASE_API_ANON_KEY = effectiveAnonKey;

export const supabase: SupabaseClient = createClient(effectiveUrl, effectiveAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Explicit non-sensitive column list granted to `authenticated` on `public.alumni_profiles`
 * in Migration 003.
 *
 * IMPORTANT: Never run `.select('*')` on `public.alumni_profiles` because column-level
 * SELECT on (email, phone, whatsapp, fb_link, college_roll) is revoked from `authenticated`.
 * Sensitive contact columns must be fetched via `supabase.rpc('get_alumni_contact_details', { p_profile_id })`.
 */
export const ALUMNI_PUBLIC_COLUMNS = [
  'id',
  'auth_user_id',
  'role',
  'full_name',
  'avatar_url',
  'cover_url',
  'batch_year',
  'session',
  'academic_stream',
  'academic_group',
  'section',
  'verification_status',
  'verification_method',
  'vouches_count',
  'vouch_target_count',
  'verified_at',
  'verified_by_profile_id',
  'profession',
  'position',
  'institution',
  'cadre',
  'specialty',
  'specialty_other',
  'degree',
  'city',
  'country',
  'latitude',
  'longitude',
  'bio',
  'career_history',
  'badges',
  'blood_group',
  'is_public',
  'show_contact_to_verified',
  'posts_count',
  'last_seen_at',
  'created_at',
  'updated_at',
].join(', ');
