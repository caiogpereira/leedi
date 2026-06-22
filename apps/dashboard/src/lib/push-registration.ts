/**
 * Registers the service worker and subscribes to Web Push notifications.
 * Sends the subscription to the API for storage.
 *
 * Must run client-side only (requires browser APIs).
 */
export async function registerPushSubscription(tenantId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  // eslint-disable-next-line no-restricted-properties -- NEXT_PUBLIC_* must be read via process.env so Next inlines it into the client bundle at build time (J-23/F-44); @leedi/config is Node-only and unavailable in the browser.
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return; // Already subscribed on this device.

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const { endpoint, keys } = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    await fetch(`/api/tenants/${tenantId}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, keys }),
    });
  } catch {
    // Push registration failure must not break the dashboard.
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  // Back the view with a concrete ArrayBuffer (not ArrayBufferLike) so the
  // result is assignable to BufferSource for pushManager.subscribe().
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
