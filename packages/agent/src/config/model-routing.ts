// Canonical model routing + pricing for the agent (Story 7.8).
//
// THIS IS THE SINGLE SOURCE OF TRUTH for every Claude model id string in the
// codebase. No other file may hardcode a `claude-*` id — import from here.
//
// §7.4 of docs/01-leedi-arquitetura.md: cheap auxiliary tasks (tag
// classification, handoff summaries, text improvement) run on Haiku; the sales
// conversation runs on the tenant's configured model (Sonnet by default, Opus
// for Enterprise).

/** Model bucket → exact Anthropic model id. The ONLY place these ids live. */
export const SALES_MODELS = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-8',
} as const;

export type ModelBucket = keyof typeof SALES_MODELS;

/**
 * Approximate USD pricing PER TOKEN (already divided by 1e6 — these are the
 * per-million-token list prices over 1,000,000). ESTIMATES only: they drive
 * `agent_messages.custo_usd` for usage/billing dashboards, not real billing.
 * A price change is a single edit here.
 *
 * Do NOT divide by 1e6 again at the call site — the division lives here.
 */
export const MODEL_PRICING: Record<ModelBucket, { input: number; output: number }> = {
  sonnet: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  haiku: { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
  opus: { input: 15 / 1_000_000, output: 75 / 1_000_000 },
};

/** Auxiliary AI task → model bucket. The sales conversation uses the configured model. */
export const TASK_MODELS = {
  tag_classification: 'haiku',
  handoff_summary: 'haiku',
  text_improvement: 'haiku',
  sales_conversation: 'sonnet',
} as const satisfies Record<string, ModelBucket>;

export type AiTask = keyof typeof TASK_MODELS;

/** Resolves the exact Anthropic model id for a named auxiliary task. */
export function modelIdForTask(task: AiTask): string {
  return SALES_MODELS[TASK_MODELS[task]];
}
