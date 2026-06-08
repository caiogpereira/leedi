// Tool: consultar_base_conhecimento — configurable read (gated by
// tools_habilitadas.consultar_base_conhecimento). Looks up FAQs and objection
// contours in the tenant's knowledge_base so the agent can answer questions and
// handle objections with curated, on-brand copy.
//
// schema-vs-ctx boundary: Claude supplies `{ tipo, categoria? }`. tenantId and
// leadId come from ToolContext.
//
// V1 is keyword/EXACT match only — NO vector/semantic search (pgvector deferred
// to V2). Query (AC#1/#2):
//   - tipo='objecao' + categoria → active objections WHERE
//       (categoria IS NULL OR categoria = input.categoria)
//     The NULL branch keeps general (category-agnostic) contours in scope.
//   - tipo='objecao' without categoria → all active objections.
//   - tipo='faq' → ALL active FAQs (categoria is ignored — AC#2).
//
// No matches → return { entries: [] }. NEVER throws (AC#3).
//
// Journey event (Task 4 / AC#1): only for tipo='objecao' with a non-empty result,
// log a lead_journey_events row capturing the matched objection + contour used.
// FAQs do NOT generate journey events.

import { withTenant, schema, eq, and, or, isNull } from '@leedi/db';
import type { ToolContext } from './types.js';

/** Cap the payload so a large catalog can't blow up token cost (story note). */
const MAX_ENTRIES = 20;

export interface ConsultarBaseConhecimentoInput {
  tipo: 'faq' | 'objecao';
  categoria?: string;
}

/** A single matched entry, in the snake_case shape the agent prompt expects. */
export interface KnowledgeEntry {
  pergunta_ou_objecao: string;
  resposta_ou_contorno: string;
}

export interface ConsultarBaseConhecimentoResult {
  entries: KnowledgeEntry[];
}

/**
 * Resolves curated answers/objection contours for the agent. Runs the lookup and
 * (for matched objections) the journey-event insert inside ONE tenant-scoped
 * transaction (RLS, atomicity). Always returns `{ entries: [] }` on no match.
 */
export async function consultarBaseConhecimento(
  input: ConsultarBaseConhecimentoInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId'>
): Promise<ConsultarBaseConhecimentoResult> {
  const { tipo, categoria } = input;

  return withTenant(ctx.tenantId, async (tx) => {
    const conditions = [
      eq(schema.knowledgeBase.tenantId, ctx.tenantId),
      eq(schema.knowledgeBase.ativo, true),
      eq(schema.knowledgeBase.tipo, tipo),
    ];

    // AC#1: objections scope to the matching categoria OR category-agnostic rows.
    // AC#2: FAQs ignore categoria entirely (return all active FAQs).
    if (tipo === 'objecao' && categoria) {
      const categoriaFilter = or(
        isNull(schema.knowledgeBase.categoria),
        eq(schema.knowledgeBase.categoria, categoria)
      );
      if (categoriaFilter) conditions.push(categoriaFilter);
    }

    const rows = await tx
      .select({
        pergunta_ou_objecao: schema.knowledgeBase.perguntaOuObjecao,
        resposta_ou_contorno: schema.knowledgeBase.respostaOuContorno,
      })
      .from(schema.knowledgeBase)
      .where(and(...conditions))
      .limit(MAX_ENTRIES);

    const entries = rows as KnowledgeEntry[];

    // Task 4: record the objection-handling event — objections only, non-empty only.
    if (tipo === 'objecao' && entries.length > 0) {
      const top = entries[0]!;
      await tx.insert(schema.leadJourneyEvents).values({
        tenantId: ctx.tenantId,
        leadId: ctx.leadId,
        tipo: 'objecao',
        detalhes: {
          categoria: categoria ?? null,
          texto_objecao: top.pergunta_ou_objecao,
          contorno_usado: top.resposta_ou_contorno,
        },
      });
    }

    return { entries };
  });
}
