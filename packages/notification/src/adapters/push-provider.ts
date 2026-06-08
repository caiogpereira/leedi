import webpush from 'web-push';
import { env } from '@leedi/config';
import { withServiceRole, schema, eq } from '@leedi/db';
import { captureException } from '@leedi/observability';

// VAPID must be configured once at module load, not per-request.
webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

export interface PushPayload {
  title: string;
  body: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushResult {
  endpoint: string;
  gone?: boolean;
  failed?: boolean;
}

export async function sendPush(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload
): Promise<PushResult[]> {
  const results: PushResult[] = [];
  const goneEndpoints: string[] = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      results.push({ endpoint: sub.endpoint });
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410) {
        goneEndpoints.push(sub.endpoint);
        results.push({ endpoint: sub.endpoint, gone: true });
      } else {
        captureException(err);
        results.push({ endpoint: sub.endpoint, failed: true });
      }
    }
  }

  // Remove expired subscriptions (410 Gone) from DB.
  if (goneEndpoints.length > 0) {
    await withServiceRole(async (tx) => {
      for (const endpoint of goneEndpoints) {
        await tx
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.endpoint, endpoint));
      }
    });
  }

  return results;
}
