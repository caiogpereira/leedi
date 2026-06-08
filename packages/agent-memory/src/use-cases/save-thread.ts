import { withTenant, schema, eq, and, sql } from '@leedi/db';
import type { AgentThread } from '../types.js';

export interface SaveThreadInput {
  tenantId: string;
  leadId: string;
  conversationWindowId: string;
}

/**
 * Returns the active agent_thread for a lead's current conversation window,
 * creating one if none exists. Idempotent within a conversation window: a given
 * (tenant, lead, window) maps to exactly one active thread, so repeated inbound
 * messages in the same 24h window reuse the same thread (and thus its history).
 *
 * Runs through withTenant so RLS scopes every read/write to the caller's tenant.
 * @leedi/agent-memory is the ONLY module that touches agent_threads.
 */
export async function saveThread(input: SaveThreadInput): Promise<AgentThread> {
  const { tenantId, leadId, conversationWindowId } = input;

  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.agentThreads)
      .where(
        and(
          eq(schema.agentThreads.tenantId, tenantId),
          eq(schema.agentThreads.leadId, leadId),
          eq(schema.agentThreads.conversationWindowId, conversationWindowId),
          eq(schema.agentThreads.status, 'ativo')
        )
      )
      .orderBy(sql`${schema.agentThreads.createdAt} DESC`)
      .limit(1);

    if (existing) {
      return existing as AgentThread;
    }

    const [created] = await tx
      .insert(schema.agentThreads)
      .values({
        tenantId,
        leadId,
        conversationWindowId,
        status: 'ativo',
      })
      .returning();

    return created as AgentThread;
  });
}

/** Closes any orphaned active threads for a lead outside the current window. */
export async function closeStaleThreads(
  tenantId: string,
  leadId: string,
  keepConversationWindowId: string
): Promise<void> {
  await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.agentThreads)
      .set({ status: 'encerrado', updatedAt: new Date() })
      .where(
        and(
          eq(schema.agentThreads.tenantId, tenantId),
          eq(schema.agentThreads.leadId, leadId),
          eq(schema.agentThreads.status, 'ativo'),
          // Anything not the current window. Null windows are also closed.
          sql`(${schema.agentThreads.conversationWindowId} IS DISTINCT FROM ${keepConversationWindowId})`
        )
      )
  );
}
