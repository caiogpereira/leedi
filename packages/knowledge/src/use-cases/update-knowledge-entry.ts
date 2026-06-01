import { z } from 'zod';
import { withTenant, schema, eq, and } from '@leedi/db';
import type { KnowledgeEntryRow } from './create-knowledge-entry.js';
import { KnowledgeValidationError } from './create-knowledge-entry.js';

export const updateKnowledgeEntrySchema = z.object({
  tenantId: z.string().uuid(),
  entryId: z.string().uuid(),
  perguntaOuObjecao: z.string().min(1).optional(),
  respostaOuContorno: z.string().min(1).optional(),
  categoria: z.string().optional().nullable(),
});

export type UpdateKnowledgeEntryInput = z.infer<typeof updateKnowledgeEntrySchema>;

export async function updateKnowledgeEntry(
  input: UpdateKnowledgeEntryInput
): Promise<KnowledgeEntryRow | null> {
  const parsed = updateKnowledgeEntrySchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new KnowledgeValidationError(firstError?.message ?? 'Dados inválidos.');
  }

  const { tenantId, entryId, ...fields } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schema.knowledgeBase)
      .set(fields)
      .where(and(eq(schema.knowledgeBase.id, entryId), eq(schema.knowledgeBase.tenantId, tenantId)))
      .returning();

    return (rows[0] as KnowledgeEntryRow) ?? null;
  });
}
