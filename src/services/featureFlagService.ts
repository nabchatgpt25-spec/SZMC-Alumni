import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Server-backed platform feature flags (table: public.app_feature_flags).
 *
 * These MUST live in the database rather than localStorage, otherwise an
 * administrator toggling a switch would only affect their own browser.
 *
 * Read: public (anon + authenticated). Write: admins/moderators only (RLS).
 */

export type FeatureFlagKey =
  | 'member_verification_portal'
  | 'global_verification_gate';

export type FeatureFlagMap = Record<string, boolean>;

/** Safe defaults used before the database answers (and when offline). */
export const FEATURE_FLAG_DEFAULTS: FeatureFlagMap = {
  // Verification system visible to ordinary alumni? Default = hidden (admin-only).
  member_verification_portal: false,
  // Verification gate enforced across auth / gated features.
  global_verification_gate: true,
};

const CACHE_KEY = 'szmc_app_feature_flags_v1';
const FLAGS_EVENT = 'szmc_feature_flags_updated';
const FETCH_TTL_MS = 60_000;

let inFlight: Promise<FeatureFlagMap> | null = null;
let lastFetchAt = 0;
let lastResult: FeatureFlagMap = { ...FEATURE_FLAG_DEFAULTS };

function dispatch(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(FLAGS_EVENT));
  } catch {
    /* ignore */
  }
}

function readCache(): FeatureFlagMap {
  if (typeof window === 'undefined') return { ...FEATURE_FLAG_DEFAULTS };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...FEATURE_FLAG_DEFAULTS, ...parsed };
      }
    }
  } catch {
    /* ignore corrupt cache */
  }
  return { ...FEATURE_FLAG_DEFAULTS };
}

function writeCache(next: FeatureFlagMap): void {
  lastResult = next;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  dispatch();
}

/** Instant, synchronous flags for first paint (DB values are fetched right after). */
export function getCachedFeatureFlags(): FeatureFlagMap {
  return readCache();
}

export function getFeatureFlag(key: FeatureFlagKey): boolean {
  return Boolean(readCache()[key] ?? FEATURE_FLAG_DEFAULTS[key]);
}

/**
 * Load flags from Supabase, caching for a short TTL so dozens of components can
 * call this without hammering the API.
 */
export async function fetchFeatureFlags(force = false): Promise<FeatureFlagMap> {
  if (!isSupabaseConfigured) return readCache();

  if (!force && inFlight) return inFlight;
  if (!force && Date.now() - lastFetchAt < FETCH_TTL_MS) return lastResult;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_feature_flags')
        .select('key, enabled');

      if (error) {
        console.warn('Could not load feature flags, using cached values:', error.message);
        return readCache();
      }

      const next: FeatureFlagMap = { ...FEATURE_FLAG_DEFAULTS };
      (data || []).forEach((row: { key: string; enabled: boolean }) => {
        if (row?.key) next[row.key] = Boolean(row.enabled);
      });

      lastFetchAt = Date.now();
      writeCache(next);
      return next;
    } catch (err) {
      console.warn('Feature flags fetch failed:', err);
      return readCache();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Admin-only write. Returns a structured result so the Admin Panel can show a
 * truthful error (e.g. when the admin has no real Supabase session).
 */
export async function setFeatureFlag(
  key: FeatureFlagKey,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  try {
    const { data, error } = await supabase
      .from('app_feature_flags')
      .upsert(
        { key, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .select('key, enabled');

    if (error) {
      console.error('Failed to save feature flag:', error);
      if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
        return {
          success: false,
          error: 'Only administrators can change this switch. Please sign in again with your admin account.',
        };
      }
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        return {
          success: false,
          error: 'The app_feature_flags table is missing. Run migration 013 in Supabase.',
        };
      }
      return { success: false, error: error.message };
    }

    const saved = Array.isArray(data) ? data[0] : null;
    if (!saved) {
      // RLS may silently swallow the write (no rows returned).
      return {
        success: false,
        error: 'The change was not saved. Confirm you are signed in as an administrator.',
      };
    }

    const next = { ...readCache(), [key]: Boolean(saved.enabled) };
    lastFetchAt = Date.now();
    writeCache(next);
    return { success: true };
  } catch (err: any) {
    console.error('Feature flag update failed:', err);
    return { success: false, error: err?.message || 'Could not save the switch.' };
  }
}

/** Subscribe to flag changes (same-tab + cross-tab). Returns an unsubscribe fn. */
export function onFeatureFlagsChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener();
  window.addEventListener(FLAGS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(FLAGS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
