/**
 * Mobile Notification Drawer & Desktop OS Push Notification Bridge
 * Uses ServiceWorkerRegistration.showNotification() (required on Android Chrome & iOS 16.4+ PWA)
 * with graceful fallback to the Notification API and PWA App Icon Badging.
 */

export type PushPermissionState = 'granted' | 'default' | 'denied' | 'unsupported';

export interface MobileNotificationPayload {
  id?: number | string;
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  route?: string;
  conversationId?: string | null;
  postId?: number | null;
  category?: 'message' | 'social' | 'blood' | 'announcement' | 'system';
  silent?: boolean;
  urgent?: boolean;
  /** If true, shows OS notification even while the app tab is currently visible/focused */
  forceWhenVisible?: boolean;
}

const MOBILE_PUSH_PREF_KEY = 'szmc_mobile_push_enabled';
const BASE_DOCUMENT_TITLE = 'SZMC Alumni';

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIosSafariNeedingInstall(): boolean {
  return isIosDevice() && !isStandalonePwa();
}

export function isNotificationApiSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getMobilePushPermission(): PushPermissionState {
  if (!isNotificationApiSupported()) return 'unsupported';
  const perm = Notification.permission;
  if (perm === 'granted' || perm === 'denied' || perm === 'default') return perm;
  return 'unsupported';
}

export function isMobilePushUserEnabled(): boolean {
  try {
    const raw = localStorage.getItem(MOBILE_PUSH_PREF_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setMobilePushUserEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(MOBILE_PUSH_PREF_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('szmc_push_pref_updated', { detail: { enabled } }));
  } catch {
    // ignore storage errors
  }
}

export function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => reg)
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export async function requestMobileNotificationPermission(): Promise<PushPermissionState> {
  if (!isNotificationApiSupported()) return 'unsupported';
  try {
    await registerNotificationServiceWorker();
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setMobilePushUserEnabled(true);
    }
    window.dispatchEvent(new CustomEvent('szmc_push_pref_updated', { detail: { permission: result } }));
    return result;
  } catch {
    return getMobilePushPermission();
  }
}

function resolveNotificationIcon(icon?: string): string {
  if (!icon || !icon.trim()) return '/pwa-192x192.png';
  const trimmed = icon.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return '/pwa-192x192.png';
}

/**
 * Displays a native notification in the user's Mobile Notification Drawer (Android/iOS PWA)
 * or Desktop OS Notification Center.
 */
export async function showMobileDrawerNotification(
  payload: MobileNotificationPayload
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (getMobilePushPermission() !== 'granted') return false;
  if (!isMobilePushUserEnabled()) return false;

  // Avoid double-notifying when user is already actively looking at the app unless requested
  const isTabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
  if (isTabVisible && !payload.forceWhenVisible) {
    return false;
  }

  const title = (payload.title || 'SZMC Alumni').slice(0, 120);
  const body = (payload.body || 'Tap to view update').slice(0, 260);
  const icon = resolveNotificationIcon(payload.icon);
  const isMessage = payload.category === 'message';
  const isBlood = payload.category === 'blood' || Boolean(payload.urgent);
  const tag =
    payload.tag ||
    (payload.conversationId
      ? `szmc-msg-${payload.conversationId}`
      : payload.id
      ? `szmc-notif-${payload.id}`
      : `szmc-notif-${Date.now()}`);

  const swOptions: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string }>;
  } = {
    body,
    icon,
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    silent: Boolean(payload.silent),
    requireInteraction: isBlood,
    vibrate: payload.silent ? undefined : isBlood ? [220, 100, 220, 100, 220] : [120, 60, 120],
    data: {
      route: payload.route || (payload.postId ? `post-${payload.postId}` : isMessage ? 'messages' : 'feed'),
      conversationId: payload.conversationId || null,
      postId: payload.postId || null,
      notificationId: payload.id || null,
    },
    actions: [
      { action: 'open', title: isMessage ? 'Reply' : 'View' },
      { action: 'mark_read', title: 'Mark read' },
    ],
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = (await registerNotificationServiceWorker()) || (await navigator.serviceWorker.ready.catch(() => null));
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, swOptions);
        return true;
      }
    }
  } catch {
    // Fall back to direct Notification constructor below
  }

  try {
    const notif = new Notification(title, {
      body,
      icon,
      badge: '/pwa-192x192.png',
      tag,
      silent: Boolean(payload.silent),
    });
    notif.onclick = () => {
      try {
        window.focus();
        window.dispatchEvent(
          new CustomEvent('szmc_notification_deep_link', {
            detail: {
              route: payload.route || (payload.postId ? `post-${payload.postId}` : isMessage ? 'messages' : 'feed'),
              conversationId: payload.conversationId || null,
              postId: payload.postId || null,
              notificationId: payload.id || null,
            },
          })
        );
      } catch {}
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Syncs unread count to the browser tab title (e.g., "(3) SZMC Alumni") and
 * the installed PWA app icon badge on Android / iOS / desktop home screens.
 */
export function updateAppUnreadBadge(totalUnreadCount: number): void {
  if (typeof document !== 'undefined') {
    const safeCount = Math.max(0, Math.floor(Number(totalUnreadCount) || 0));
    document.title = safeCount > 0 ? `(${safeCount > 99 ? '99+' : safeCount}) ${BASE_DOCUMENT_TITLE}` : BASE_DOCUMENT_TITLE;
  }

  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (totalUnreadCount > 0 && typeof nav.setAppBadge === 'function') {
        void nav.setAppBadge(Math.min(999, Math.floor(totalUnreadCount))).catch(() => {});
      } else if (typeof nav.clearAppBadge === 'function') {
        void nav.clearAppBadge().catch(() => {});
      }
    } catch {
      // Badging API unsupported on this browser
    }
  }
}
