import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://hjuyiqyviohinbhzaipl.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXlpcXl2aW9oaW5iaHphaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjQ2NzIsImV4cCI6MjEwNzIwMDY3Mn0.fppNXVPWcsWGsUIBwvirhjEkdDyUCX-SyydNWExbwk8';

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
 * Client-side Supabase reference for authenticated sessions.
 * Privileged service-role operations are strictly executed on the backend / Edge Functions.
 */
export const supabaseAdmin: SupabaseClient = supabase;

// Strictly in-memory fallback token holder (never persisted to localStorage)
let inMemoryDirectAuthToken: string | null = null;

export function setInMemoryDirectAuthToken(token: string | null): void {
  inMemoryDirectAuthToken = token && token.trim() ? token.trim() : null;
  if (typeof window !== 'undefined') {
    try {
      // Proactively purge any legacy persisted admin token from localStorage
      localStorage.removeItem('szmc_direct_auth_token');
    } catch {}
  }
}

export function getInMemoryDirectAuthToken(): string | null {
  return inMemoryDirectAuthToken;
}

/**
 * Returns HTTP headers with the active user's Bearer token (Supabase JWT preferred,
 * falling back to in-memory server-issued session token) for authenticated calls to `/api/*`.
 */
export async function getClientAuthHeaders(
  includeJsonContentType = true
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (isSupabaseConfigured) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
        return headers;
      }
    } catch {
      // Fallback to in-memory token if present
    }
  }

  if (inMemoryDirectAuthToken) {
    headers.Authorization = `Bearer ${inMemoryDirectAuthToken}`;
  }

  return headers;
}

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
