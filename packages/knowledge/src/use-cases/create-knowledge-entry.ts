import { z } from 'zod';
import { withTenant, schema } from '@leedi/db';

export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

export const createKnowledgeEntrySchema = z.object({
  tenantId: z.string().uuid(),
  tipo: z.enum(['faq', 'objecao']),
  perguntaOuObjecao: z.string().min(1),
  respostaOuContorno: z.string().min(1),
  categoria: z.string().optional(),
});

export type CreateKnowledgeEntryInput = z.infer<typeof createKnowledgeEntrySchema>;

export interface KnowledgeEntryRow {
  id: string;
  tenantId: string;
  tipo: 'faq' | 'objecao';
  perguntaOuObjecao: string;
  respostaOuContorno: string;
  categoria: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function createKnowledgeEntry(
  input: CreateKnowledgeEntryInput
): Promise<KnowledgeEntryRow> {
  const parsed = createKnowledgeEntrySchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new KnowledgeValidationError(firstError?.message ?? 'Dados inválidos.');
  }

  const { tenantId, tipo, perguntaOuObjecao, respostaOuContorno, categoria } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(schema.knowledgeBase)
      .values({ tenantId, tipo, perguntaOuObjecao, respostaOuContorno, categoria })
      .returning();

    return rows[0] as KnowledgeEntryRow;
  });
}
