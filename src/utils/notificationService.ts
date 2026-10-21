import { NotificationItem, UserPreferences } from '../types/notification.types';
import {
  createNotificationInDb,
  fetchNotificationsFromDb,
} from '../services/supabaseNotificationService';
import { formatFacebookTime } from './facebookTime';
import { playSound } from './audio';

export const PORTAL_NOTIFICATIONS_STORAGE_KEY = 'ndc_portal_notifications';

export function getLocalNotifications(): NotificationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PORTAL_NOTIFICATIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse notifications from storage', e);
  }
  return [];
}

export function saveLocalNotifications(notifications: NotificationItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      PORTAL_NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications.slice(0, 100))
    );
    window.dispatchEvent(new CustomEvent('ndc_notifications_updated'));
  } catch (e) {
    console.warn('Failed to save notifications', e);
  }
}

function getUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem('ndc_user_prefs');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    in_app_notifications: true,
    email_notifications: true,
    verification_alerts: true,
    mentorship_career_alerts: true,
  };
}

/**
 * Core function to send, persist, and broadcast a notification.
 * Strict recipient targeting:
 * - Requires positive recipientId (> 0)
 * - Drops self-actions (actorId === recipientId)
 * - Honors recipient notification preferences
 */
export async function sendSocialNotification(params: {
  recipientId: number;
  actor: { id: number; fullName: string; avatarUrl?: string };
  type: 'like' | 'comment' | 'blood' | 'system' | 'post' | 'verification' | 'mentorship' | 'career';
  title: string;
  message: string;
  targetRoute?: string;
  postId?: number;
  photoId?: string;
  photoUrl?: string;
  bloodRequestId?: string;
  isMatchedDonorAlert?: boolean;
  isOfficialNotice?: boolean;
}): Promise<NotificationItem | null> {
  const actorId = Number(params.actor.id || 0);
  const recipientId = Number(params.recipientId);

  // Strict Rule 1: Always set exact recipient_id (positive integer)
  if (!recipientId || recipientId <= 0) return null;

  // Strict Rule 2: Never notify the user of their own actions
  if (actorId > 0 && recipientId === actorId) return null;

  // Strict Rule 3: Respect user notification preferences from Settings
  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('ndc_current_user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        const currentUid = Number(u.id || 0);
        if (currentUid === recipientId) {
          const prefs = getUserPreferences();
          if (prefs.in_app_notifications === false) return null;
          if (params.type === 'verification' && prefs.verification_alerts === false) return null;
          if (
            (params.type === 'mentorship' || params.type === 'career') &&
            prefs.mentorship_career_alerts === false
          ) {
            return null;
          }
        }
      }
    } catch {}
  }

  const newId = Date.now() + Math.floor(Math.random() * 1000);
  const nowIso = new Date().toISOString();

  const notification: NotificationItem = {
    id: newId,
    title: params.title,
    message: params.message,
    timeAgo: 'Just now',
    unread: true,
    type: params.type,
    targetRoute:
      params.targetRoute ||
      (params.type === 'mentorship' ? 'mentorship' : params.type === 'career' ? 'career' : 'feed'),
    targetUserId: recipientId,
    actorId: actorId > 0 ? actorId : undefined,
    actorName: params.actor.fullName,
    actorAvatar: params.actor.avatarUrl,
    postId: params.postId,
    photoId: params.photoId,
    photoUrl: params.photoUrl,
    bloodRequestId: params.bloodRequestId,
    isMatchedDonorAlert: params.isMatchedDonorAlert,
    isOfficialNotice: params.isOfficialNotice,
    createdAt: nowIso,
  };

  // 1. Add to local storage
  const current = getLocalNotifications();
  const updated = [notification, ...current.filter((n) => n.id !== newId)].slice(0, 100);
  saveLocalNotifications(updated);

  // 2. Play Web Audio chime if recipient is the active user
  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('ndc_current_user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        const currentUid = Number(u.id || 0);
        if (currentUid === recipientId) {
          const prefs = getUserPreferences();
          if (prefs.in_app_notifications !== false) {
            playSound('notification');
          }
        }
      }
    } catch {}
  }

  // 3. Persist to database in background
  createNotificationInDb({
    recipientId,
    actorId: actorId > 0 ? actorId : undefined,
    type: params.type,
    title: params.title,
    message: params.message,
    targetRoute: params.targetRoute,
    postId: params.postId,
    bloodRequestId: params.bloodRequestId,
  }).catch(() => {});

  return notification;
}

// ============================================================================
// CONVENIENCE DISPATCHERS
// ============================================================================

export function notifyPostLike(post: { id: number; userId: number; content?: string; images?: string[] }, actor: { id: number; fullName: string; avatarUrl?: string }) {
  const authorId = Number(post.userId);
  if (!authorId || authorId === Number(actor.id)) return Promise.resolve(null);
  const rawContent = (post.content || '').replace(/\s+/g, ' ').trim();
  const snippet = rawContent.length > 55 ? `${rawContent.slice(0, 55)}...` : rawContent;
  return sendSocialNotification({
    recipientId: authorId,
    actor,
    type: 'like',
    title: `${actor.fullName} liked your post.`,
    message: snippet ? `"${snippet}"` : 'Liked your shared post.',
    targetRoute: 'feed',
    postId: post.id,
    photoUrl: post.images && post.images.length > 0 ? post.images[0] : undefined,
  });
}

export function notifyPostComment(post: { id: number; userId: number; images?: string[] }, commentText: string, actor: { id: number; fullName: string; avatarUrl?: string }) {
  const authorId = Number(post.userId);
  if (!authorId || authorId === Number(actor.id)) return Promise.resolve(null);
  const cleanText = commentText.replace(/\s+/g, ' ').trim();
  const snippet = cleanText.length > 60 ? `${cleanText.slice(0, 60)}...` : cleanText;
  return sendSocialNotification({
    recipientId: authorId,
    actor,
    type: 'comment',
    title: `${actor.fullName} commented on your post.`,
    message: snippet ? `"${snippet}"` : 'Added a new comment.',
    targetRoute: 'feed',
    postId: post.id,
    photoUrl: post.images && post.images.length > 0 ? post.images[0] : undefined,
  });
}

export function notifyMentorshipQuestion(params: {
  mentorId: number;
  mentorName: string;
  questionText: string;
  topic: string;
  actor: { id: number; fullName: string; avatarUrl?: string };
}) {
  const mentorId = Number(params.mentorId);
  const actorId = Number(params.actor.id || 0);
  if (!mentorId || mentorId <= 0 || (actorId > 0 && mentorId === actorId)) return Promise.resolve(null);
  const snippet = params.questionText.slice(0, 70);
  return sendSocialNotification({
    recipientId: mentorId,
    actor: params.actor,
    type: 'mentorship',
    title: `${params.actor.fullName} asked you for mentorship advice (${params.topic}).`,
    message: snippet ? `"${snippet}..."` : 'Asked you a direct mentorship question.',
    targetRoute: 'mentorship',
  });
}

export function notifyMentorshipAnswer(params: {
  requesterId: number;
  answerText: string;
  actor: { id: number; fullName: string; avatarUrl?: string };
}) {
  const requesterId = Number(params.requesterId);
  const actorId = Number(params.actor.id || 0);
  if (!requesterId || requesterId <= 0 || (actorId > 0 && requesterId === actorId)) return Promise.resolve(null);
  const snippet = params.answerText.slice(0, 70);
  return sendSocialNotification({
    recipientId: requesterId,
    actor: params.actor,
    type: 'mentorship',
    title: `${params.actor.fullName} answered your mentorship question.`,
    message: snippet ? `"${snippet}..."` : 'Provided senior advice to your question.',
    targetRoute: 'mentorship',
  });
}

export function notifyCareerApplication(params: {
  posterId: number;
  jobTitle: string;
  company: string;
  actor: { id: number; fullName: string; batchYear?: number; avatarUrl?: string };
}) {
  const posterId = Number(params.posterId);
  const actorId = Number(params.actor.id || 0);
  if (!posterId || posterId <= 0 || (actorId > 0 && posterId === actorId)) return Promise.resolve(null);
  return sendSocialNotification({
    recipientId: posterId,
    actor: params.actor,
    type: 'career',
    title: `New Job Application: ${params.jobTitle}`,
    message: `${params.actor.fullName} applied for ${params.jobTitle} at ${params.company}.`,
    targetRoute: 'career',
  });
}

/**
 * Merges local and Supabase notifications, deduplicates via signature, and sorts newest first
 */
export async function loadMergedNotifications(userId: number): Promise<NotificationItem[]> {
  const prefs = getUserPreferences();
  if (prefs.in_app_notifications === false) return [];

  const localList = getLocalNotifications();
  const userLocal = localList.filter((item) => {
    if (item.actorId && item.actorId === userId) return false;
    if (item.targetUserId && item.targetUserId !== userId) return false;
    return true;
  });

  let dbList: NotificationItem[] = [];
  try {
    dbList = await fetchNotificationsFromDb(userId);
  } catch (err) {
    console.warn('fetchNotificationsFromDb error:', err);
  }

  const map = new Map<string, NotificationItem>();
  for (const item of [...userLocal, ...dbList]) {
    if (item.actorId && item.actorId === userId) continue;
    if (item.targetUserId && item.targetUserId !== userId) continue;

    const signature = `${item.type}_${item.actorId || 0}_${item.postId || item.bloodRequestId || item.photoId || ''}_${(item.title || '').trim()}`;
    const key = signature.length > 5 ? signature : `id_${item.id}`;

    if (!map.has(key)) {
      map.set(key, {
        ...item,
        timeAgo: formatFacebookTime(item.createdAt || item.timeAgo),
      });
    } else {
      const existing = map.get(key)!;
      map.set(key, {
        ...existing,
        ...item,
        unread: existing.unread === false || item.unread === false ? false : Boolean(existing.unread && item.unread),
        timeAgo: formatFacebookTime(existing.createdAt || item.createdAt || existing.timeAgo),
      });
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
    return timeB - timeA;
  });

  return merged;
}
