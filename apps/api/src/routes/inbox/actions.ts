import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { withTenant, schema, eq, and } from '@leedi/db';
import { MetaCloudProvider } from '@leedi/connection';
import {
  pauseThreadByWindowId,
  resumeThreadByWindowId,
  closeThreadByWindowId,
} from '@leedi/agent-memory';

// Meta re-engagement / 24h-window error codes. The adapter surfaces the Meta error code in
// the thrown message (e.g. "Meta API error: 400 (131047)"); match on the code, not loose
// substrings like "24"/"window" which misclassify unrelated failures.
//  - 131047: Re-engagement message (more than 24h since the user's last message)
//  - 131026: Message undeliverable (commonly the closed 24h window)
function is24hWindowError(message: string): boolean {
  return /\b131047\b/.test(message) || /\b131026\b/.test(message);
}

export function createInboxActionsRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // PATCH /api/tenants/:tenantId/inbox/:windowId/assign
  // body: { action: 'takeover' | 'return_to_bot' | 'resolve' }
  router.patch('/:windowId/assign', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const userId = c.get('userId');
    const windowId = c.req.param('windowId') ?? '';
    const body = await c.req.json().catch(() => null) as { action?: string } | null;

    if (!body?.action || !['takeover', 'return_to_bot', 'resolve'].includes(body.action)) {
      return c.json({ error: 'action deve ser takeover, return_to_bot ou resolve.' }, 400);
    }

    const action = body.action as 'takeover' | 'return_to_bot' | 'resolve';

    const updated = await withTenant(tenantId, async (tx) => {
      const [assignment] = await tx
        .select({
          id: schema.inboxAssignments.id,
          status: schema.inboxAssignments.status,
          assignedTo: schema.inboxAssignments.assignedTo,
        })
        .from(schema.inboxAssignments)
        .where(eq(schema.inboxAssignments.conversationWindowId, windowId))
        .limit(1);

      if (!assignment) {
        return null;
      }

      if (action === 'takeover') {
        // Guard against stealing an active conversation or reopening a resolved one.
        // (Residual select-then-update race is closed by the deferred UNIQUE constraint.)
        if (assignment.status === 'resolvido') {
          return { error: 'Conversa já foi resolvida.' as const };
        }
        if (
          assignment.status === 'em_atendimento' &&
          assignment.assignedTo &&
          assignment.assignedTo !== userId
        ) {
          return { error: 'Conversa já está em atendimento por outro operador.' as const };
        }
        await tx
          .update(schema.inboxAssignments)
          .set({ status: 'em_atendimento', assignedTo: userId, updatedAt: new Date() })
          .where(eq(schema.inboxAssignments.id, assignment.id));
        return { status: 'em_atendimento' };
      }

      if (action === 'return_to_bot') {
        await tx
          .update(schema.inboxAssignments)
          .set({ status: 'bot', assignedTo: null, updatedAt: new Date() })
          .where(eq(schema.inboxAssignments.id, assignment.id));
        return { status: 'bot' };
      }

      // resolve
      await tx
        .update(schema.inboxAssignments)
        .set({ status: 'resolvido', updatedAt: new Date() })
        .where(eq(schema.inboxAssignments.id, assignment.id));
      return { status: 'resolvido' };
    });

    if (!updated) {
      return c.json({ error: 'Conversa não encontrada.' }, 404);
    }
    if ('error' in updated) {
      return c.json({ error: updated.error }, 409);
    }

    // Manage agent thread lifecycle (no-op if thread doesn't exist yet)
    try {
      if (action === 'takeover') {
        await pauseThreadByWindowId(tenantId, windowId);
      } else if (action === 'return_to_bot') {
        await resumeThreadByWindowId(tenantId, windowId);
      } else if (action === 'resolve') {
        await closeThreadByWindowId(tenantId, windowId);
      }
    } catch {
      // Thread management failure must not fail the response
    }

    return c.json({ status: updated.status });
  });

  // POST /api/tenants/:tenantId/inbox/:windowId/reply
  // body: { content: string }
  router.post('/:windowId/reply', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const userId = c.get('userId');
    const windowId = c.req.param('windowId') ?? '';
    const body = await c.req.json().catch(() => null) as { content?: string } | null;

    if (!body?.content?.trim()) {
      return c.json({ error: 'content não pode ser vazio.' }, 400);
    }
    const content = body.content.trim();

    // Validate assignment status and get lead + connection
    const ctx = await withTenant(tenantId, async (tx) => {
      const [assignment] = await tx
        .select({
          status: schema.inboxAssignments.status,
          assignedTo: schema.inboxAssignments.assignedTo,
        })
        .from(schema.inboxAssignments)
        .where(eq(schema.inboxAssignments.conversationWindowId, windowId))
        .limit(1);

      if (!assignment) return null;
      if (assignment.status !== 'em_atendimento') {
        return { error: 'Conversa não está em atendimento humano.' as const };
      }
      // Server-side assignee check: only the assigned operator (or future owner/admin gate)
      // may send replies. Client-side composer visibility is not sufficient.
      if (assignment.assignedTo !== userId) {
        return { error: 'Somente o operador responsável pode enviar mensagens.' as const };
      }

      const [window] = await tx
        .select({
          leadId: schema.conversationWindows.leadId,
          connectionId: schema.conversationWindows.connectionId,
        })
        .from(schema.conversationWindows)
        .where(
          and(
            eq(schema.conversationWindows.id, windowId),
            eq(schema.conversationWindows.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!window) return null;

      const [lead] = await tx
        .select({ telefone: schema.leads.telefone })
        .from(schema.leads)
        .where(and(eq(schema.leads.id, window.leadId), eq(schema.leads.tenantId, tenantId)))
        .limit(1);

      // Reply from the SAME WhatsApp number the conversation runs on (window.connectionId),
      // not an arbitrary tenant connection — multi-number tenants would otherwise reply from
      // the wrong number and can trip a 24h window on a number the lead never messaged.
      const [connection] = await tx
        .select({
          phoneNumberId: schema.whatsappConnections.phoneNumberId,
          wabaId: schema.whatsappConnections.wabaId,
          accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
          accessTokenIv: schema.whatsappConnections.accessTokenIv,
        })
        .from(schema.whatsappConnections)
        .where(
          and(
            eq(schema.whatsappConnections.id, window.connectionId),
            eq(schema.whatsappConnections.tenantId, tenantId)
          )
        )
        .limit(1);

      return { leadId: window.leadId, leadPhone: lead?.telefone ?? null, connection: connection ?? null };
    });

    if (!ctx) {
      return c.json({ error: 'Conversa não encontrada.' }, 404);
    }
    if ('error' in ctx) {
      return c.json({ error: ctx.error }, 409);
    }
    if (!ctx.leadPhone || !ctx.connection) {
      return c.json({ error: 'Configuração de WhatsApp não encontrada.' }, 422);
    }

    // Send via Meta Cloud API. A failed send is NOT persisted — AC#3 saves a message only
    // when it is actually delivered, and the client reverts its optimistic bubble on error.
    let metaMessageId: string;
    try {
      const sender = new MetaCloudProvider(ctx.connection);
      const res = await sender.sendText(ctx.leadPhone, content);
      metaMessageId = res.messageId;
    } catch (err) {
      const sendError = err instanceof Error ? err.message : 'Erro ao enviar mensagem.';
      if (is24hWindowError(sendError)) {
        return c.json(
          {
            error:
              'Não foi possível enviar: a janela de 24h está fechada. Use um template aprovado para reabrir.',
          },
          422
        );
      }
      return c.json({ error: sendError }, 502);
    }

    // Persist to messages table only after a successful send.
    await withTenant(tenantId, async (tx) => {
      await tx.insert(schema.messages).values({
        tenantId,
        conversationWindowId: windowId,
        leadId: ctx.leadId,
        direction: 'outbound',
        autor: 'humano',
        tipo: 'texto',
        content,
        metaMessageId,
        status: 'enviado',
      });
    });

    return c.json({ ok: true, metaMessageId });
  });

  return router;
}
