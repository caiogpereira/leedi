import { Hono } from 'hono';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { rateLimitTenant } from '../middleware/rate-limit.js';
import { withServiceRole, schema, eq, and } from '@leedi/db';

const EVENT_TYPES = [
  'venda_aprovada',
  'lead_pediu_humano',
  'template_rejeitado',
  'quality_caindo',
  'conta_bloqueada',
  'disparo_concluido',
  'alerta_uso',
] as const;

type EventType = (typeof EVENT_TYPES)[number];

interface EventPreference {
  push: boolean;
  email: boolean;
}

type EventPreferences = Partial<Record<EventType, EventPreference>>;

const DEFAULT_PREFERENCES = {
  canais: { push: true, email: true },
  eventos: Object.fromEntries(EVENT_TYPES.map((e) => [e, { push: true, email: true }])) as Record<
    EventType,
    EventPreference
  >,
};

export function createNotificationPreferencesRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/notification-preferences (AC: #1, #5)
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const userId = c.get('userId');

    const [row] = await withServiceRole(async (tx) =>
      tx
        .select({
          canais: schema.notificationPreferences.canais,
          eventos: schema.notificationPreferences.eventos,
        })
        .from(schema.notificationPreferences)
        .where(
          and(
            eq(schema.notificationPreferences.tenantId, tenantId),
            eq(schema.notificationPreferences.userId, userId)
          )
        )
        .limit(1)
    );

    if (!row) {
      return c.json(DEFAULT_PREFERENCES);
    }

    // Merge stored eventos with defaults so new event types default to ON.
    const storedEventos = (row.eventos ?? {}) as EventPreferences;
    const merged = { ...DEFAULT_PREFERENCES.eventos, ...storedEventos };

    return c.json({ canais: row.canais ?? DEFAULT_PREFERENCES.canais, eventos: merged });
  });

  // PATCH /api/tenants/:tenantId/notification-preferences (AC: #4)
  router.patch('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const userId = c.get('userId');

    let body: { tipo?: unknown; canal?: unknown; enabled?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const tipo = typeof body.tipo === 'string' ? body.tipo : null;
    const canal = body.canal === 'push' || body.canal === 'email' ? body.canal : null;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : null;

    if (!tipo || !canal || enabled === null) {
      return c.json({ error: 'tipo, canal (push|email), and enabled (boolean) are required.' }, 400);
    }

    // Load existing row, merge into eventos jsonb, upsert.
    const [existing] = await withServiceRole(async (tx) =>
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

    const currentEventos = ((existing?.eventos ?? {}) as EventPreferences);
    const updatedEventos: EventPreferences = {
      ...currentEventos,
      [tipo]: {
        ...(currentEventos[tipo as EventType] ?? { push: true, email: true }),
        [canal]: enabled,
      },
    };

    await withServiceRole(async (tx) =>
      tx
        .insert(schema.notificationPreferences)
        .values({
          tenantId,
          userId,
          eventos: updatedEventos as Record<string, { push: boolean; email: boolean }>,
        })
        .onConflictDoUpdate({
          target: [schema.notificationPreferences.tenantId, schema.notificationPreferences.userId],
          set: {
            eventos: updatedEventos as Record<string, { push: boolean; email: boolean }>,
            updatedAt: new Date(),
          },
        })
    );

    return c.json({ ok: true });
  });

  return router;
}
