import { withTenant, schema, eq, and } from '@leedi/db';
import type { TemplateComponentes, TemplateVariavel } from '@leedi/db';
import { z } from 'zod';
import { TemplateComponentesSchema, TemplateValidationError } from './create-template.js';
import type { TemplateRow } from './get-templates.js';

export const UpdateTemplateSchema = z.object({
  nome: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'O nome deve conter apenas letras minúsculas, números e underscores.')
    .optional(),
  categoria: z.enum(['marketing', 'utility', 'authentication']).optional(),
  idioma: z.string().optional(),
  componentes: TemplateComponentesSchema.optional(),
  variaveis: z
    .array(z.object({ index: z.number().int().positive(), exemplo: z.string().min(1) }))
    .optional(),
  connectionId: z.string().uuid().nullable().optional(),
});

export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

export async function updateTemplate(
  tenantId: string,
  templateId: string,
  input: UpdateTemplateInput
): Promise<TemplateRow | null> {
  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ status: schema.templates.status })
      .from(schema.templates)
      .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
      .limit(1);

    if (!existing) return null;
    if (existing.status !== 'rascunho') {
      throw new TemplateValidationError(
        'Apenas templates em rascunho podem ser editados diretamente. Para editar um template aprovado, use a duplicação.'
      );
    }

    const [updated] = await tx
      .update(schema.templates)
      .set({
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.categoria !== undefined && { categoria: input.categoria }),
        ...(input.idioma !== undefined && { idioma: input.idioma }),
        ...(input.componentes !== undefined && {
          componentes: input.componentes as unknown as TemplateComponentes,
        }),
        ...(input.variaveis !== undefined && {
          variaveis: input.variaveis as unknown as TemplateVariavel[],
        }),
        ...(input.connectionId !== undefined && { connectionId: input.connectionId }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
      .returning();

    return updated as unknown as TemplateRow;
  });
}
