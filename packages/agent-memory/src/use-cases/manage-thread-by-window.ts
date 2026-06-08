import { withTenant, schema, eq, and } from '@leedi/db';
import type { AgentThreadStatus } from '../types.js';

/**
 * Updates the status of an agent thread identified by its conversation window ID.
 * Used by the Human Inbox (Story 14.3) to pause/resume/close threads when a human
 * operator takes over, returns to bot, or resolves a conversation.
 *
 * No-ops silently when no thread exists for the given window (window may not have
 * had an agent run yet — the caller must not fail in that case).
 */
async function setThreadStatusByWindowId(
  tenantId: string,
  conversationWindowId: string,
  status: AgentThreadStatus
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const [thread] = await tx
      .select({ id: schema.agentThreads.id })
      .from(schema.agentThreads)
      .where(
        and(
          eq(schema.agentThreads.tenantId, tenantId),
          eq(schema.agentThreads.conversationWindowId, conversationWindowId)
        )
      )
      .orderBy(schema.agentThreads.createdAt)
      .limit(1);

    if (!thread) return;

    await tx
      .update(schema.agentThreads)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.agentThreads.id, thread.id));
  });
}

export async function pauseThreadByWindowId(
  tenantId: string,
  conversationWindowId: string
): Promise<void> {
  await setThreadStatusByWindowId(tenantId, conversationWindowId, 'pausado');
}

export async function resumeThreadByWindowId(
  tenantId: string,
  conversationWindowId: string
): Promise<void> {
  await setThreadStatusByWindowId(tenantId, conversationWindowId, 'ativo');
}

export async function closeThreadByWindowId(
  tenantId: string,
  conversationWindowId: string
): Promise<void> {
  await setThreadStatusByWindowId(tenantId, conversationWindowId, 'encerrado');
}
