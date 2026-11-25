import { NotificationItem, NotificationType } from '../types/notification.types';

export type NotificationTimeBucket = 'new' | 'today' | 'earlier';

export interface GroupedNotificationActor {
  id?: number;
  name: string;
  avatar?: string;
}

export interface GroupedNotification {
  key: string;
  primary: NotificationItem;
  items: NotificationItem[];
  itemIds: number[];
  actors: GroupedNotificationActor[];
  unread: boolean;
  createdAtMs: number;
  bucket: NotificationTimeBucket;
}

const AGGREGATABLE_TYPES = new Set<NotificationType>([
  'post_like',
  'like',
  'post_reaction',
  'post_comment',
  'comment',
]);

function getTimestampMs(item: NotificationItem): number {
  if (item.createdAt) {
    const parsed = Date.parse(item.createdAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (item.id > 1_000_000_000_000) return item.id;
  return Date.now() - 3600_000;
}

function getBucket(itemUnread: boolean, createdAtMs: number, nowMs: number): NotificationTimeBucket {
  const ageMs = Math.max(0, nowMs - createdAtMs);
  const twoHoursMs = 2 * 60 * 60 * 1000;
  if (itemUnread || ageMs <= twoHoursMs) return 'new';

  const nowDate = new Date(nowMs);
  const itemDate = new Date(createdAtMs);
  const sameDay =
    nowDate.getFullYear() === itemDate.getFullYear() &&
    nowDate.getMonth() === itemDate.getMonth() &&
    nowDate.getDate() === itemDate.getDate();

  return sameDay ? 'today' : 'earlier';
}

function canonicalAggType(type: NotificationType): string {
  if (type === 'post_like' || type === 'like' || type === 'post_reaction') return 'react';
  if (type === 'post_comment' || type === 'comment') return 'comment';
  return type;
}

/**
 * Groups Facebook-style notifications:
 * - Combines multiple reactions/likes or comments on the same post within 24h
 *   ("Dr. Rahman and 2 others liked your post").
 * - Sorts newest-first and assigns 'new' | 'today' | 'earlier' time buckets.
 */
export function groupFacebookNotifications(items: NotificationItem[]): GroupedNotification[] {
  const nowMs = Date.now();
  const sorted = [...items].sort((a, b) => getTimestampMs(b) - getTimestampMs(a));
  const groups: GroupedNotification[] = [];
  const aggMap = new Map<string, GroupedNotification>();

  for (const item of sorted) {
    const ts = getTimestampMs(item);
    const canAggregate = Boolean(item.postId) && AGGREGATABLE_TYPES.has(item.type);

    if (canAggregate && item.postId) {
      const aggKey = `${canonicalAggType(item.type)}:${item.postId}`;
      const existing = aggMap.get(aggKey);
      if (existing && Math.abs(existing.createdAtMs - ts) <= 24 * 60 * 60 * 1000) {
        existing.items.push(item);
        existing.itemIds.push(item.id);
        if (item.unread) existing.unread = true;
        if (item.actorName) {
          const alreadyHasActor = existing.actors.some(
            (a) => (item.actorId && a.id === item.actorId) || a.name === item.actorName
          );
          if (!alreadyHasActor) {
            existing.actors.push({
              id: item.actorId,
              name: item.actorName,
              avatar: item.actorAvatar,
            });
          }
        }
        existing.bucket = getBucket(existing.unread, existing.createdAtMs, nowMs);
        continue;
      }
    }

    const actors: GroupedNotificationActor[] = item.actorName
      ? [{ id: item.actorId, name: item.actorName, avatar: item.actorAvatar }]
      : [];

    const group: GroupedNotification = {
      key: `grp_${item.id}`,
      primary: item,
      items: [item],
      itemIds: [item.id],
      actors,
      unread: Boolean(item.unread),
      createdAtMs: ts,
      bucket: getBucket(Boolean(item.unread), ts, nowMs),
    };

    groups.push(group);
    if (canAggregate && item.postId) {
      aggMap.set(`${canonicalAggType(item.type)}:${item.postId}`, group);
    }
  }

  return groups;
}

/**
 * Concise Facebook-style relative timestamp: "Just now", "2m", "1h", "3d", "2w".
 */
export function formatFacebookNotifTime(createdAt?: string, fallback?: string): string {
  const raw = createdAt || fallback;
  if (!raw) return 'Just now';
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return fallback || 'Just now';

  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 604800)}w`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Formats natural Facebook-style inline copy with bold actor names + clean action prose.
 */
export function buildFacebookNotificationCopy(group: GroupedNotification): {
  actorLead: string | null;
  actionBody: string;
  quoteSnippet?: string;
} {
  const { primary, actors, items } = group;
  const aggKind = canonicalAggType(primary.type);

  if (items.length > 1 && actors.length >= 2) {
    const first = actors[0].name;
    const restCount = actors.length - 1;
    const actorLead =
      restCount === 1
        ? `${first} and ${actors[1].name}`
        : `${first} and ${restCount} others`;
    const actionBody =
      aggKind === 'comment'
        ? 'commented on your post.'
        : primary.type === 'post_reaction'
        ? 'reacted to your post.'
        : 'liked your post.';
    return {
      actorLead,
      actionBody,
      quoteSnippet: primary.message || undefined,
    };
  }

  if (primary.actorName) {
    const stripped = (primary.title || '')
      .replace(primary.actorName, '')
      .replace(/^[\s.,:-]+/, '')
      .trim();

    const defaultAction = (() => {
      switch (primary.type) {
        case 'post_like':
        case 'like':
          return 'liked your post.';
        case 'post_comment':
        case 'comment':
          return 'commented on your post.';
        case 'post_reaction':
          return 'reacted to your post.';
        case 'mention':
          return 'mentioned you in a post.';
        case 'repost':
          return 'shared your post.';
        case 'new_follower':
          return 'started following you.';
        case 'connection_request':
          return 'sent you a connection request.';
        case 'connection_accepted':
          return 'accepted your connection request.';
        case 'new_message':
          return 'sent you a message.';
        case 'blood_request':
        case 'blood':
          return 'posted an urgent blood request.';
        case 'mentorship':
          return 'sent a mentorship update.';
        case 'career':
          return 'sent a career update.';
        default:
          return primary.title || 'interacted with your account.';
      }
    })();

    const actionBody =
      stripped && stripped.toLowerCase() !== 'new connection request' && stripped.toLowerCase() !== 'connection accepted'
        ? stripped
        : defaultAction;

    // Avoid duplicating identical sentence in snippet
    const cleanMsg = (primary.message || '').trim();
    const isDuplicateMsg =
      cleanMsg &&
      (cleanMsg.toLowerCase().includes(actionBody.toLowerCase()) ||
        actionBody.toLowerCase().includes(cleanMsg.toLowerCase()));

    return {
      actorLead: primary.actorName,
      actionBody,
      quoteSnippet: cleanMsg && !isDuplicateMsg ? cleanMsg : undefined,
    };
  }

  return {
    actorLead: null,
    actionBody: primary.title || 'New notification',
    quoteSnippet: primary.message || undefined,
  };
}

/**
 * Unified Facebook-style click navigation for any notification item.
 */
export function resolveNotificationDestination(
  item: NotificationItem,
  onNavigate?: (route: string) => void
): void {
  if (!onNavigate) return;

  if (item.postId) {
    window.location.hash = `post-${item.postId}`;
    onNavigate('feed');
    return;
  }
  if (item.bloodRequestId || item.type === 'blood_request' || item.type === 'blood') {
    onNavigate('blood-network');
    return;
  }
  if (item.type === 'new_message') {
    onNavigate('messages');
    return;
  }
  if (
    item.type === 'connection_request' ||
    item.type === 'connection_accepted' ||
    item.type === 'new_follower'
  ) {
    onNavigate(item.targetRoute || 'profile');
    return;
  }
  if (item.type === 'batch_announcement') {
    onNavigate(item.targetRoute || 'batches');
    return;
  }
  if (item.type === 'official_announcement') {
    onNavigate(item.targetRoute || 'pages');
    return;
  }
  if (item.type === 'mentorship') {
    onNavigate(item.targetRoute || 'mentorship');
    return;
  }
  if (item.type === 'career') {
    onNavigate(item.targetRoute || 'careers');
    return;
  }
  if (item.targetRoute) {
    onNavigate(item.targetRoute);
  }
}
