// Tool: adicionar_tag — configurable action. Tags a lead for segmentation, with
// optional Haiku-based classification from the conversation context.
//
// schema-vs-ctx boundary: Claude supplies `tagText` (+ optional
// `conversationContext`). tenantId and leadId come from ToolContext.
//
// Flow (AC#3–#5):
//   1. If conversationContext is provided, ask Claude Haiku to refine the tag
//      into the most appropriate label (AC#5).
//   2. Idempotency (AC#4): the lead_tags table has a DB-level UNIQUE constraint
//      on (tenant_id, lead_id, tag) (migration 0023), so the insert uses
//      ON CONFLICT DO NOTHING — a re-tag is a silent no-op with no race window.
//   3. Insert with origem_tag='agente' (AC#3).
//   4. Return { tagged: true, tag }.

import Anthropic from '@anthropic-ai/sdk';
import { withTenant, schema } from '@leedi/db';
import { modelIdForTask } from '../config/model-routing.js';
import type { ToolContext } from './types.js';

export interface AdicionarTagInput {
  tagText: string;
  conversationContext?: string;
}

export interface AdicionarTagResult {
  tagged: boolean;
  tag: string;
}

// Tag classification MUST use Haiku (never Sonnet) — it is a cheap labeling task.
// The model id is resolved centrally from the canonical routing map (Story 7.8).
const TAG_MODEL = modelIdForTask('tag_classification');

/**
 * Adds a segmentation tag to the lead. When `conversationContext` is supplied,
 * the tag is first refined by Claude Haiku; the (possibly refined) final tag is
 * then deduplicated in-app before insertion.
 */
export async function adicionarTag(
  input: AdicionarTagInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId'>
): Promise<AdicionarTagResult> {
  const tag = input.conversationContext
    ? await classifyTag(input.tagText, input.conversationContext)
    : input.tagText.trim();

  return withTenant(ctx.tenantId, async (tx) => {
    // AC#4 — idempotency enforced by the DB UNIQUE (tenant_id, lead_id, tag)
    // constraint (migration 0023); ON CONFLICT DO NOTHING makes a re-tag a no-op.
    await tx
      .insert(schema.leadTags)
      .values({
        tenantId: ctx.tenantId,
        leadId: ctx.leadId,
        tag,
        origemTag: 'agente',
      })
      .onConflictDoNothing({
        target: [schema.leadTags.tenantId, schema.leadTags.leadId, schema.leadTags.tag],
      });

    return { tagged: true, tag };
  });
}

/**
 * Uses Claude Haiku to pick the most appropriate tag from the conversation
 * context. Falls back to the raw `tagText` if the model returns nothing usable.
 */
async function classifyTag(tagText: string, conversationContext: string): Promise<string> {
  const anthropic = new Anthropic();
  const res = await anthropic.messages.create({
    model: TAG_MODEL,
    max_tokens: 32,
    messages: [
      {
        role: 'user',
        content:
          'Given this conversation context, what is the most appropriate tag for ' +
          'this lead? Return only the tag text in Portuguese, lowercase, max 3 ' +
          `words.\n\nSuggested tag: ${tagText}\n\nConversation context:\n${conversationContext}`,
      },
    ],
  });

  const block = res.content.find((b) => b.type === 'text');
  const refined =
    block && 'text' in block ? block.text.trim().toLowerCase() : '';
  return refined || tagText.trim();
}
