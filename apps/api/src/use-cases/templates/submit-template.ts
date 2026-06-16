import { withTenant, withServiceRole, schema, eq, and } from '@leedi/db';
import { MetaCloudProvider } from '@leedi/connection';
import type { TemplateRow } from './get-templates.js';
import type { SubmitTemplatePayload, TemplateComponentPayload } from '@leedi/connection';
import { TemplateValidationError } from './create-template.js';
import type { TemplateComponentes, TemplateVariavel } from '@leedi/db';

/** Maps DB categoria to Meta category value. */
function mapCategoria(
  categoria: string
): 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' {
  const map: Record<string, 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'> = {
    marketing: 'MARKETING',
    utility: 'UTILITY',
    authentication: 'AUTHENTICATION',
  };
  return map[categoria] ?? 'MARKETING';
}

/** Builds Meta API component payload from stored componentes + variaveis. */
function buildMetaComponents(
  componentes: TemplateComponentes,
  variaveis: TemplateVariavel[]
): TemplateComponentPayload[] {
  const result: TemplateComponentPayload[] = [];

  if (componentes.header) {
    result.push({
      type: 'HEADER',
      format: componentes.header.format,
      ...(componentes.header.text && { text: componentes.header.text }),
    });
  }

  const bodyExamples = variaveis.map((v) => v.exemplo);
  result.push({
    type: 'BODY',
    text: componentes.body.text,
    ...(bodyExamples.length > 0 && {
      example: { body_text: [bodyExamples] },
    }),
  });

  if (componentes.footer) {
    result.push({ type: 'FOOTER', text: componentes.footer.text });
  }

  if (componentes.buttons) {
    result.push({
      type: 'BUTTONS',
      buttons: componentes.buttons.buttons.map((b: { type: string; text: string; url?: string }) => ({
        type: b.type,
        text: b.text,
        ...(b.url && { url: b.url }),
      })),
    });
  }

  return result;
}

export async function submitTemplate(
  tenantId: string,
  templateId: string
): Promise<TemplateRow> {
  // Load template with tenant isolation
  const [template] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(schema.templates)
      .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
      .limit(1)
  );

  if (!template) throw new TemplateValidationError('Template não encontrado.');

  if (template.status !== 'rascunho') {
    throw new TemplateValidationError(
      'Apenas templates em rascunho podem ser enviados para aprovação.'
    );
  }

  // F-20: examples are optional while drafting but REQUIRED to submit — Meta
  // rejects a template whose variables lack examples. Enforce here so a draft
  // saved with blank examples fails fast with a clear message instead of a
  // raw Meta API error.
  const variaveisToSubmit = (template.variaveis ?? []) as unknown as TemplateVariavel[];
  if (variaveisToSubmit.some((v) => !v.exemplo || v.exemplo.trim() === '')) {
    throw new TemplateValidationError(
      'Preencha um exemplo para cada variável antes de enviar o template para aprovação.'
    );
  }

  // Load the WhatsApp connection for this template's WABA. Prefer the template's
  // own connectionId so a tenant with multiple numbers submits to the correct WABA;
  // fall back to the tenant's connection (deterministic order) for V1 single-
  // connection tenants where connectionId may be null.
  const connections = await withServiceRole(async (tx) =>
    tx
      .select({
        id: schema.whatsappConnections.id,
        wabaId: schema.whatsappConnections.wabaId,
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
      })
      .from(schema.whatsappConnections)
      .where(
        and(
          eq(schema.whatsappConnections.tenantId, tenantId),
          template.connectionId
            ? eq(schema.whatsappConnections.id, template.connectionId)
            : undefined
        )
      )
      .orderBy(schema.whatsappConnections.createdAt)
      .limit(1)
  );

  const connection = connections[0];
  if (!connection) {
    throw new TemplateValidationError(
      'Nenhuma conexão WhatsApp ativa encontrada. Conecte um número antes de enviar templates.'
    );
  }

  const provider = new MetaCloudProvider({
    phoneNumberId: connection.phoneNumberId,
    wabaId: connection.wabaId,
    accessTokenEncrypted: connection.accessTokenEncrypted,
    accessTokenIv: connection.accessTokenIv,
  });

  const payload: SubmitTemplatePayload = {
    name: template.nome,
    category: mapCategoria(template.categoria),
    language: template.idioma,
    components: buildMetaComponents(
      template.componentes as unknown as TemplateComponentes,
      (template.variaveis ?? []) as unknown as TemplateVariavel[]
    ),
  };

  // CRITICAL: only update status if Meta call succeeds
  const { metaTemplateId } = await provider.submitTemplate(connection.wabaId, payload);

  const [updated] = await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.templates)
      .set({ status: 'pendente', metaTemplateId, updatedAt: new Date() })
      .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
      .returning()
  );

  return updated as unknown as TemplateRow;
}
