import { withTenant, schema, eq, and } from '@leedi/db';
import type { TemplateComponentes, TemplateVariavel } from '@leedi/db';

export interface TemplateRow {
  id: string;
  tenantId: string;
  connectionId: string | null;
  nome: string;
  categoria: 'marketing' | 'utility' | 'authentication';
  idioma: string;
  componentes: TemplateComponentes;
  variaveis: TemplateVariavel[];
  metaTemplateId: string | null;
  status: 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' | 'pausado';
  motivoRejeicao: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getTemplates(
  tenantId: string,
  filters?: { status?: string; page?: number; limit?: number }
): Promise<TemplateRow[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(schema.templates.tenantId, tenantId)];
    if (filters?.status) {
      conditions.push(
        eq(schema.templates.status, filters.status as TemplateRow['status'])
      );
    }

    const rows = await tx
      .select()
      .from(schema.templates)
      .where(and(...conditions))
      .orderBy(schema.templates.createdAt);

    return rows as unknown as TemplateRow[];
  });
}
