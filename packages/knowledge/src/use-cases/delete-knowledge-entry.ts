import { withTenant, schema, eq, and } from '@leedi/db';

/** Soft delete — sets ativo = false. Never hard-deletes rows. */
export async function deleteKnowledgeEntry(
  tenantId: string,
  entryId: string
): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schema.knowledgeBase)
      .set({ ativo: false })
      .where(and(eq(schema.knowledgeBase.id, entryId), eq(schema.knowledgeBase.tenantId, tenantId)))
      .returning({ id: schema.knowledgeBase.id });

    return rows.length > 0;
  });
}
