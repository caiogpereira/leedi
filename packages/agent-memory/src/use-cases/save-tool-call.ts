import { withTenant, schema } from '@leedi/db';

export interface SaveToolCallInput {
  tenantId: string;
  threadId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  messageId?: string | undefined;
  duracaoMs?: number | undefined;
  erro?: string | undefined;
}

/**
 * Persists one tool invocation into agent_tool_calls for observability/audit.
 * RLS-scoped via withTenant. Sole writer of agent_tool_calls is this package.
 */
export async function saveToolCall(input: SaveToolCallInput): Promise<string> {
  const { tenantId, threadId, toolName, messageId, duracaoMs, erro } = input;

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.agentToolCalls)
      .values({
        tenantId,
        threadId,
        toolName,
        input: input.input as unknown,
        output: input.output as unknown,
        messageId: messageId ?? null,
        duracaoMs: duracaoMs ?? null,
        erro: erro ?? null,
      })
      .returning({ id: schema.agentToolCalls.id })
  );

  return row!.id;
}
