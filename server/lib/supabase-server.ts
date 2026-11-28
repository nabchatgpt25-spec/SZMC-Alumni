import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ quiet: true });

export const DEFAULT_SUPABASE_URL = 'https://hjuyiqyviohinbhzaipl.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXlpcXl2aW9oaW5iaHphaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjQ2NzIsImV4cCI6MjEwNzIwMDY3Mn0.fppNXVPWcsWGsUIBwvirhjEkdDyUCX-SyydNWExbwk8';

const urlCandidates = [
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
];
const rawUrl = (
  urlCandidates.find(
    (u) =>
      typeof u === 'string' &&
      (u.trim().startsWith('http://') || u.trim().startsWith('https://')) &&
      !u.includes('placeholder.supabase.co')
  ) || DEFAULT_SUPABASE_URL
).trim();

// Strictly load service_role key from environment variables (never hardcode secrets in source)
const envServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!envServiceRoleKey) {
  console.warn(
    '[SupabaseServer] SUPABASE_SERVICE_ROLE_KEY is not set in environment; falling back to anon key (privileged admin writes will be subject to RLS).'
  );
}

const keyCandidates = [
  envServiceRoleKey,
  process.env.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.startsWith('http')
    ? process.env.VITE_SUPABASE_URL
    : undefined,
  process.env.VITE_SUPABASE_ANON_KEY,
];
const rawKey = (
  keyCandidates.find(
    (k) =>
      typeof k === 'string' &&
      (k.trim().startsWith('eyJ') || k.trim().startsWith('sb_') || k.trim().length > 30)
  ) || DEFAULT_SUPABASE_ANON_KEY
).trim();

export const isSupabaseServiceRoleConfigured = Boolean(envServiceRoleKey);

export const isSupabaseServerConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl.startsWith('http') &&
  !rawUrl.includes('placeholder.supabase.co')
);

const anonKeyCandidates = [
  process.env.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY,
];
const effectiveAnonKey = (
  anonKeyCandidates.find(
    (k) =>
      typeof k === 'string' &&
      (k.trim().startsWith('eyJ') || k.trim().startsWith('sb_') || k.trim().length > 30)
  ) || DEFAULT_SUPABASE_ANON_KEY
).trim();

// Safe fallback client for server-side execution so imports never fail at startup
const effectiveUrl = isSupabaseServerConfigured ? rawUrl : DEFAULT_SUPABASE_URL;
const effectiveKey = isSupabaseServerConfigured ? rawKey : DEFAULT_SUPABASE_ANON_KEY;

export const supabaseServer: SupabaseClient = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Creates a stateless per-request Supabase client authenticated with a verified
 * caller's Supabase Auth JWT so Postgres RLS policies evaluate against the caller's role.
 */
export function createUserScopedSupabaseClient(accessToken?: string | null): SupabaseClient | null {
  const cleanToken = accessToken?.trim();
  if (!isSupabaseServerConfigured || !cleanToken || !cleanToken.startsWith('eyJ')) {
    return null;
  }
  return createClient(effectiveUrl, effectiveAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    },
  });
}

/**
 * Performs a stateless password sign-in against Supabase Auth using a fresh per-call
 * anon client so the shared service-role client is never mutated.
 */
export async function signInStatelessSupabasePassword(
  email: string,
  password: string
): Promise<{ session: any | null; user: any | null; error: any | null }> {
  if (!isSupabaseServerConfigured) {
    return { session: null, user: null, error: null };
  }
  const authClient = createClient(effectiveUrl, effectiveAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return {
    session: data?.session || null,
    user: data?.user || null,
    error: error || null,
  };
}

/**
 * Resolves the highest-privilege authorized Supabase client for server-side writes:
 * 1) Service-role client when SUPABASE_SERVICE_ROLE_KEY is configured.
 * 2) User-scoped client when the request carries a verified Supabase Auth JWT.
 * 3) null when only the anon key is available (prevents guaranteed RLS/permission errors).
 */
export function getSupabaseWriteClient(
  accessToken?: string | null
): { client: SupabaseClient; mode: 'service_role' | 'user_jwt' } | null {
  if (!isSupabaseServerConfigured) return null;
  if (isSupabaseServiceRoleConfigured) {
    return { client: supabaseServer, mode: 'service_role' };
  }
  const userClient = createUserScopedSupabaseClient(accessToken);
  if (userClient) {
    return { client: userClient, mode: 'user_jwt' };
  }
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bounded lookup for a Supabase Auth user without unbounded auth.admin.listUsers() calls.
 * Checks direct O(1) getUserById() first when authUserId is provided, then iterates paginated
 * listUsers({ page, perPage }) with an explicit upper bound and early exit.
 */
export async function findAuthUserByEmailOrPhone(params: {
  authUserId?: string | null;
  email?: string | null;
  phone?: string | null;
  maxPages?: number;
  perPage?: number;
}): Promise<any | null> {
  if (!isSupabaseServerConfigured || !isSupabaseServiceRoleConfigured) {
    return null;
  }

  const cleanAuthId = params.authUserId?.trim();
  if (cleanAuthId && UUID_REGEX.test(cleanAuthId)) {
    try {
      const { data, error } = await supabaseServer.auth.admin.getUserById(cleanAuthId);
      if (!error && data?.user) {
        return data.user;
      }
    } catch {
      // Fall through to bounded search
    }
  }

  const cleanEmail = params.email?.trim().toLowerCase() || '';
  const cleanPhone = params.phone?.trim() || '';
  if (!cleanEmail && !cleanPhone) {
    return null;
  }

  // Fast-path: resolve auth_user_id from public.alumni_profiles (indexed email/phone lookup)
  try {
    let profileQuery = supabaseServer
      .from(SUPABASE_TABLES.ALUMNI_PROFILES)
      .select('auth_user_id');

    if (cleanEmail) {
      profileQuery = profileQuery.ilike('email', cleanEmail);
    } else if (cleanPhone) {
      profileQuery = profileQuery.eq('phone', cleanPhone);
    }

    const { data: profileRow } = await profileQuery.maybeSingle();
    if (profileRow?.auth_user_id && UUID_REGEX.test(profileRow.auth_user_id)) {
      const { data: authRes, error: authErr } = await supabaseServer.auth.admin.getUserById(
        profileRow.auth_user_id
      );
      if (!authErr && authRes?.user) {
        return authRes.user;
      }
    }
  } catch {
    // Fall through to bounded pagination
  }

  const maxPages = Math.min(Math.max(params.maxPages ?? 20, 1), 50);
  const perPage = Math.min(Math.max(params.perPage ?? 100, 10), 1000);

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
      if (error || !Array.isArray(data?.users) || data.users.length === 0) {
        break;
      }

      const matched = data.users.find(
        (u: any) =>
          (cleanEmail && u.email?.toLowerCase() === cleanEmail) ||
          (cleanPhone && u.phone === cleanPhone)
      );
      if (matched) {
        return matched;
      }

      if (data.users.length < perPage) {
        break;
      }
    } catch {
      break;
    }
  }

  return null;
}


/**
 * Reconciled Supabase Table Name Constants
 * Matches the source-of-truth schema in /supabase/migrations/001_core_schema.sql
 */
export const SUPABASE_TABLES = {
  ALUMNI_PROFILES: 'alumni_profiles',
  PROFILES: 'profiles',
  CONNECTIONS: 'connections',
  BATCHES: 'batches',
  ACADEMIC_STREAM_GROUPS: 'academic_stream_groups',
  POSTS: 'posts',
  POST_COMMENTS: 'post_comments',
  POST_LIKES: 'post_likes',
  SAVED_POSTS: 'saved_posts', // Reconciled: saved_posts (not post_saves)
  VERIFICATION_REQUESTS: 'verification_requests', // Reconciled: verification_requests (not verification_submissions)
  ADMIN_DOC_SUBMISSIONS: 'admin_doc_submissions',
  PEER_VOUCHES: 'peer_vouches',
  BLOOD_DONORS: 'blood_donors', // Reconciled: blood_donors (not blood_donor_registrations)
  BLOOD_REQUESTS: 'blood_requests', // Reconciled: blood_requests (not blood_emergency_requests)
  BLOOD_REQUEST_RESPONSES: 'blood_request_responses', // Reconciled: blood_request_responses (not blood_donation_responses)
  NOTIFICATIONS: 'notifications',
  GALLERY_ALBUMS: 'gallery_albums',
  GALLERY_PHOTOS: 'gallery_photos',
  OFFICIAL_NOTICES: 'official_notices',
  CONTACT_INQUIRIES: 'contact_inquiries',
  AUDIT_LOGS: 'audit_logs', // Reconciled: audit_logs (not security_audit_logs)
  SITE_SETTINGS: 'site_settings',
  FEATURED_ALUMNI: 'featured_alumni',
  HALL_OF_FAME: 'hall_of_fame',
  CAREER_OPPORTUNITIES: 'career_opportunities',
  MENTORSHIP_REQUESTS: 'mentorship_requests',
  MENTOR_OFFERS: 'mentor_offers',
  EVENTS: 'events',
  EVENT_REGISTRATIONS: 'event_registrations',
  APP_FEATURE_FLAGS: 'app_feature_flags',
  BATCH_LOUNGES: 'batch_lounges',
  BATCH_LOUNGE_MODERATORS: 'batch_lounge_moderators',
  OFFICIAL_PAGES: 'official_pages',
  OFFICIAL_PAGE_ROLES: 'official_page_roles',
  OFFICIAL_PAGE_FOLLOWERS: 'official_page_followers',
  COMMUNITY_POLLS: 'community_polls',
  COMMUNITY_POLL_VOTES: 'community_poll_votes',
  FEED_RANKING_WEIGHTS: 'feed_ranking_weights',
  CONTENT_REPORTS: 'content_reports',
  USER_BLOCKS: 'user_blocks',
} as const;
