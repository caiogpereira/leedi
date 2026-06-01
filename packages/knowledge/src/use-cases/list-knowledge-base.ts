import { withTenant, schema, eq, and, ilike } from '@leedi/db';
import type { KnowledgeEntryRow } from './create-knowledge-entry.js';

export interface ListKnowledgeBaseInput {
  tenantId: string;
  tipo?: 'faq' | 'objecao';
  categoria?: string;
}

export async function listKnowledgeBase(
  input: ListKnowledgeBaseInput
): Promise<KnowledgeEntryRow[]> {
  const { tenantId, tipo, categoria } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(schema.knowledgeBase.tenantId, tenantId),
      eq(schema.knowledgeBase.ativo, true),
    ];

    if (tipo) {
      conditions.push(eq(schema.knowledgeBase.tipo, tipo));
    }

    if (categoria) {
      conditions.push(ilike(schema.knowledgeBase.categoria, categoria));
    }

    const rows = await tx
      .select()
      .from(schema.knowledgeBase)
      .where(and(...conditions))
      .orderBy(schema.knowledgeBase.createdAt);

    return rows as KnowledgeEntryRow[];
  });
}
