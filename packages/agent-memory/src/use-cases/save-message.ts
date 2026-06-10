import { withTenant, schema } from '@leedi/db';
import type { AgentMessageContent, AgentMessageRole } from '../types.js';

// Approximate USD pricing PER TOKEN (already divided by 1e6). DUPLICATED here to
// keep package isolation — @leedi/agent-memory must NOT import @leedi/agent (it
// would create a dependency cycle). SOURCE OF TRUTH:
// packages/agent/src/config/model-routing.ts (MODEL_PRICING). Keep in sync.
const MODEL_PRICING: Record<'sonnet' | 'haiku' | 'opus', { input: number; output: number }> = {
  sonnet: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  haiku: { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  opus: { input: 5 / 1_000_000, output: 25 / 1_000_000 },
};

/**
 * Maps a Claude model id to its pricing bucket by substring (so
 * `claude-haiku-4-5-20251001` → `haiku`). Returns null for an unrecognized id —
 * the caller then leaves `custo_usd` null rather than guessing.
 */
function pricingBucketForModel(modelo: string): 'sonnet' | 'haiku' | 'opus' | null {
  if (modelo.includes('haiku')) return 'haiku';
  if (modelo.includes('sonnet')) return 'sonnet';
  if (modelo.includes('opus')) return 'opus';
  return null;
}

/**
 * Computes the message cost in USD: `input * price.input + output * price.output`.
 * Pricing is already per-token (do NOT divide again). Returns null when the model
 * is unknown or no tokens are present, so the row's `custo_usd` stays null.
 */
function computeCostUsd(
  modelo: string,
  tokensInput: number | undefined,
  tokensOutput: number | undefined
): string | null {
  const bucket = pricingBucketForModel(modelo);
  if (!bucket) return null;
  const price = MODEL_PRICING[bucket];
  const cost = (tokensInput ?? 0) * price.input + (tokensOutput ?? 0) * price.output;
  return String(cost);
}

export interface SaveMessageInput {
  tenantId: string;
  threadId: string;
  role: AgentMessageRole;
  /** Anthropic SDK message format — string or content-block array. */
  content: AgentMessageContent;
  tokensInput?: number | undefined;
  tokensOutput?: number | undefined;
  modelo?: string | undefined;
  custoUsd?: string | undefined;
}

/**
 * Persists one agent message into agent_messages (the SDK message format goes
 * verbatim into the jsonb `content` column). Token/model/cost columns are
 * optional — assistant turns carry usage, user/system turns do not.
 *
 * The table is range-partitioned on created_at with composite PK (id, created_at);
 * returning only `id` is fine for our access patterns. RLS-scoped via withTenant.
 * @leedi/agent-memory is the ONLY module that touches agent_messages.
 */
export async function saveMessage(input: SaveMessageInput): Promise<string> {
  const { tenantId, threadId, role, content, tokensInput, tokensOutput, modelo, custoUsd } = input;

  // AC#6: when a model id is present, compute cost from the token usage unless an
  // explicit `custoUsd` was passed (respect a caller-supplied value).
  const resolvedCustoUsd =
    custoUsd ?? (modelo ? computeCostUsd(modelo, tokensInput, tokensOutput) : null);

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.agentMessages)
      .values({
        tenantId,
        threadId,
        role,
        content: content as unknown,
        tokensInput: tokensInput ?? null,
        tokensOutput: tokensOutput ?? null,
        modelo: modelo ?? null,
        custoUsd: resolvedCustoUsd,
      })
      .returning({ id: schema.agentMessages.id })
  );

  return row!.id;
}
