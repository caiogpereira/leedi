import { withTenant, schema, eq, and, ilike, or } from '@leedi/db';

export interface SearchKnowledgeBaseInput {
  tenantId: string;
  tipo?: 'faq' | 'objecao';
  categoria?: string;
  query?: string;
}

export interface KnowledgeSearchResult {
  perguntaOuObjecao: string;
  respostaOuContorno: string;
  tipo: 'faq' | 'objecao';
  categoria: string | null;
}

/**
 * Agent tool: consultar_base_conhecimento
 * V1: keyword/exact match on tipo + categoria, optional ILIKE on query text.
 * Vector search (embedding) is deferred to V2.
 */
export async function searchKnowledgeBase(
  tenantId: string,
  opts: SearchKnowledgeBaseInput
): Promise<KnowledgeSearchResult[]> {
  const { tipo, categoria, query } = opts;

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(schema.knowledgeBase.tenantId, tenantId),
      eq(schema.knowledgeBase.ativo, true),
    ];

    if (tipo) {
      conditions.push(eq(schema.knowledgeBase.tipo, tipo));
    }

    if (categoria) {
      conditions.push(eq(schema.knowledgeBase.categoria, categoria));
    }

    if (query?.trim()) {
      const pattern = `%${query.trim()}%`;
      const textSearch = or(
        ilike(schema.knowledgeBase.perguntaOuObjecao, pattern),
        ilike(schema.knowledgeBase.respostaOuContorno, pattern)
      );
      if (textSearch) {
        conditions.push(textSearch);
      }
    }

    const rows = await tx
      .select({
        perguntaOuObjecao: schema.knowledgeBase.perguntaOuObjecao,
        respostaOuContorno: schema.knowledgeBase.respostaOuContorno,
        tipo: schema.knowledgeBase.tipo,
        categoria: schema.knowledgeBase.categoria,
      })
      .from(schema.knowledgeBase)
      .where(and(...conditions));

    return rows as KnowledgeSearchResult[];
  });
}
