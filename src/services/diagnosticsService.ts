import { supabase, isSupabaseConfigured, SUPABASE_API_URL } from '../lib/supabase';
import { FEATURE_FLAG_DEFAULTS } from './featureFlagService';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What the operator should do when this check fails. */
  fix?: string;
}

const DIRECT_AUTH_KEY = 'szmc_direct_authenticated_user';

function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

/** Turn any thrown value / PostgREST error into a readable line. */
function describeError(err: any): string {
  if (!err) return 'Unknown error';
  const parts = [
    err.code ? `code=${err.code}` : '',
    err.message || err.error_description || err.error || str(err),
    err.details ? `details=${err.details}` : '',
    err.hint ? `hint=${err.hint}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

function hintFor(code?: string, message?: string): string | undefined {
  const m = (message || '').toLowerCase();
  if (code === '42501' || m.includes('permission denied')) {
    return 'Permission problem: run the SQL blocks from the setup guide (Block C) in the Supabase SQL Editor — the GRANTs are missing.';
  }
  if (code === '42P01' || m.includes('does not exist')) {
    return 'A table or function is missing: the full schema (APPLY_ALL.sql) was not applied on this Supabase project.';
  }
  if (m.includes('row-level security')) {
    return 'RLS blocked the write, which almost always means you are NOT signed in with a real Supabase session (local/offline login). Log out and log in again with your email + password.';
  }
  if (code === '23503' || m.includes('foreign key')) {
    return 'Missing reference data: public.batches is empty. Run SQL Block A.';
  }
  if (m.includes('jwt') || m.includes('invalid api key') || m.includes('no api key')) {
    return 'This build is pointing at the wrong Supabase project or an invalid anon key. Rebuild with the correct VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'The browser could not reach Supabase: wrong URL, blocked network, or the project is paused.';
  }
  return undefined;
}

/**
 * Runs a full read/write health check against the configured Supabase project.
 * Everything here is safe: the test post is deleted again.
 */
export async function runDiagnostics(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  const push = (c: DiagnosticCheck) => checks.push(c);

  // 1. Client configuration -------------------------------------------------
  push({
    id: 'config',
    label: 'Supabase client configuration',
    status: isSupabaseConfigured ? 'ok' : 'fail',
    detail: isSupabaseConfigured
      ? `Project URL: ${SUPABASE_API_URL}`
      : 'Supabase is not configured in this build (no URL / anon key).',
    fix: isSupabaseConfigured
      ? undefined
      : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before building, then redeploy.',
  });

  if (!isSupabaseConfigured) return checks;

  // 2. Project reachability -------------------------------------------------
  try {
    const res = await fetch(`${SUPABASE_API_URL}/rest/v1/`, {
      headers: { apikey: (supabase as any).supabaseKey || '' },
    });
    push({
      id: 'reachable',
      label: 'Project reachable',
      status: res.ok || res.status === 404 ? 'ok' : 'warn',
      detail: `HTTP ${res.status} from ${SUPABASE_API_URL}`,
      fix: res.ok ? undefined : 'Check that the project is not paused and the URL is correct.',
    });
  } catch (err: any) {
    push({
      id: 'reachable',
      label: 'Project reachable',
      status: 'fail',
      detail: describeError(err),
      fix: 'Network/CORS problem reaching Supabase.',
    });
  }

  // 3. Auth session ---------------------------------------------------------
  let sessionUserId: string | null = null;
  let sessionEmail = '';
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    sessionUserId = data.session?.user?.id ?? null;
    sessionEmail = data.session?.user?.email ?? '';
    push({
      id: 'session',
      label: 'Real Supabase login session',
      status: sessionUserId ? 'ok' : 'fail',
      detail: sessionUserId
        ? `Signed in as ${sessionEmail || sessionUserId}`
        : 'NO SUPABASE SESSION — the app is running in local/offline mode.',
      fix: sessionUserId
        ? undefined
        : 'Log out, then log in with your email + password. If login says "Email not confirmed", turn OFF "Confirm email" in Supabase → Authentication → Providers → Email.',
    });
  } catch (err: any) {
    push({
      id: 'session',
      label: 'Real Supabase login session',
      status: 'fail',
      detail: describeError(err),
      fix: hintFor(err?.code, err?.message),
    });
  }

  // 4. Local ("fake") login present? ---------------------------------------
  let localUser: any = null;
  try {
    const raw = localStorage.getItem(DIRECT_AUTH_KEY);
    if (raw) localUser = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  if (localUser) {
    push({
      id: 'localmode',
      label: 'Local login record in this browser',
      status: sessionUserId ? 'warn' : 'fail',
      detail: `Found ${DIRECT_AUTH_KEY} → ${localUser.fullName || localUser.email || 'unknown'} (${
        localUser.role || 'member'
      }, authUserId=${localUser.authUserId || 'none'})`,
      fix: sessionUserId
        ? 'A stale local record exists next to a real session. It is now only used as a fallback.'
        : 'This is why the UI looks logged in but nothing saves. Use "Clear local login" below, then sign in again.',
    });
  }

  // 5. Profile row ----------------------------------------------------------
  let profileId: number | null = null;
  if (sessionUserId) {
    const { data, error } = await supabase
      .from('alumni_profiles')
      .select('id, full_name, role, verification_status, batch_year')
      .eq('auth_user_id', sessionUserId)
      .maybeSingle();

    if (error) {
      push({
        id: 'profile',
        label: 'Alumni profile row',
        status: 'fail',
        detail: describeError(error),
        fix: hintFor(error.code, error.message),
      });
    } else if (!data) {
      push({
        id: 'profile',
        label: 'Alumni profile row',
        status: 'fail',
        detail: 'No alumni_profiles row for this auth user.',
        fix: 'Run the Block C SQL (it creates the signup trigger and backfills existing users).',
      });
    } else {
      profileId = Number(data.id);
      push({
        id: 'profile',
        label: 'Alumni profile row',
        status: 'ok',
        detail: `id=${data.id} · ${data.full_name} · role=${data.role} · ${data.verification_status} · batch ${data.batch_year}`,
      });
    }
  }

  // 6. current_profile_id() RPC --------------------------------------------
  if (sessionUserId) {
    const { data, error } = await supabase.rpc('current_profile_id');
    push({
      id: 'rpc',
      label: 'current_profile_id() function',
      status: error ? 'fail' : data ? 'ok' : 'warn',
      detail: error ? describeError(error) : `returns ${data}`,
      fix: error
        ? hintFor(error.code, error.message)
        : data
        ? undefined
        : 'The function returns NULL: your profile is not linked to auth_user_id. Run Block C.',
    });
  }

  // 7. Feed read ------------------------------------------------------------
  {
    const { data, error } = await supabase
      .from('posts')
      .select('id')
      .eq('is_deleted', false)
      .limit(5);
    push({
      id: 'read',
      label: 'Read posts table',
      status: error ? 'fail' : 'ok',
      detail: error ? describeError(error) : `${(data || []).length} post(s) visible`,
      fix: hintFor(error?.code, error?.message),
    });
  }

  // 8. Posts write (the actual "cannot post" check) -------------------------
  if (sessionUserId && profileId) {
    const marker = `[diagnostic ${new Date().toISOString()}]`;
    const { data, error } = await supabase
      .from('posts')
      .insert({ author_id: profileId, content: marker, category: 'General Update', images: [], videos: [] })
      .select('id')
      .single();

    if (error) {
      push({
        id: 'write',
        label: 'Create a post (write test)',
        status: 'fail',
        detail: describeError(error),
        fix: hintFor(error.code, error.message),
      });
    } else {
      push({
        id: 'write',
        label: 'Create a post (write test)',
        status: 'ok',
        detail: `Inserted post #${data?.id} and deleting it again…`,
      });
      const { error: delErr } = await supabase.from('posts').delete().eq('id', data!.id);
      if (delErr) {
        push({
          id: 'write-cleanup',
          label: 'Delete the test post',
          status: 'warn',
          detail: `Could not delete post #${data!.id}: ${describeError(delErr)} — delete it manually.`,
        });
      }
    }
  } else {
    push({
      id: 'write',
      label: 'Create a post (write test)',
      status: 'fail',
      detail: 'Skipped: no Supabase session or no profile row.',
      fix: 'Fix the two checks above first.',
    });
  }

  // 9. Feature flags --------------------------------------------------------
  {
    const { data, error } = await supabase.from('app_feature_flags').select('key, enabled');
    const map: Record<string, boolean> = { ...FEATURE_FLAG_DEFAULTS };
    (data || []).forEach((r: any) => (map[r.key] = Boolean(r.enabled)));
    push({
      id: 'flags',
      label: 'Feature flags table',
      status: error ? 'fail' : 'ok',
      detail: error
        ? describeError(error)
        : Object.entries(map)
            .map(([k, v]) => `${k}=${v}`)
            .join(' · '),
      fix: hintFor(error?.code, error?.message),
    });
  }

  // 10. Storage buckets ----------------------------------------------------
  {
    const { error } = await supabase.storage.from('post-media').list('', { limit: 1 });
    push({
      id: 'storage',
      label: 'Storage bucket "post-media"',
      status: error ? 'fail' : 'ok',
      detail: error ? describeError(error) : 'bucket reachable',
      fix: error ? 'Re-run the storage section of APPLY_ALL.sql, or create the bucket manually (public, 20 MB).' : undefined,
    });
  }

  return checks;
}

/** Removes the stale local login record so the app stops pretending to be logged in. */
export function clearLocalLoginRecord(): void {
  try {
    localStorage.removeItem(DIRECT_AUTH_KEY);
  } catch {
    /* ignore */
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
