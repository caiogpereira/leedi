import { withServiceRole, schema, eq } from '@leedi/db';
import { captureException } from '@leedi/observability';
import { sendNotificationToTenantRole } from '@leedi/notification';

interface TemplateStatusUpdateInput {
  metaTemplateId: string; // already converted to string from Meta's numeric ID
  newStatus: string;
  reason: string | undefined;
  wabaId: string;
}

type DbTemplateStatus = 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' | 'pausado';

function mapMetaStatus(metaStatus: string): DbTemplateStatus | null {
  const map: Record<string, DbTemplateStatus> = {
    APPROVED: 'aprovado',
    REJECTED: 'rejeitado',
    PAUSED: 'pausado',
    DISABLED: 'rejeitado',
  };
  return map[metaStatus.toUpperCase()] ?? null;
}

export async function handleTemplateStatusUpdate(
  input: TemplateStatusUpdateInput
): Promise<void> {
  const newDbStatus = mapMetaStatus(input.newStatus);
  if (!newDbStatus) {
    console.warn(
      `[template-status-update] Unknown Meta status: ${input.newStatus} for template ${input.metaTemplateId}`
    );
    return;
  }

  const existing = await withServiceRole(async (tx) =>
    tx
      .select({
        id: schema.templates.id,
        tenantId: schema.templates.tenantId,
        nome: schema.templates.nome,
      })
      .from(schema.templates)
      .where(eq(schema.templates.metaTemplateId, input.metaTemplateId))
      .limit(1)
  );

  const template = existing[0];
  if (!template) {
    // AC#4: log warning but do not throw — Meta retries on non-2xx
    console.warn(
      `[template-status-update] No template found for meta_template_id: ${input.metaTemplateId}`
    );
    return;
  }

  await withServiceRole(async (tx) =>
    tx
      .update(schema.templates)
      .set({
        status: newDbStatus,
        motivoRejeicao: newDbStatus === 'rejeitado' ? (input.reason ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.templates.id, template.id))
  );

  // Notification placeholder — wire to Epic 18 notification service when available
  try {
    await notifyTemplateStatusChange(template.tenantId, template.nome, newDbStatus, input.reason);
  } catch (err) {
    captureException(err);
  }
}

async function notifyTemplateStatusChange(
  tenantId: string,
  templateNome: string,
  status: DbTemplateStatus,
  reason?: string
): Promise<void> {
  // AC#2 — approval notification
  if (status === 'aprovado') {
    await sendNotificationToTenantRole({
      tenantId,
      roles: ['owner', 'admin', 'operator'],
      tipo: 'template_aprovado',
      titulo: `Template "${templateNome}" foi aprovado!`,
      corpo: 'Agora você pode usá-lo em disparos.',
    });
    return;
  }

  // AC#3 — rejection notification (copy per spec)
  if (status === 'rejeitado') {
    await sendNotificationToTenantRole({
      tenantId,
      roles: ['owner', 'admin', 'operator'],
      tipo: 'template_rejeitado',
      titulo: `Template "${templateNome}" foi rejeitado pela Meta`,
      corpo: `Motivo: ${reason ?? 'não informado'}`,
    });
  }
}
