import type { ReportStatus } from './communitySafetyUtils';

export type AdminGovernanceRole = 'super_admin' | 'admin' | 'moderator';

export interface AdminCommunityPermissions {
  canModerateReports: boolean;
  canManageBatchModerators: boolean;
  canManageOfficialPages: boolean;
  canEditRankingWeights: boolean;
  canToggleFeatureFlags: boolean;
}

/**
 * Authoritative UI permission projection matching server.ts middleware:
 * - moderator: moderation queue only (read/review reports, remove flagged content)
 * - admin & super_admin: full community governance (batch moderators, official page roles,
 *   ranking weights, and feature flags)
 */
export function getAdminCommunityPermissions(role: AdminGovernanceRole): AdminCommunityPermissions {
  const isAdminOrAbove = role === 'super_admin' || role === 'admin';
  return {
    canModerateReports: true,
    canManageBatchModerators: isAdminOrAbove,
    canManageOfficialPages: isAdminOrAbove,
    canEditRankingWeights: isAdminOrAbove,
    canToggleFeatureFlags: isAdminOrAbove,
  };
}

export interface RankingWeightFieldMeta {
  key:
    | 'batchRelevanceWeight'
    | 'followedAlumniWeight'
    | 'followedPageWeight'
    | 'engagementLikeWeight'
    | 'engagementCommentWeight'
    | 'engagementCap'
    | 'recencyMaxBoost'
    | 'recencyDecayPerHour'
    | 'featuredBoost';
  label: string;
  helper: string;
  min: number;
  max: number;
  step: number;
}

export const RANKING_WEIGHT_FIELDS: RankingWeightFieldMeta[] = [
  {
    key: 'batchRelevanceWeight',
    label: 'Batch Relevance Boost',
    helper: 'Score added when a post comes from the member’s own MBBS batch.',
    min: 0,
    max: 200,
    step: 1,
  },
  {
    key: 'followedAlumniWeight',
    label: 'Followed & Connected Alumni',
    helper: 'Score added for posts by connections or followed alumni.',
    min: 0,
    max: 200,
    step: 1,
  },
  {
    key: 'followedPageWeight',
    label: 'Followed Official Pages',
    helper: 'Score added when an alumnus follows the publishing Official Page.',
    min: 0,
    max: 200,
    step: 1,
  },
  {
    key: 'featuredBoost',
    label: 'Featured Post Boost',
    helper: 'Additional ranking score for featured community discussions.',
    min: 0,
    max: 200,
    step: 1,
  },
  {
    key: 'engagementLikeWeight',
    label: 'Reaction Weight (per reaction)',
    helper: 'Multiplier applied to post reactions up to the engagement cap.',
    min: 0,
    max: 50,
    step: 0.25,
  },
  {
    key: 'engagementCommentWeight',
    label: 'Comment Weight (per comment)',
    helper: 'Multiplier applied to meaningful comments up to the engagement cap.',
    min: 0,
    max: 50,
    step: 0.25,
  },
  {
    key: 'engagementCap',
    label: 'Engagement Score Cap',
    helper: 'Prevents viral posts from permanently overshadowing fresh updates.',
    min: 0,
    max: 300,
    step: 1,
  },
  {
    key: 'recencyMaxBoost',
    label: 'Freshness Max Boost',
    helper: 'Starting recency bonus for brand-new posts before hourly decay.',
    min: 0,
    max: 300,
    step: 1,
  },
  {
    key: 'recencyDecayPerHour',
    label: 'Recency Decay / Hour',
    helper: 'Points subtracted per hour after publication (min 0.01).',
    min: 0.01,
    max: 20,
    step: 0.05,
  },
];

export function clampRankingWeight(value: number, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num * 1000) / 1000));
}

export function getReportStatusMeta(status: ReportStatus): {
  label: string;
  classicTone: string;
  neonTone: string;
} {
  switch (status) {
    case 'open':
      return {
        label: 'Open',
        classicTone: 'bg-amber-50 text-amber-800 border-amber-200',
        neonTone: 'bg-amber-500/15 text-amber-300 border-amber-400/35',
      };
    case 'in_review':
      return {
        label: 'In Review',
        classicTone: 'bg-sky-50 text-sky-800 border-sky-200',
        neonTone: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35',
      };
    case 'resolved_removed':
      return {
        label: 'Removed',
        classicTone: 'bg-rose-50 text-rose-800 border-rose-200',
        neonTone: 'bg-rose-500/15 text-rose-300 border-rose-400/35',
      };
    case 'resolved_dismissed':
      return {
        label: 'Dismissed',
        classicTone: 'bg-slate-100 text-slate-700 border-slate-200',
        neonTone: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
      };
  }
}
