import { NotificationType } from '../types/notification.types';
import { playSound } from './audio';

export interface MobileToastPayload {
  /** Stable deduplication key (e.g. `msg:<id>` or `notif:<id>`) */
  dedupeKey?: string;
  /** Notification category / interaction type */
  type: NotificationType;
  /** Primary bold header line (usually actor/sender name or alert title) */
  title: string;
  /** Short action descriptor shown alongside timestamp (e.g. "New message", "Commented on your post") */
  subtitle?: string;
  /** Message snippet / interaction preview body */
  body: string;
  /** Optional sender/actor avatar URL */
  avatarUrl?: string;
  /** Optional sender/actor full name for initials fallback */
  actorName?: string;
  /** Optional actor profile ID */
  actorId?: number;
  /** Optional database notification ID so tapping marks it read */
  notificationId?: number;
  /** Optional conversation ID for direct chat open & inline quick reply */
  conversationId?: string;
  /** Optional target post ID */
  postId?: number;
  /** Optional blood request ID */
  bloodRequestId?: string;
  /** Optional route fallback when tapped */
  targetRoute?: string;
  /** ISO timestamp of the event */
  createdAt?: string;
  /** Whether to treat as high-priority (longer dwell time) */
  urgent?: boolean;
  /** Whether to play the notification chime (deduplicated automatically) */
  playChime?: boolean;
}

export const MOBILE_TOAST_EVENT = 'szmc_mobile_toast_push';
export const MOBILE_TOAST_DISMISS_CONV_EVENT = 'szmc_mobile_toast_dismiss_conv';

// Track which conversation (if any) is currently actively visible to the user
const activeChatBySource: Record<'messenger' | 'dock', string | null> = {
  messenger: null,
  dock: null,
};

export function setActiveChatView(
  source: 'messenger' | 'dock',
  conversationId: string | null
): void {
  activeChatBySource[source] = conversationId || null;
  if (conversationId) {
    dismissMobileToastsForConversation(conversationId);
  }
}

export function isConversationActivelyViewed(conversationId: string | null | undefined): boolean {
  if (!conversationId) return false;
  return (
    activeChatBySource.messenger === conversationId ||
    activeChatBySource.dock === conversationId
  );
}

export function emitMobileToast(payload: MobileToastPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MobileToastPayload>(MOBILE_TOAST_EVENT, { detail: payload }));
}

export function dismissMobileToastsForConversation(conversationId: string): void {
  if (typeof window === 'undefined' || !conversationId) return;
  window.dispatchEvent(
    new CustomEvent<{ conversationId: string }>(MOBILE_TOAST_DISMISS_CONV_EVENT, {
      detail: { conversationId },
    })
  );
}

export function subscribeMobileToast(
  listener: (payload: MobileToastPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<MobileToastPayload>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(MOBILE_TOAST_EVENT, handler);
  return () => window.removeEventListener(MOBILE_TOAST_EVENT, handler);
}

export function subscribeDismissConversationToasts(
  listener: (conversationId: string) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{ conversationId: string }>;
    if (custom.detail?.conversationId) listener(custom.detail.conversationId);
  };
  window.addEventListener(MOBILE_TOAST_DISMISS_CONV_EVENT, handler);
  return () => window.removeEventListener(MOBILE_TOAST_DISMISS_CONV_EVENT, handler);
}

// Shared sound deduplicator so overlapping Realtime/NotificationDropdown/Toast listeners never double-chime
let lastChimeAt = 0;

export function playNotificationChimeOnce(): void {
  const now = Date.now();
  if (now - lastChimeAt < 1100) return;
  lastChimeAt = now;
  try {
    playSound('notification');
  } catch {
    /* ignore audio autoplay blocks */
  }
}
