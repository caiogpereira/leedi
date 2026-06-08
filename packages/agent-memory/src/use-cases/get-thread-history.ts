import { withTenant, schema, eq, and, sql } from '@leedi/db';
import type { AgentMessageContent, AnthropicHistoryMessage } from '../types.js';

/**
 * Returns the thread's prior messages shaped for the Anthropic `messages` array,
 * ordered oldest-first.
 *
 * Two transforms are mandatory or the API 400s:
 *   - The persisted `system` row is audit-only and is FILTERED OUT — the system
 *     prompt is rebuilt per request and passed in the `system` param, never in
 *     `messages`.
 *   - The persisted `tool` role maps to `{ role: 'user', content: [...tool_result] }`,
 *     because the Anthropic `messages` array only accepts user/assistant roles.
 *
 * RLS-scoped via withTenant. @leedi/agent-memory is the ONLY reader of agent_messages.
 */
export async function getThreadHistory(
  tenantId: string,
  threadId: string
): Promise<AnthropicHistoryMessage[]> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        role: schema.agentMessages.role,
        content: schema.agentMessages.content,
      })
      .from(schema.agentMessages)
      .where(
        and(
          eq(schema.agentMessages.tenantId, tenantId),
          eq(schema.agentMessages.threadId, threadId)
        )
      )
      .orderBy(sql`${schema.agentMessages.createdAt} ASC`)
  );

  const history: AnthropicHistoryMessage[] = [];
  for (const row of rows) {
    const content = row.content as AgentMessageContent;
    if (row.role === 'system') continue; // audit-only; goes in the `system` param
    if (row.role === 'tool') {
      history.push({ role: 'user', content });
      continue;
    }
    history.push({ role: row.role, content });
  }

  return history;
}
