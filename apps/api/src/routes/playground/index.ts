import { Hono } from 'hono';
import { z } from 'zod';
import { Redis } from '@upstash/redis';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@leedi/config';
import { processMessage } from '@leedi/agent';
import type { ToolCallLog } from '@leedi/agent';
import type { AnthropicHistoryMessage } from '@leedi/agent-memory';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { buildScenarioContext } from './scenarios.js';

const SESSION_TTL_SECONDS = 1800; // 30 minutes

/**
 * Sentinel ids for the sandbox playground turn. These flow into `processMessage`
 * and end up in uuid-typed `WHERE` clauses (loadAgentContext's lead lookup, the
 * read-side tools). They MUST be valid UUIDs — a non-uuid string like
 * 'playground-lead' makes Postgres raise `22P02 invalid input syntax for type
 * uuid` and the route 500s on the first message. The nil UUID matches no row, so
 * the lead lookup falls back to the synthetic default and no real data is touched.
 */
const SANDBOX_ID = '00000000-0000-0000-0000-000000000000';

type Scenario = 'novo_lead' | 'lead_recorrente' | 'lead_com_objecao';

interface PlaygroundSession {
  history: AnthropicHistoryMessage[];
  scenario: Scenario;
  turn: number;
}

const MessageSchema = z.object({
  message: z.string().min(1).max(2000),
  campaignId: z.string().uuid().optional(),
  scenario: z.enum(['novo_lead', 'lead_recorrente', 'lead_com_objecao']),
  sessionId: z.string().optional(),
});

// Noop lock: processMessage sandbox path short-circuits before lock use.
const noopLock = {
  set: async () => 'OK' as const,
  get: async () => null,
  del: async () => 1,
};

// Lazy singletons — initialized on first request, not at import time.
let _redis: Redis | undefined;
let _anthropic: Anthropic | undefined;

function getRedis(): Redis {
  _redis ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return _redis;
}

function getAnthropic(): Anthropic {
  _anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export function createPlaygroundRouter() {
  const router = new Hono();
  router.use('*', rateLimitTenant());

  function sessionKey(tenantId: string, sessionId: string) {
    return `playground:${tenantId}:${sessionId}`;
  }

  // POST /api/tenants/:tenantId/playground/message
  router.post('/message', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const parseResult = MessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parseResult.success) {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    const { message, scenario, sessionId: existingSessionId, campaignId } = parseResult.data;

    // Resolve or create session.
    let session: PlaygroundSession | null = null;
    let sessionId = existingSessionId;

    if (sessionId) {
      session = await getRedis().get<PlaygroundSession>(sessionKey(tenantId, sessionId));
    }

    if (!sessionId || !session) {
      sessionId = crypto.randomUUID();
      const scenarioCtx = buildScenarioContext(scenario);
      session = {
        history: [...scenarioCtx.syntheticHistory],
        scenario,
        turn: 0,
      };
      // 'lead_com_objecao': inject the canned objection as the first user message.
      if (scenarioCtx.initialUserMessage) {
        session.history.push({ role: 'user', content: scenarioCtx.initialUserMessage });
      }
    }

    const result = await processMessage(
      {
        tenantId,
        connectionId: SANDBOX_ID,
        leadId: SANDBOX_ID,
        leadPhone: '+5511999000001',
        conversationWindowId: SANDBOX_ID,
        userText: message,
        sandboxMode: true,
        seedHistory: session.history,
        ...(campaignId ? { campaignId } : {}),
      },
      {
        redis: noopLock,
        anthropic: getAnthropic(),
      }
    );

    if (result.status !== 'sandbox') {
      return c.json({ error: `Agent returned: ${result.status}` }, 500);
    }

    // Update session history with the new turn.
    session.history.push({ role: 'user', content: message });
    session.history.push({ role: 'assistant', content: result.segments.join('\n') });
    session.turn += 1;

    await getRedis().set(sessionKey(tenantId, sessionId), session, { ex: SESSION_TTL_SECONDS });

    return c.json({
      sessionId,
      segments: result.segments,
      toolCalls: result.toolCalls as ToolCallLog[],
      turn: session.turn,
    });
  });

  // DELETE /api/tenants/:tenantId/playground/session/:sessionId
  router.delete('/session/:sessionId', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const sessionId = c.req.param('sessionId');
    if (!sessionId) return c.json({ error: 'sessionId required' }, 400);
    await getRedis().del(sessionKey(tenantId, sessionId));
    return c.json({ ok: true });
  });

  return router;
}
