import type { NotificationType } from '../types/notification.types';

export type ReportTargetType = 'post' | 'comment' | 'profile';
export type ReportStatus = 'open' | 'in_review' | 'resolved_removed' | 'resolved_dismissed';
export type NotificationFilterCategory = 'all' | 'unread' | 'social' | 'announcements';

export const REPORT_REASONS = [
  'Inappropriate or unprofessional conduct',
  'Harassment, bullying, or hate speech',
  'Spam or unauthorized commercial promotion',
  'Misleading medical or fraudulent information',
  'Privacy violation or impersonation',
  'Other community guideline violation',
] as const;

export interface SanitizedReportInput {
  valid: boolean;
  reason: string;
  details: string;
  error?: string;
}

/**
 * Validates and normalizes user-submitted report reason and optional context details.
 */
export function sanitizeReportInput(reason: string, details?: string): SanitizedReportInput {
  const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const cleanDetails = String(details || '').replace(/\r\n/g, '\n').trim().slice(0, 1000);

  if (cleanReason.length < 3) {
    return {
      valid: false,
      reason: '',
      details: cleanDetails,
      error: 'Please select a reason for your report.',
    };
  }

  return {
    valid: true,
    reason: cleanReason,
    details: cleanDetails,
  };
}

/**
 * Formats an ISO timestamp or Date into a compact, readable relative time string.
 * Avoids showing raw ISO strings in NotificationDropdown.
 */
export function formatNotificationRelativeTime(
  input?: string | Date | null,
  nowMs: number = Date.now()
): string {
  if (!input) return 'Just now';
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return 'Just now';
    // Already formatted human string (e.g., "Just now", "5m ago")
    if (/^(just now|\d+[smhdw](\s+ago)?)$/i.test(trimmed)) {
      return trimmed;
    }
  }

  const parsed = input instanceof Date ? input.getTime() : Date.parse(String(input));
  if (!Number.isFinite(parsed)) return 'Recently';

  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;

  const date = new Date(parsed);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Maps any NotificationType into a high-level filter bucket for NotificationDropdown tabs.
 */
export function categorizeNotification(type: NotificationType): 'social' | 'announcements' {
  switch (type) {
    case 'blood_request':
    case 'blood':
    case 'batch_announcement':
    case 'official_announcement':
    case 'moderation_action':
    case 'verification':
    case 'system':
    case 'career':
    case 'mentorship':
      return 'announcements';
    case 'mention':
    case 'repost':
    case 'new_follower':
    case 'connection_request':
    case 'connection_accepted':
    case 'post_like':
    case 'like':
    case 'post_comment':
    case 'comment':
    case 'post_reaction':
    case 'new_message':
    case 'post':
    default:
      return 'social';
  }
}

/**
 * Filters out comments authored by blocked users (client mirror of server-side get_quad_feed).
 */
export function filterBlockedComments<T extends { userId?: number; user_id?: number; replies?: T[] }>(
  comments: T[] | undefined,
  blockedIds: Set<number>
): T[] {
  if (!Array.isArray(comments) || comments.length === 0) return [];
  if (!blockedIds || blockedIds.size === 0) return comments;

  const filtered: T[] = [];
  for (const comment of comments) {
    const uid = Number(comment.userId ?? comment.user_id ?? 0);
    if (uid > 0 && blockedIds.has(uid)) continue;
    if (Array.isArray(comment.replies) && comment.replies.length > 0) {
      filtered.push({
        ...comment,
        replies: filterBlockedComments(comment.replies, blockedIds),
      });
    } else {
      filtered.push(comment);
    }
  }
  return filtered;
}

/**
 * Filters out posts authored by blocked users and strips comments from blocked users.
 */
export function filterBlockedPosts<
  T extends {
    userId?: number;
    authorId?: number;
    comments?: any[];
    commentsList?: any[];
  }
>(posts: T[], blockedIds: Set<number>): T[] {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  if (!blockedIds || blockedIds.size === 0) return posts;

  return posts
    .filter((p) => {
      const uid = Number(p.userId ?? p.authorId ?? 0);
      return !(uid > 0 && blockedIds.has(uid));
    })
    .map((p) => ({
      ...p,
      comments: Array.isArray(p.comments) ? filterBlockedComments(p.comments, blockedIds) : p.comments,
      commentsList: Array.isArray(p.commentsList)
        ? filterBlockedComments(p.commentsList, blockedIds)
        : p.commentsList,
    }));
}
