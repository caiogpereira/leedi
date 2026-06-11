import { withTenant, schema, sql, and, eq, gte, lte } from '@leedi/db';

export const ESTIMATED_COST_PER_CONVERSATION_BRL = 0.10;

export interface TenantSalesMetrics {
  conversas_iniciadas: number;
  taxa_resposta: number | null;
  conversoes: number;
  valor_total: number;
  ticket_medio: number | null;
  roi_estimado: number | null;
}

interface RawMetrics {
  conversas_iniciadas: number;
  windows_with_reply: number;
  conversoes: number;
  valor_total: number;
}

export function computeSalesMetrics(raw: RawMetrics): TenantSalesMetrics {
  const { conversas_iniciadas, windows_with_reply, conversoes, valor_total } = raw;

  const taxa_resposta =
    conversas_iniciadas > 0 ? windows_with_reply / conversas_iniciadas : null;

  const ticket_medio = conversoes > 0 ? valor_total / conversoes : null;

  const roi_estimado =
    conversas_iniciadas > 0
      ? valor_total / (conversas_iniciadas * ESTIMATED_COST_PER_CONVERSATION_BRL)
      : null;

  return {
    conversas_iniciadas,
    taxa_resposta,
    conversoes,
    valor_total,
    ticket_medio,
    roi_estimado,
  };
}

export async function getTenantSalesMetrics(
  tenantId: string,
  from: Date,
  to: Date
): Promise<TenantSalesMetrics> {
  return withTenant(tenantId, async (tx) => {
    // conversas_iniciadas: billable windows in period
    const [windowsRow] = await tx
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(schema.conversationWindows)
      .where(
        and(
          eq(schema.conversationWindows.billable, true),
          gte(schema.conversationWindows.createdAt, from),
          lte(schema.conversationWindows.createdAt, to)
        )
      );
    const conversas_iniciadas = windowsRow?.count ?? 0;

    // taxa_resposta: windows where a lead message exists after an outbound message
    // Uses EXISTS subquery to avoid expensive cross-joins on partitioned messages table
    const taxaRows = await tx.execute(sql`
      SELECT
        cast(count(distinct case when exists (
          select 1 from messages m_lead
          where m_lead.conversation_window_id = cw.id
            and m_lead.autor = 'lead'
            and m_lead.created_at > (
              select min(m_out.created_at) from messages m_out
              where m_out.conversation_window_id = cw.id
                and m_out.direction = 'outbound'
            )
        ) then cw.id end) as int) as windows_with_reply
      from conversation_windows cw
      where cw.billable = true
        and cw.created_at >= ${from}
        and cw.created_at <= ${to}
    `);
    const taxaRow = (taxaRows as unknown as Array<{ windows_with_reply: unknown }>)[0];
    const windows_with_reply = Number(taxaRow?.windows_with_reply ?? 0);

    // conversoes + valor_total from gateway_events
    // value field from HotmartNormalizer, null-safe SUM (AC#7)
    const [eventsRow] = await tx
      .select({
        conversoes: sql<number>`cast(count(*) as int)`,
        valor_total: sql<number>`coalesce(sum(case when (payload_normalizado->>'value') ~ '^-?[0-9]+(\\.[0-9]+)?$' then (payload_normalizado->>'value')::numeric end), 0)`,
      })
      .from(schema.gatewayEvents)
      .where(
        and(
          eq(schema.gatewayEvents.eventoCanonical, 'compra_aprovada'),
          gte(schema.gatewayEvents.createdAt, from),
          lte(schema.gatewayEvents.createdAt, to)
        )
      );
    const conversoes = eventsRow?.conversoes ?? 0;
    const valor_total = Number(eventsRow?.valor_total ?? 0);

    return computeSalesMetrics({
      conversas_iniciadas,
      windows_with_reply,
      conversoes,
      valor_total,
    });
  });
}
