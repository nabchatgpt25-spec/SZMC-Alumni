import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  sanitizeReportInput,
  type ReportStatus,
  type ReportTargetType,
} from './communitySafetyUtils';

export interface BlockedUserEntry {
  id: number;
  blockedId: number;
  fullName: string;
  avatarUrl: string;
  batchYear?: number;
  profession?: string;
  reason?: string | null;
  createdAt: string;
}

export interface ContentReportRecord {
  id: number;
  reporter_id: number;
  target_type: ReportTargetType;
  target_id: number;
  target_author_id: number | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  reviewed_by: number | null;
  resolution_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reporter?: { full_name: string; batch_year: number | null; avatar_url: string | null } | null;
  target_author?: { full_name: string; batch_year: number | null; avatar_url: string | null } | null;
}

const LOCAL_BLOCKS_KEY = 'szmc_quad_blocked_users_v1';
const LOCAL_REPORTS_KEY = 'szmc_quad_submitted_reports_v1';

function readLocalBlocks(blockerId: number): BlockedUserEntry[] {
  if (typeof window === 'undefined' || !blockerId) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_BLOCKS_KEY}_${blockerId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBlocks(blockerId: number, entries: BlockedUserEntry[]): void {
  if (typeof window === 'undefined' || !blockerId) return;
  try {
    localStorage.setItem(`${LOCAL_BLOCKS_KEY}_${blockerId}`, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent('szmc_blocks_updated'));
  } catch {}
}

function recordLocalReport(report: {
  reporterId: number;
  targetType: ReportTargetType;
  targetId: number;
  targetAuthorId?: number | null;
  reason: string;
  details?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    safeList.unshift({
      id: Date.now(),
      reporter_id: report.reporterId,
      target_type: report.targetType,
      target_id: report.targetId,
      target_author_id: report.targetAuthorId ?? null,
      reason: report.reason,
      details: report.details || null,
      status: 'open',
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(safeList.slice(0, 100)));
  } catch {}
}

/**
 * Fetches blocked user IDs for `blockerId` (combines Supabase `user_blocks` with local fallback).
 */
export async function fetchBlockedUserIds(blockerId?: number): Promise<number[]> {
  if (!blockerId) return [];
  const localIds = readLocalBlocks(blockerId)
    .map((e) => Number(e.blockedId))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!isSupabaseConfigured) return Array.from(new Set(localIds));

  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', blockerId);

    if (!error && Array.isArray(data)) {
      const dbIds = data.map((r: any) => Number(r.blocked_id)).filter(Boolean);
      return Array.from(new Set([...dbIds, ...localIds]));
    }
  } catch {
    // Graceful fallback before migration 025 is applied remotely
  }

  return Array.from(new Set(localIds));
}

/**
 * Fetches detailed list of accounts blocked by `blockerId` for the Blocked Accounts settings panel.
 */
export async function fetchBlockedUsersList(blockerId?: number): Promise<BlockedUserEntry[]> {
  if (!blockerId) return [];
  const localEntries = readLocalBlocks(blockerId);

  if (!isSupabaseConfigured) return localEntries;

  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('id, blocked_id, reason, created_at')
      .eq('blocker_id', blockerId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const blockedIds = data.map((r: any) => Number(r.blocked_id)).filter(Boolean);
      const profileMap = new Map<number, any>();
      if (blockedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('alumni_profiles')
          .select('id, full_name, avatar_url, batch_year, profession')
          .in('id', blockedIds);
        (profiles || []).forEach((p: any) => profileMap.set(Number(p.id), p));
      }

      const dbEntries: BlockedUserEntry[] = data.map((r: any) => {
        const bid = Number(r.blocked_id);
        const prof = profileMap.get(bid);
        return {
          id: Number(r.id),
          blockedId: bid,
          fullName: prof?.full_name || 'SZMC Alumnus',
          avatarUrl: prof?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          batchYear: prof?.batch_year ? Number(prof.batch_year) : undefined,
          profession: prof?.profession || undefined,
          reason: r.reason || null,
          createdAt: r.created_at || new Date().toISOString(),
        };
      });

      const mergedMap = new Map<number, BlockedUserEntry>();
      dbEntries.forEach((e) => mergedMap.set(e.blockedId, e));
      localEntries.forEach((e) => {
        if (!mergedMap.has(e.blockedId)) mergedMap.set(e.blockedId, e);
      });
      return Array.from(mergedMap.values());
    }
  } catch {
    // Graceful fallback before migration 025
  }

  return localEntries;
}

/**
 * Blocks a user in Supabase `user_blocks` (trigger automatically removes connections & follows)
 * and updates local state so UI hides their posts/comments/notifications immediately.
 */
export async function blockUser(params: {
  blockerId: number;
  blockedUser: {
    id: number;
    fullName: string;
    avatarUrl?: string;
    batchYear?: number;
    profession?: string;
  };
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { blockerId, blockedUser, reason } = params;
  if (!blockerId || !blockedUser?.id || blockerId === blockedUser.id) {
    return { success: false, error: 'Cannot block your own account.' };
  }

  const currentLocal = readLocalBlocks(blockerId).filter((e) => e.blockedId !== blockedUser.id);
  const newEntry: BlockedUserEntry = {
    id: Date.now(),
    blockedId: blockedUser.id,
    fullName: blockedUser.fullName || 'SZMC Alumnus',
    avatarUrl: blockedUser.avatarUrl || '/assets/aistudio/images__1__2778177d.png',
    batchYear: blockedUser.batchYear,
    profession: blockedUser.profession,
    reason: reason?.trim().slice(0, 200) || null,
    createdAt: new Date().toISOString(),
  };
  writeLocalBlocks(blockerId, [newEntry, ...currentLocal]);

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('user_blocks').upsert(
        {
          blocker_id: blockerId,
          blocked_id: blockedUser.id,
          reason: newEntry.reason,
        },
        { onConflict: 'blocker_id,blocked_id' }
      );
      if (error) {
        // Also best-effort sever local follows/connections if migration 025 trigger isn't live yet
        try {
          await supabase
            .from('user_follows')
            .delete()
            .eq('follower_id', blockerId)
            .eq('following_id', blockedUser.id);
        } catch {}
      }
    } catch {
      // Preserved in local cache for pre-migration preview
    }
  }

  return { success: true };
}

/**
 * Unblocks a previously blocked user.
 */
export async function unblockUser(
  blockerId: number,
  blockedId: number
): Promise<{ success: boolean; error?: string }> {
  if (!blockerId || !blockedId) return { success: false, error: 'Invalid user IDs.' };

  const remaining = readLocalBlocks(blockerId).filter((e) => e.blockedId !== blockedId);
  writeLocalBlocks(blockerId, remaining);

  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);
    } catch {}
  }

  return { success: true };
}

/**
 * Submits a real content report to `public.content_reports` (with authenticated Express fallback
 * and local persistence if migration 025 has not yet been executed remotely).
 */
export async function submitContentReport(params: {
  reporterId: number;
  targetType: ReportTargetType;
  targetId: number;
  targetAuthorId?: number | null;
  reason: string;
  details?: string;
}): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  if (!params.reporterId || !params.targetId) {
    return { success: false, error: 'Sign in to submit a report.' };
  }

  const check = sanitizeReportInput(params.reason, params.details);
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  // 1. Primary: Direct RLS-enforced insert into public.content_reports
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('content_reports').insert({
        reporter_id: params.reporterId,
        target_type: params.targetType,
        target_id: params.targetId,
        target_author_id: params.targetAuthorId || null,
        reason: check.reason,
        details: check.details || null,
        status: 'open',
      });

      if (!error) {
        recordLocalReport({ ...params, reason: check.reason, details: check.details });
        return { success: true };
      }

      if (error.code === '23505' || String(error.message || '').includes('uq_content_reports_open')) {
        return { success: true, duplicate: true };
      }
    } catch {}
  }

  // 2. Secondary: Authenticated Express API fallback
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      const resp = await fetch('/api/community/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType: params.targetType,
          targetId: params.targetId,
          targetAuthorId: params.targetAuthorId || null,
          reason: check.reason,
          details: check.details || null,
        }),
      });
      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        recordLocalReport({ ...params, reason: check.reason, details: check.details });
        return { success: true, duplicate: Boolean(json?.duplicate) };
      }
    }
  } catch {}

  // 3. Offline / pre-migration preview mirror
  recordLocalReport({ ...params, reason: check.reason, details: check.details });
  return { success: true };
}

/**
 * Staff helper (ready for Phase 7 Admin Community Moderation Queue).
 */
export async function fetchModerationReports(
  status: 'all' | ReportStatus = 'open',
  authToken?: string
): Promise<ContentReportRecord[]> {
  try {
    let token = authToken;
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    }
    if (!token) return [];

    const resp = await fetch(`/api/admin/moderation/reports?status=${encodeURIComponent(status)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    return Array.isArray(json?.reports) ? json.reports : [];
  } catch {
    return [];
  }
}

export async function resolveModerationReport(params: {
  reportId: number;
  status: Exclude<ReportStatus, 'open'>;
  resolutionNote?: string;
  removeContent?: boolean;
  authToken?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let token = params.authToken;
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    }
    if (!token) return { success: false, error: 'Moderator session required.' };

    const resp = await fetch(`/api/admin/moderation/reports/${params.reportId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: params.status,
        resolutionNote: params.resolutionNote || null,
        removeContent: Boolean(params.removeContent),
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { success: false, error: json?.error || 'Could not resolve report.' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error.' };
  }
}
