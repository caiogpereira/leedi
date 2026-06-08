import { Hono } from 'hono';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { rateLimitTenant } from '../middleware/rate-limit.js';
import { withServiceRole, schema, eq, and } from '@leedi/db';

export function createPushSubscriptionsRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // POST /api/tenants/:tenantId/push/subscribe (AC: #4, #5)
  router.post('/subscribe', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const userId = c.get('userId');

    let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
    const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : null;
    const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : null;

    if (!endpoint || !p256dh || !auth) {
      return c.json({ error: 'endpoint, keys.p256dh, and keys.auth are required.' }, 400);
    }

    await withServiceRole(async (tx) =>
      tx
        .insert(schema.pushSubscriptions)
        .values({ userId, tenantId, endpoint, p256dh, auth })
        .onConflictDoUpdate({
          target: [schema.pushSubscriptions.userId, schema.pushSubscriptions.endpoint],
          set: { p256dh, auth },
        })
    );

    return c.json({ ok: true });
  });

  // DELETE /api/tenants/:tenantId/push/subscribe (AC: security — user can only delete own)
  router.delete('/subscribe', requireTenantSession(), async (c) => {
    const userId = c.get('userId');

    let body: { endpoint?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
    if (!endpoint) {
      return c.json({ error: 'endpoint is required.' }, 400);
    }

    await withServiceRole(async (tx) =>
      tx
        .delete(schema.pushSubscriptions)
        .where(
          and(
            eq(schema.pushSubscriptions.userId, userId),
            eq(schema.pushSubscriptions.endpoint, endpoint)
          )
        )
    );

    return new Response(null, { status: 204 });
  });

  return router;
}
