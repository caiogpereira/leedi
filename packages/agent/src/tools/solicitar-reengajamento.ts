// Tool: solicitar_reengajamento — configurable action. Requests a re-engagement
// dispatch for a lead that has gone cold (outside the 24h window). Finds an active
// dispatch_rule for the tenant and enqueues a recovery target via QStash.
//
// schema-vs-ctx boundary: Claude supplies { motivo }. tenantId/leadId come from ctx.

import { withTenant, schema, eq, and } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import type { ToolContext } from './types.js';

export interface SolicitarReengajamentoInput {
  motivo: string;
}

function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function solicitarReengajamento(
  _input: SolicitarReengajamentoInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId'>
): Promise<string> {
  // Find any active dispatch rule for the tenant.
  const rules = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({ id: schema.dispatchRules.id })
      .from(schema.dispatchRules)
      .where(
        and(
          eq(schema.dispatchRules.tenantId, ctx.tenantId),
          eq(schema.dispatchRules.ativo, true)
        )
      )
      .limit(1)
  );

  const rule = rules[0];
  if (!rule) {
    return 'Nenhuma regra de reengajamento ativa configurada. Configure um template e uma regra em Disparos → Regras automáticas.';
  }

  const qstash = new Client({ token: env.QSTASH_TOKEN });
  await qstash.publishJSON({
    url: `${apiBaseUrl()}/api/internal/gateway/dispatch-recovery-target`,
    delay: 0,
    body: { leadId: ctx.leadId, dispatchRuleId: rule.id, tenantId: ctx.tenantId },
  });

  return 'Reengajamento solicitado: uma mensagem de reativação será enviada em breve.';
}
