import { withTenant, schema } from '@leedi/db';
import type { TemplateComponentes, TemplateVariavel } from '@leedi/db';
import { z } from 'zod';
import type { TemplateRow } from './get-templates.js';

// ─── Component schemas ────────────────────────────────────────────────────────────
const HeaderComponentSchema = z.object({
  type: z.literal('HEADER'),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']),
  text: z.string().optional(),
});

const BodyComponentSchema = z.object({
  type: z.literal('BODY'),
  text: z.string().min(1, 'O corpo do template é obrigatório.'),
});

const FooterComponentSchema = z.object({
  type: z.literal('FOOTER'),
  text: z.string().min(1),
});

const ButtonSchema = z.object({
  type: z.enum(['URL', 'QUICK_REPLY']),
  text: z.string().min(1),
  url: z.string().url().optional(),
});

const ButtonsComponentSchema = z.object({
  type: z.literal('BUTTONS'),
  buttons: z.array(ButtonSchema).min(1).max(2),
});

export const TemplateComponentesSchema = z.object({
  header: HeaderComponentSchema.optional(),
  body: BodyComponentSchema,
  footer: FooterComponentSchema.optional(),
  buttons: ButtonsComponentSchema.optional(),
});

const VariavelSchema = z.object({
  index: z.number().int().positive(),
  exemplo: z.string().min(1),
});

export const CreateTemplateSchema = z.object({
  nome: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'O nome deve conter apenas letras minúsculas, números e underscores.'),
  categoria: z.enum(['marketing', 'utility', 'authentication']),
  idioma: z.string().default('pt_BR'),
  componentes: TemplateComponentesSchema,
  variaveis: z.array(VariavelSchema).default([]),
  connectionId: z.string().uuid().optional(),
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

/** Extracts variable indices from template body text (e.g. {{1}}, {{2}}). */
export function extractVariableIndices(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  const indices = matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10));
  return [...new Set(indices)].sort((a, b) => a - b);
}

export async function createTemplate(
  tenantId: string,
  input: CreateTemplateInput
): Promise<TemplateRow> {
  return withTenant(tenantId, async (tx) => {
    const [created] = await tx
      .insert(schema.templates)
      .values({
        tenantId,
        connectionId: input.connectionId ?? null,
        nome: input.nome,
        categoria: input.categoria,
        idioma: input.idioma,
        componentes: input.componentes as unknown as TemplateComponentes,
        variaveis: input.variaveis as unknown as TemplateVariavel[],
        status: 'rascunho',
      })
      .returning();

    return created as unknown as TemplateRow;
  });
}
