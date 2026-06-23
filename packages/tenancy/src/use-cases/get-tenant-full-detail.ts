import { withServiceRole, sql } from '@leedi/db';

export interface TenantFullDetail {
  id: string;
  name: string;
  slug: string;
  /** English enum: 'active' | 'trial' | 'blocked' | 'cancelled' */
  status: string;
  plan: string;
  createdAt: Date;
  /** From `tenants.config->>'billing_status'` (e.g. 'pendente_configuracao'). */
  billingStatus: string | null;
  ownerEmail: string | null;
  subscription: {
    plano: string;
    valor: number;
    /** PT-BR enum: 'ativa' | 'atrasada' | 'cancelada' | 'trial' */
    status: string;
    /** ISO date (YYYY-MM-DD) or null. */
    proximoVencimento: string | null;
    asaasSubscriptionId: string | null;
  } | null;
  /** Current-month usage counter, or null if no row exists yet this period. */
  usage: {
    periodo: string;
    conversasUsadas: number;
    conversasLimite: number;
    overageConversas: number;
    overageValor: number;
    custoIaUsd: number;
  } | null;
  connection: {
    /** 'conectado' | 'erro' | 'desconectado' */
    status: string;
    /** 'verde' | 'amarelo' | 'vermelho' | null */
    qualityRating: string | null;
  } | null;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetches the full per-tenant detail the super-admin client-detail page needs
 * (identity, owner, active subscription, current-month usage/cost, connection
 * health). Composes the same sources as `listAllTenantsDetailed` /
 * `getOperationalHealth` for a single tenant. Returns `null` when the tenant
 * does not exist.
 *
 * SECURITY: reads across tenants via `withServiceRole` (RLS bypass). ONLY call
 * behind the workspace-admin guard + a `requireSuperAdmin()` re-check. Never
 * expose on a tenant-facing route (per FR108, `custo_ia_usd` is super-admin only).
 *
 * Subscription/usage/connection are returned as nested objects (LATERAL joins)
 * so a tenant with multiple subscription/usage rows can't fan out the base row.
 */
export async function getTenantFullDetail(tenantId: string): Promise<TenantFullDetail | null> {
  return withServiceRole(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.plan,
        t.created_at,
        t.config->>'billing_status' AS billing_status,
        owner.email AS owner_email,
        s.plano AS sub_plano,
        s.valor AS sub_valor,
        s.status AS sub_status,
        s.proximo_vencimento AS sub_proximo_vencimento,
        s.asaas_subscription_id AS sub_asaas_id,
        uc.periodo AS uc_periodo,
        uc.conversas_usadas,
        uc.conversas_limite,
        uc.overage_conversas,
        uc.overage_valor,
        uc.custo_ia_usd,
        c.status AS conn_status,
        c.quality_rating AS conn_quality
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT u.email
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = t.id AND m.role = 'owner'
        ORDER BY m.created_at ASC
        LIMIT 1
      ) owner ON true
      LEFT JOIN LATERAL (
        SELECT plano, valor, status, proximo_vencimento, asaas_subscription_id
        FROM subscriptions
        WHERE tenant_id = t.id AND status != 'cancelada'
        ORDER BY created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN usage_counters uc
        ON uc.tenant_id = t.id
        AND uc.periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      LEFT JOIN whatsapp_connections c
        ON c.tenant_id = t.id
      WHERE t.id = ${tenantId}
      LIMIT 1
    `)) as Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      plan: string;
      created_at: unknown;
      billing_status: string | null;
      owner_email: string | null;
      sub_plano: string | null;
      sub_valor: unknown;
      sub_status: string | null;
      sub_proximo_vencimento: unknown;
      sub_asaas_id: string | null;
      uc_periodo: string | null;
      conversas_usadas: unknown;
      conversas_limite: unknown;
      overage_conversas: unknown;
      overage_valor: unknown;
      custo_ia_usd: unknown;
      conn_status: string | null;
      conn_quality: string | null;
    }>;

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan: row.plan,
      createdAt: new Date(row.created_at as string),
      billingStatus: row.billing_status ?? null,
      ownerEmail: row.owner_email ?? null,
      subscription: row.sub_plano
        ? {
            plano: row.sub_plano,
            valor: toNumber(row.sub_valor),
            status: row.sub_status ?? 'ativa',
            proximoVencimento: row.sub_proximo_vencimento
              ? String(row.sub_proximo_vencimento)
              : null,
            asaasSubscriptionId: row.sub_asaas_id ?? null,
          }
        : null,
      usage: row.uc_periodo
        ? {
            periodo: row.uc_periodo,
            conversasUsadas: toNumber(row.conversas_usadas),
            conversasLimite: toNumber(row.conversas_limite),
            overageConversas: toNumber(row.overage_conversas),
            overageValor: toNumber(row.overage_valor),
            custoIaUsd: toNumber(row.custo_ia_usd),
          }
        : null,
      connection: row.conn_status
        ? {
            status: row.conn_status,
            qualityRating: row.conn_quality ?? null,
          }
        : null,
    };
  });
}
