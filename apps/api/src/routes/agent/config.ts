import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { getOrCreateAgentConfig } from '../../use-cases/agent/get-or-create-agent-config.js';
import {
  updateAgentConfig,
  AgentConfigValidationError,
} from '../../use-cases/agent/update-agent-config.js';

// Postgres FK violation on agent_configs.sales_method_id.
const FK_VIOLATION = '23503';

function isPgError(err: unknown): err is { code?: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export function createAgentConfigRouter() {
  const router = new Hono();

  // NFR8: per-tenant rate limit on every route in this router (keys off :tenantId).
  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/agent-config
  // Returns the current tenant's config, upserting the default if none exists (AC#2).
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const config = await getOrCreateAgentConfig(tenantId);
    return c.json(config);
  });

  // PATCH /api/tenants/:tenantId/agent-config — update fields (AC#3).
  router.patch('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = await c.req.json().catch(() => null);
    try {
      const config = await updateAgentConfig(tenantId, body);
      return c.json(config);
    } catch (err) {
      if (err instanceof AgentConfigValidationError) {
        return c.json({ error: err.message }, 400);
      }
      if (isPgError(err) && err.code === FK_VIOLATION) {
        return c.json({ error: 'Método de venda inválido.' }, 400);
      }
      throw err;
    }
  });

  return router;
}
