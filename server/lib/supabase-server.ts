import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// Prefer service_role key for administrative operations if provided, otherwise fallback to anon key
const keyCandidates = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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

export const isSupabaseServerConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl.startsWith('http') &&
  !rawUrl.includes('placeholder.supabase.co')
);

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
 * Reconciled Supabase Table Name Constants
 * Matches the source-of-truth schema in /supabase/migrations/001_core_schema.sql
 */
export const SUPABASE_TABLES = {
  ALUMNI_PROFILES: 'alumni_profiles',
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
} as const;
