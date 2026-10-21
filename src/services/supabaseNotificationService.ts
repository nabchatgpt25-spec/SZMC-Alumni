import { supabase } from '../lib/supabase';
import { NotificationItem } from '../types/notification.types';

export async function fetchNotificationsFromDb(userId: number): Promise<NotificationItem[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:alumni_profiles!notifications_actor_id_fkey(id, full_name, avatar_url)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((n: any) => {
      const targetRoute = n.target_route || undefined;
      const type =
        targetRoute === 'mentorship'
          ? 'mentorship'
          : targetRoute === 'career'
          ? 'career'
          : n.type || 'system';

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
        actorName: n.actor?.full_name || undefined,
        actorAvatar: n.actor?.avatar_url || undefined,
        postId: n.post_id ? Number(n.post_id) : undefined,
        bloodRequestId: n.blood_request_id || undefined,
        createdAt: n.created_at || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.warn('fetchNotificationsFromDb error:', err);
    return [];
  }
}

export async function markNotificationReadInDb(notificationId: string | number): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ unread: false })
      .eq('id', Number(notificationId));
  } catch {}
}

export async function createNotificationInDb(params: {
  recipientId: number;
  actorId?: number;
  type?: string;
  title: string;
  message: string;
  targetRoute?: string;
  postId?: number;
  bloodRequestId?: string;
}): Promise<boolean> {
  if (!params.recipientId || params.recipientId <= 0) return false;
  if (params.actorId && Number(params.actorId) === Number(params.recipientId)) return false;

  const validTypes = ['like', 'comment', 'post', 'system', 'blood', 'verification', 'mentorship', 'career'];
  const normalizedType = (params.type || 'system').toLowerCase();
  const type = validTypes.includes(normalizedType) ? normalizedType : 'system';

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
