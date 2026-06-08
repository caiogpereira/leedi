import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { withTenant, schema, eq, and, desc, sql, isNull } from '@leedi/db';

export type InboxStatus = 'bot' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';
export type LeadTemperatura = 'frio' | 'morno' | 'quente';

export interface ConversationListItem {
  conversationWindowId: string;
  leadId: string;
  leadName: string | null;
  leadPhone: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  status: InboxStatus;
  temperatura: LeadTemperatura | null;
  assignedTo: string | null;
}

export interface InboxListResponse {
  items: ConversationListItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as {
      createdAt: string;
      id: string;
    };
  } catch {
    return null;
  }
}

export function createInboxRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/inbox
  // Query params: status?, temperatura?, cursor?, limit?
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const statusFilter = c.req.query('status') as InboxStatus | undefined;
    const temperaturaFilter = c.req.query('temperatura') as LeadTemperatura | undefined;
    const cursorParam = c.req.query('cursor');
    const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT), 100);

    const cursor = cursorParam ? decodeCursor(cursorParam) : null;

    const rows = await withTenant(tenantId, async (tx) => {
      // Inline last-message subquery as a correlated SQL expression (partitioned table).
      const lastMsgContent = sql<string | null>`(
        SELECT content FROM messages
        WHERE conversation_window_id = ${schema.conversationWindows.id}
          AND tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT 1
      )`;

      const lastMsgAt = sql<Date | null>`(
        SELECT created_at FROM messages
        WHERE conversation_window_id = ${schema.conversationWindows.id}
          AND tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT 1
      )`;

      // Effective sort key: last message time, falling back to window creation time for
      // conversations that have no messages yet. This satisfies AC#5 — a conversation that
      // gets a new message (e.g., lead writes back or agent transfers) moves to the top.
      const effectiveAt = sql<Date>`COALESCE(${lastMsgAt}, ${schema.conversationWindows.createdAt})`;

      const conditions = [
        eq(schema.conversationWindows.tenantId, tenantId),
        isNull(schema.conversationWindows.endedAt),
        ...(statusFilter ? [eq(schema.inboxAssignments.status, statusFilter)] : []),
        ...(temperaturaFilter ? [eq(schema.leads.temperatura, temperaturaFilter)] : []),
        ...(cursor
          ? [
              sql`COALESCE(${lastMsgAt}, ${schema.conversationWindows.createdAt}) < ${cursor.createdAt}::timestamptz OR (COALESCE(${lastMsgAt}, ${schema.conversationWindows.createdAt}) = ${cursor.createdAt}::timestamptz AND ${schema.conversationWindows.id} < ${cursor.id}::uuid)`,
            ]
          : []),
      ];

      return tx
        .select({
          conversationWindowId: schema.conversationWindows.id,
          leadId: schema.conversationWindows.leadId,
          leadName: schema.leads.nome,
          leadPhone: schema.leads.telefone,
          lastMessagePreview: lastMsgContent,
          lastMessageAt: lastMsgAt,
          effectiveSortAt: effectiveAt,
          windowCreatedAt: schema.conversationWindows.createdAt,
          status: schema.inboxAssignments.status,
          temperatura: schema.leads.temperatura,
          assignedTo: schema.inboxAssignments.assignedTo,
        })
        .from(schema.conversationWindows)
        .innerJoin(schema.leads, eq(schema.leads.id, schema.conversationWindows.leadId))
        .leftJoin(
          schema.inboxAssignments,
          eq(schema.inboxAssignments.conversationWindowId, schema.conversationWindows.id)
        )
        .where(and(...conditions))
        .orderBy(sql`COALESCE(${lastMsgAt}, ${schema.conversationWindows.createdAt}) DESC`, desc(schema.conversationWindows.id))
        .limit(limit + 1);
    });

    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;
    const last = pageItems[pageItems.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.effectiveSortAt, last.conversationWindowId) : null;

    const response: InboxListResponse = {
      items: pageItems.map((row) => ({
        conversationWindowId: row.conversationWindowId,
        leadId: row.leadId,
        leadName: row.leadName ?? null,
        leadPhone: row.leadPhone,
        lastMessagePreview: row.lastMessagePreview
          ? String(row.lastMessagePreview).slice(0, 60)
          : null,
        lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt).toISOString() : null,
        status: (row.status ?? 'bot') as InboxStatus,
        temperatura: (row.temperatura ?? null) as LeadTemperatura | null,
        assignedTo: row.assignedTo ?? null,
      })),
      nextCursor,
    };

    return c.json(response);
  });

  // GET /api/tenants/:tenantId/inbox/:windowId
  // Returns conversation detail: window + assignment + lead + paginated messages
  router.get('/:windowId', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const windowId = c.req.param('windowId') ?? '';
    const cursorParam = c.req.query('cursor');
    const MSG_LIMIT = 50;

    const msgCursor = cursorParam
      ? (() => {
          try {
            return JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf-8')) as {
              createdAt: string;
              id: string;
            };
          } catch {
            return null;
          }
        })()
      : null;

    const detail = await withTenant(tenantId, async (tx) => {
      const [window] = await tx
        .select({
          id: schema.conversationWindows.id,
          leadId: schema.conversationWindows.leadId,
          startedAt: schema.conversationWindows.startedAt,
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

      const [assignment] = await tx
        .select({
          id: schema.inboxAssignments.id,
          status: schema.inboxAssignments.status,
          assignedTo: schema.inboxAssignments.assignedTo,
          resumoHandoff: schema.inboxAssignments.resumoHandoff,
          motivoHandoff: schema.inboxAssignments.motivoHandoff,
        })
        .from(schema.inboxAssignments)
        .where(eq(schema.inboxAssignments.conversationWindowId, windowId))
        .limit(1);

      const [lead] = await tx
        .select({
          id: schema.leads.id,
          nome: schema.leads.nome,
          telefone: schema.leads.telefone,
          temperatura: schema.leads.temperatura,
        })
        .from(schema.leads)
        .where(and(eq(schema.leads.id, window.leadId), eq(schema.leads.tenantId, tenantId)))
        .limit(1);

      const msgConditions = [
        eq(schema.messages.conversationWindowId, windowId),
        eq(schema.messages.tenantId, tenantId),
        ...(msgCursor
          ? [
              sql`(${schema.messages.createdAt}, ${schema.messages.id}) < (${msgCursor.createdAt}::timestamptz, ${msgCursor.id}::uuid)`,
            ]
          : []),
      ];

      const msgs = await tx
        .select({
          id: schema.messages.id,
          content: schema.messages.content,
          autor: schema.messages.autor,
          tipo: schema.messages.tipo,
          transcricao: schema.messages.transcricao,
          direction: schema.messages.direction,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .where(and(...msgConditions))
        .orderBy(desc(schema.messages.createdAt))
        .limit(MSG_LIMIT + 1);

      return { window, assignment: assignment ?? null, lead: lead ?? null, msgs };
    });

    if (!detail) {
      return c.json({ error: 'Conversa não encontrada.' }, 404);
    }

    const { window, assignment, lead, msgs } = detail;
    const hasMoreMsgs = msgs.length > MSG_LIMIT;
    const pageMsgs = hasMoreMsgs ? msgs.slice(0, MSG_LIMIT) : msgs;
    const oldestMsg = pageMsgs[pageMsgs.length - 1];
    const nextMsgCursor =
      hasMoreMsgs && oldestMsg
        ? Buffer.from(
            JSON.stringify({ createdAt: oldestMsg.createdAt.toISOString(), id: oldestMsg.id })
          ).toString('base64')
        : null;

    return c.json({
      window: {
        id: window.id,
        leadId: window.leadId,
        startedAt: window.startedAt.toISOString(),
      },
      assignment: assignment
        ? {
            id: assignment.id,
            status: assignment.status,
            assignedTo: assignment.assignedTo,
            resumoHandoff: assignment.resumoHandoff ?? null,
            motivoHandoff: assignment.motivoHandoff ?? null,
          }
        : null,
      lead: lead
        ? {
            id: lead.id,
            nome: lead.nome ?? null,
            telefone: lead.telefone,
            temperatura: lead.temperatura ?? null,
          }
        : null,
      messages: pageMsgs.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        autor: m.autor ?? null,
        tipo: m.tipo ?? null,
        transcricao: m.transcricao ?? null,
        direction: m.direction,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: nextMsgCursor,
    });
  });

  return router;
}
