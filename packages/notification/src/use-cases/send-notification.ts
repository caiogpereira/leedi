import { withServiceRole, schema, eq, and, inArray } from '@leedi/db';
import { captureException } from '@leedi/observability';
import { sendEmailViaResend } from '../adapters/resend.js';
import { sendPush } from '../adapters/push-provider.js';

export interface SendNotificationInput {
  userId: string;
  tenantId: string;
  tipo: string;
  titulo: string;
  corpo: string;
  canal: 'push' | 'email' | 'both';
}

type TenantRole = 'owner' | 'admin' | 'operator' | 'viewer';

/**
 * Delivers a notification via push and/or email, respecting the user's
 * per-event channel preferences (Story 18.2).
 *
 * Push fallback: if canal='push' and the user has no registered devices,
 * email is sent instead and the notifications row records canal='email'.
 */
export async function sendNotification(input: SendNotificationInput): Promise<void> {
  const { userId, tenantId, tipo, titulo, corpo, canal } = input;

  // Load user's notification preferences for this event type.
  const [prefRow] = await withServiceRole(async (tx) =>
    tx
      .select({ eventos: schema.notificationPreferences.eventos })
      .from(schema.notificationPreferences)
      .where(
        and(
          eq(schema.notificationPreferences.tenantId, tenantId),
          eq(schema.notificationPreferences.userId, userId)
        )
      )
      .limit(1)
  );

  const eventos = (prefRow?.eventos ?? {}) as Record<string, { push: boolean; email: boolean }>;
  const eventPref = eventos[tipo] ?? { push: true, email: true };

  // Determine effective channels after preference filtering.
  const wantPush = (canal === 'push' || canal === 'both') && eventPref.push;
  const wantEmail = (canal === 'email' || canal === 'both') && eventPref.email;

  if (!wantPush && !wantEmail) return;

  // 'both' maps to 'push' in DB (actual canal is resolved post-delivery).
  const initialCanal: 'push' | 'email' = wantEmail && !wantPush ? 'email' : 'push';

  // Insert the notifications row with status 'pendente'.
  const [inserted] = await withServiceRole(async (tx) =>
    tx
      .insert(schema.notifications)
      .values({ userId, tenantId, tipo, titulo, corpo, canal: initialCanal, status: 'pendente' })
      .returning({ id: schema.notifications.id })
  );
  if (!inserted) return;

  const notificationId = inserted.id;
  let effectiveCanal: 'push' | 'email' = initialCanal;
  let success = true;

  try {
    if (wantPush) {
      const subs = await withServiceRole(async (tx) =>
        tx
          .select({
            endpoint: schema.pushSubscriptions.endpoint,
            p256dh: schema.pushSubscriptions.p256dh,
            auth: schema.pushSubscriptions.auth,
          })
          .from(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.userId, userId))
      );

      if (subs.length > 0) {
        const results = await sendPush(subs, { title: titulo, body: corpo });
        const allFailed = results.every((r) => r.failed || r.gone);
        if (allFailed) success = false;
      } else if (!wantEmail) {
        // Push-only with no subscriptions — fall back to email.
        effectiveCanal = 'email';
        const sent = await deliverEmail(userId, titulo, corpo);
        if (!sent) success = false;
      }
    }

    if (wantEmail) {
      const sent = await deliverEmail(userId, titulo, corpo);
      if (!sent) success = false;
    }
  } catch (err) {
    captureException(err);
    success = false;
  }

  await withServiceRole(async (tx) =>
    tx
      .update(schema.notifications)
      .set({
        status: success ? 'enviado' : 'falhou',
        canal: effectiveCanal satisfies 'push' | 'email',
      })
      .where(eq(schema.notifications.id, notificationId))
  );
}

/**
 * Sends a notification to all tenant members with one of the specified roles,
 * respecting each user's individual preferences.
 *
 * Fan-out: one notification per eligible user. Each user's preferences are
 * checked independently inside sendNotification.
 */
export async function sendNotificationToTenantRole(input: {
  tenantId: string;
  roles: TenantRole[];
  tipo: string;
  titulo: string;
  corpo: string;
  canal?: 'push' | 'email' | 'both';
}): Promise<void> {
  const { tenantId, roles, tipo, titulo, corpo, canal = 'both' } = input;

  const members = await withServiceRole(async (tx) =>
    tx
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.tenantId, tenantId),
          inArray(schema.memberships.role, roles)
        )
      )
  );

  // Fan-out sequentially to avoid overwhelming push services on large tenants.
  for (const { userId } of members) {
    await sendNotification({ userId, tenantId, tipo, titulo, corpo, canal }).catch(
      captureException
    );
  }
}

async function deliverEmail(userId: string, titulo: string, corpo: string): Promise<boolean> {
  const [user] = await withServiceRole(async (tx) =>
    tx
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
  );
  if (!user?.email) return false;

  await sendEmailViaResend({
    to: user.email,
    subject: titulo,
    template: 'system-notification',
    data: { titulo, corpo },
  });
  return true;
}
