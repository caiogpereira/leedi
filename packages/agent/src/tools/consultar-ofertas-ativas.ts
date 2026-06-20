// Tool: consultar_ofertas_ativas — campaign-aware product lookup.
//
// Reads the active campaign (status='ativa') for the tenant and returns the
// effective product for the current phase, along with campaign context that
// guides the agent's sales behavior.
//
// Story 10.3 rewrite: queries campaigns table directly (live DB state, no cache)
// so that phase transitions take effect immediately on the next conversation turn.
//
// schema-vs-ctx boundary: Claude supplies NOTHING. tenantId and optional
// campaignId (playground override) come from ToolContext.

import { withTenant, schema, eq, and } from '@leedi/db';
import type { ToolContext } from './types.js';

export type CampaignTipo = 'lancamento' | 'downsell' | 'perpetuo';
export type CampaignFase = 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';

export interface EffectiveProduto {
  id: string;
  nome: string;
  preco: string;
  precoParcelado: string | null;
  parcelas: number | null;
  linkCheckout: string;
  tipo: string;
  argumentos: string[];
  diferenciais: string[];
  provasSociais: string[];
  garantia: string | null;
  bonus: string[];
  gatewayProductId: string | null;
}

export interface ActiveCampaignContext {
  id: string;
  nome: string;
  tipo: CampaignTipo;
  fase: CampaignFase;
  urgencia?: string;
  mensagens_chave?: string[];
  instrucao_comercial: string;
}

export interface OfertasAtivasResult {
  produtos: EffectiveProduto[];
  campanha: ActiveCampaignContext | null;
}

function getInstrucaoComercial(tipo: CampaignTipo, fase: CampaignFase): string {
  if (tipo === 'perpetuo') {
    return 'Produto disponível para venda contínua. Ofereça quando o lead demonstrar interesse, sem urgência artificial.';
  }
  switch (fase) {
    case 'aquecimento':
      return 'Fase de aquecimento — mantenha o lead engajado. Não force a venda. O carrinho ainda não está aberto.';
    case 'carrinho_aberto':
      return 'Carrinho aberto. Ofereça ativamente. Use a urgência configurada.';
    case 'downsell':
      return 'Fase de downsell. Ofereça o produto alternativo para quem não comprou o principal.';
    default:
      return 'Ofereça quando relevante.';
  }
}

function toEffectiveProduto(product: Record<string, unknown>): EffectiveProduto {
  return {
    id: product.id as string,
    nome: product.nome as string,
    preco: product.preco as string,
    precoParcelado: product.precoParcelado as string | null,
    parcelas: product.parcelas as number | null,
    linkCheckout: product.linkCheckout as string,
    tipo: product.tipo as string,
    argumentos: (product.argumentos as string[]) ?? [],
    diferenciais: (product.diferenciais as string[]) ?? [],
    provasSociais: (product.provasSociais as string[]) ?? [],
    garantia: product.garantia as string | null,
    bonus: (product.bonus as string[]) ?? [],
    gatewayProductId: product.gatewayProductId as string | null,
  };
}

/**
 * Returns the active campaign's effective product and sales context. When no
 * campaign is running, returns the full active catalog (passive selling) with
 * campanha: null. Never throws on empty state.
 */
export async function consultarOfertasAtivas(
  ctx: Pick<ToolContext, 'tenantId' | 'campaignId'>
): Promise<OfertasAtivasResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    // Find the active campaign: either the explicit playground override or the
    // globally active one (the partial unique index guarantees at most one).
    const campaignQuery = ctx.campaignId
      ? tx
          .select()
          .from(schema.campaigns)
          .where(
            and(
              eq(schema.campaigns.tenantId, ctx.tenantId),
              eq(schema.campaigns.id, ctx.campaignId)
            )
          )
          .limit(1)
      : tx
          .select()
          .from(schema.campaigns)
          .where(
            and(
              eq(schema.campaigns.tenantId, ctx.tenantId),
              eq(schema.campaigns.status, 'ativa')
            )
          )
          .limit(1);

    const [campaign] = await campaignQuery;

    if (!campaign) {
      // Venda passiva: sem campanha ativa, o agente enxerga TODO o catálogo
      // ativo e escolhe o produto que atende ao lead percorrendo o funil.
      const activeProducts = await tx
        .select()
        .from(schema.products)
        .where(
          and(
            eq(schema.products.tenantId, ctx.tenantId),
            eq(schema.products.ativo, true)
          )
        );
      return {
        produtos: activeProducts.map((p) => toEffectiveProduto(p as Record<string, unknown>)),
        campanha: null,
      };
    }

    const tipo = campaign.tipo as CampaignTipo;
    const fase = campaign.fase as CampaignFase;
    const config = (campaign.config ?? {}) as Record<string, unknown>;

    // Determine effective product ID: downsell phase may override the main product
    let effectiveProdutoId: string | null = campaign.produtoId as string | null;
    if (fase === 'downsell') {
      const downsellCfg = config.downsell as { produto_id?: string } | undefined;
      if (downsellCfg?.produto_id) {
        effectiveProdutoId = downsellCfg.produto_id;
      }
    }

    if (!effectiveProdutoId) {
      // Campaign exists but has no product configured — return context without product
      const instrucao_comercial = getInstrucaoComercial(tipo, fase);
      return {
        produtos: [],
        campanha: {
          id: campaign.id as string,
          nome: campaign.nome as string,
          tipo,
          fase,
          instrucao_comercial,
        },
      };
    }

    // Fetch the effective product details
    const [product] = await tx
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, ctx.tenantId),
          eq(schema.products.id, effectiveProdutoId),
          eq(schema.products.ativo, true)
        )
      )
      .limit(1);

    // Extract phase config for urgency + key messages
    const phaseCfg = config[fase === 'aquecimento' ? 'aquecimento' : fase === 'carrinho_aberto' ? 'carrinho_aberto' : 'downsell'] as
      | { urgencia?: string; mensagens_chave?: string[] }
      | undefined;

    const instrucao_comercial = getInstrucaoComercial(tipo, fase);

    const campanha: ActiveCampaignContext = {
      id: campaign.id as string,
      nome: campaign.nome as string,
      tipo,
      fase,
      instrucao_comercial,
      ...(phaseCfg?.urgencia ? { urgencia: phaseCfg.urgencia } : {}),
      ...(phaseCfg?.mensagens_chave?.length ? { mensagens_chave: phaseCfg.mensagens_chave } : {}),
    };

    if (!product) {
      return { produtos: [], campanha };
    }

    const effectiveProduto = toEffectiveProduto(product as Record<string, unknown>);

    return { produtos: [effectiveProduto], campanha };
  });
}
