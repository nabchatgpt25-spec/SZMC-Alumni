export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  timeAgo: string;
  unread: boolean;
  type: 'like' | 'comment' | 'post' | 'system' | 'blood' | 'verification' | 'mentorship' | 'career';
  targetRoute?: string;
  bloodRequestId?: string;
  targetUserId?: number;
  isMatchedDonorAlert?: boolean;
  isOfficialNotice?: boolean;
  actorId?: number;
  actorName?: string;
  actorAvatar?: string;
  postId?: number;
  photoId?: string;
  photoUrl?: string;
  createdAt?: string;
}

export interface UserPreferences {
  in_app_notifications: boolean;
  email_notifications: boolean;
  verification_alerts: boolean;
  mentorship_career_alerts: boolean;
}
