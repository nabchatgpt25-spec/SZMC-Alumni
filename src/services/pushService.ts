import { getClientAuthHeaders } from '../lib/supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isWebPushSupported(): Promise<boolean> {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function subscribeToBrowserPush(): Promise<{
  subscribed: boolean;
  reason?: string;
}> {
  if (!(await isWebPushSupported())) {
    return { subscribed: false, reason: 'unsupported' };
  }

  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      return { subscribed: false, reason: 'unavailable' };
    }
    const { configured, publicKey } = await keyRes.json();
    if (!configured || !publicKey) {
      return { subscribed: false, reason: 'vapid_not_configured' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { subscribed: false, reason: 'permission_denied' };
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const headers = await getClientAuthHeaders();
    if (!headers.Authorization) {
      return { subscribed: false, reason: 'unauthenticated' };
    }

    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return { subscribed: saveRes.ok };
  } catch (err: any) {
    return { subscribed: false, reason: err?.message || 'error' };
  }
}

export async function unsubscribeFromBrowserPush(): Promise<boolean> {
  if (!(await isWebPushSupported())) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return true;

    const headers = await getClientAuthHeaders();
    if (headers.Authorization) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => undefined);
    }
    return await existing.unsubscribe();
  } catch {
    return false;
  }
}
