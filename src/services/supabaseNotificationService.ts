import { supabase } from '../lib/supabase';
import { NotificationItem, NotificationType } from '../types/notification.types';

/**
 * Fetch unread notifications via unread_notifications RPC.
 * Fallback to direct notifications table query if RPC is not compiled in cache.
 */
export async function fetchUnreadNotificationsFromDb(userId: number): Promise<NotificationItem[]> {
  try {
    // 1. Primary: Only supabase.rpc('unread_notifications')
    const { data: rpcData, error: rpcErr } = await supabase.rpc('unread_notifications', {
      p_user_id: userId,
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      return rpcData.map(mapNotificationRow);
    }

    // 2. Fallback: Direct query on notifications table for my rows only
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:alumni_profiles!notifications_actor_id_fkey(id, full_name, avatar_url)')
      .eq('recipient_id', userId)
      .eq('unread', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data.map(mapNotificationRow);
    }
  } catch (err) {
    console.warn('fetchUnreadNotificationsFromDb notice:', err);
  }
  return [];
}

/**
 * Fetch all recent notifications from the notifications table for this alumnus.
 */
export async function fetchNotificationsFromDb(userId: number): Promise<NotificationItem[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:alumni_profiles!notifications_actor_id_fkey(id, full_name, avatar_url)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map(mapNotificationRow);
  } catch (err) {
    console.warn('fetchNotificationsFromDb error:', err);
    return [];
  }
}

/**
 * Check whether sound effects are enabled in user_message_settings for the user.
 */
export async function isSoundEnabledForUser(userId: number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_message_settings')
      .select('sound_enabled')
      .eq('profile_id', userId)
      .maybeSingle();

    if (!error && data && typeof data.sound_enabled === 'boolean') {
      return data.sound_enabled;
    }
  } catch {}
  return true; // Default sound to enabled
}

/**
 * Normalizes notification types to canonical set:
 * post_like, post_comment, post_reaction, connection_request, connection_accepted, new_message, blood_request, system
 */
function normalizeNotificationType(rawType: string, targetRoute?: string): NotificationType {
  const t = (rawType || '').toLowerCase().trim();
  if (t === 'post_like' || t === 'like') return 'post_like';
  if (t === 'post_comment' || t === 'comment') return 'post_comment';
  if (t === 'post_reaction' || t === 'reaction') return 'post_reaction';
  if (t === 'connection_request') return 'connection_request';
  if (t === 'connection_accepted') return 'connection_accepted';
  if (t === 'new_message' || t === 'message') return 'new_message';
  if (t === 'blood_request' || t === 'blood') return 'blood_request';
  if (targetRoute === 'blood' || targetRoute === 'emergency') return 'blood_request';
  return 'system';
}

function mapNotificationRow(n: any): NotificationItem {
  const targetRoute = n.target_route || undefined;
  const type = normalizeNotificationType(n.type, targetRoute);

  return {
    id: Number(n.id),
    title: n.title || 'Notification',
    message: n.message || '',
    timeAgo: n.created_at ? new Date(n.created_at).toISOString() : 'Just now',
    unread: Boolean(n.unread),
    type,
    targetRoute,
    targetUserId: n.recipient_id ? Number(n.recipient_id) : undefined,
    actorId: n.actor_id ? Number(n.actor_id) : n.actor?.id ? Number(n.actor.id) : undefined,
    actorName: n.actor_name || n.actor?.full_name || undefined,
    actorAvatar: n.actor_avatar || n.actor?.avatar_url || undefined,
    postId: n.post_id ? Number(n.post_id) : undefined,
    bloodRequestId: n.blood_request_id || undefined,
    createdAt: n.created_at || new Date().toISOString(),
  };
}

export async function markNotificationReadInDb(notificationId: string | number): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ unread: false })
      .eq('id', Number(notificationId));
  } catch {}
}

export async function markAllNotificationsReadInDb(userId: number): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ unread: false })
      .eq('recipient_id', userId)
      .eq('unread', true);
  } catch {}
}

export async function createNotificationInDb(params: {
  recipientId: number;
  actorId?: number;
  type?: NotificationType | string;
  title: string;
  message: string;
  targetRoute?: string;
  postId?: number;
  bloodRequestId?: string;
}): Promise<boolean> {
  if (!params.recipientId || params.recipientId <= 0) return false;
  if (params.actorId && Number(params.actorId) === Number(params.recipientId)) return false;

  const type = normalizeNotificationType(params.type || 'system', params.targetRoute);

  try {
    const { error } = await supabase.from('notifications').insert({
      recipient_id: params.recipientId,
      actor_id: params.actorId || null,
      type: type,
      title: params.title,
      message: params.message,
      target_route: params.targetRoute || null,
      post_id: params.postId || null,
      blood_request_id: params.bloodRequestId || null,
      unread: true,
    });
    return !error;
  } catch {
    return false;
  }
}
