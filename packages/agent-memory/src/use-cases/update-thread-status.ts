import { withTenant, schema, eq, and } from '@leedi/db';
import type { AgentThreadStatus } from '../types.js';

/**
 * Sets a thread's lifecycle status (ativo | pausado | encerrado).
 * RLS-scoped via withTenant. Sole writer of agent_threads is this package.
 */
export async function updateThreadStatus(
  tenantId: string,
  threadId: string,
  status: AgentThreadStatus
): Promise<void> {
  await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.agentThreads)
      .set({ status, updatedAt: new Date() })
      .where(
        and(eq(schema.agentThreads.tenantId, tenantId), eq(schema.agentThreads.id, threadId))
      )
  );
}
