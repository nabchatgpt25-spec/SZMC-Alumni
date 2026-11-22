import type { FeedRankingWeights } from './feedRankingService';
import type { ContentReportRecord } from './communitySafetyService';
import type { ReportStatus } from './communitySafetyUtils';

export interface AdminAlumniCandidate {
  id: number;
  full_name: string;
  email?: string | null;
  batch_year?: number | null;
  avatar_url?: string | null;
  role?: string | null;
}

export interface BatchModeratorAssignment {
  id: number;
  batch_year: number;
  profile_id: number;
  role: 'coordinator' | 'moderator';
  created_at: string;
  profile?: AdminAlumniCandidate | null;
}

export interface OfficialPageRoleAssignment {
  id: number;
  page_id: number;
  profile_id: number;
  role: 'admin' | 'editor';
  created_at: string;
  profile?: AdminAlumniCandidate | null;
}

export interface AdminOfficialPageSummary {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  is_verified: boolean;
  is_active: boolean;
  followers_count: number;
  posts_count: number;
  roles: OfficialPageRoleAssignment[];
}

export interface AdminFeatureFlagRecord {
  key: string;
  enabled: boolean;
  description: string | null;
  config?: Record<string, any>;
  updatedAt?: string;
}

export interface AdminCommunityOverviewPayload {
  metrics: {
    openReportsCount: number;
    totalReportsCount: number;
    batchLoungesCount: number;
    batchModeratorsCount: number;
    officialPagesCount: number;
    activeFlagsCount: number;
    totalFlagsCount: number;
  };
  batchModerators: BatchModeratorAssignment[];
  officialPages: AdminOfficialPageSummary[];
  featureFlags: AdminFeatureFlagRecord[];
  rankingWeights: FeedRankingWeights;
}

type AuthHeaderProvider = () => Promise<Record<string, string>>;

export async function fetchAdminCommunityOverview(
  getAuthHeaders: AuthHeaderProvider
): Promise<AdminCommunityOverviewPayload> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/community/overview', { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to load community management data.');
  }
  return data as AdminCommunityOverviewPayload;
}

export async function fetchAdminModerationQueue(
  getAuthHeaders: AuthHeaderProvider,
  status: 'all' | ReportStatus = 'all'
): Promise<ContentReportRecord[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/moderation/reports?status=${encodeURIComponent(status)}`, {
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to fetch moderation reports.');
  }
  return Array.isArray(data?.reports) ? data.reports : [];
}

export async function updateAdminModerationReport(
  getAuthHeaders: AuthHeaderProvider,
  params: {
    reportId: number;
    status: Exclude<ReportStatus, 'open'>;
    resolutionNote?: string;
    removeContent?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/moderation/reports/${params.reportId}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: params.status,
      resolutionNote: params.resolutionNote || null,
      removeContent: Boolean(params.removeContent),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Failed to update report.' };
  return { success: true };
}

export async function searchAdminAlumniCandidates(
  getAuthHeaders: AuthHeaderProvider,
  query: string
): Promise<AdminAlumniCandidate[]> {
  if (query.trim().length < 2) return [];
  const headers = await getAuthHeaders();
  const res = await fetch(
    `/api/admin/community/alumni-search?q=${encodeURIComponent(query.trim())}`,
    { headers }
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.alumni) ? data.alumni : [];
}

export async function assignBatchModerator(
  getAuthHeaders: AuthHeaderProvider,
  params: { batchYear: number; profileId: number; role: 'coordinator' | 'moderator' }
): Promise<{ success: boolean; assignment?: BatchModeratorAssignment; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/community/batch-moderators', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not assign moderator.' };
  return { success: true, assignment: data.assignment };
}

export async function removeBatchModerator(
  getAuthHeaders: AuthHeaderProvider,
  batchYear: number,
  profileId: number
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/community/batch-moderators/${batchYear}/${profileId}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not remove moderator.' };
  return { success: true };
}

export async function assignOfficialPageRole(
  getAuthHeaders: AuthHeaderProvider,
  params: { pageId: number; profileId: number; role: 'admin' | 'editor' }
): Promise<{ success: boolean; assignment?: OfficialPageRoleAssignment; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/community/official-pages/${params.pageId}/roles`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId: params.profileId, role: params.role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not assign page role.' };
  return { success: true, assignment: data.assignment };
}

export async function removeOfficialPageRole(
  getAuthHeaders: AuthHeaderProvider,
  pageId: number,
  profileId: number
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/community/official-pages/${pageId}/roles/${profileId}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not remove page role.' };
  return { success: true };
}

export async function updateOfficialPageSettings(
  getAuthHeaders: AuthHeaderProvider,
  pageId: number,
  patch: { isVerified?: boolean; isActive?: boolean; description?: string; tagline?: string }
): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/community/official-pages/${pageId}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not update page.' };
  return { success: true };
}

export async function saveAdminFeedRankingWeights(
  getAuthHeaders: AuthHeaderProvider,
  weights: FeedRankingWeights
): Promise<{ success: boolean; weights?: FeedRankingWeights; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/feed/ranking-weights', {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(weights),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not save ranking weights.' };
  return { success: true, weights: data.weights };
}

export async function toggleAdminFeatureFlag(
  getAuthHeaders: AuthHeaderProvider,
  key: string,
  enabled: boolean,
  description?: string | null
): Promise<{ success: boolean; flag?: AdminFeatureFlagRecord; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, description }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error || 'Could not update feature flag.' };
  return { success: true, flag: data.flag };
}
