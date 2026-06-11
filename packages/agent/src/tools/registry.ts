// Tool registry — the single integration point for Stories 7.3–7.6.
// Defines the 10 tool JSON Schemas (Anthropic `tools` format), the toggle-aware
// tool-list builder, and the routeToolCall dispatcher. Tool implementations land
// in their own stories and wire in HERE — there is no per-story router.
//
// CRITICAL — schema vs. ctx boundary: the input_schema exposes ONLY the
// parameters Claude supplies. Identity/transport fields (tenantId, leadId,
// leadPhone, connectionId, threadId, conversationWindowId) come from ToolContext,
// never from the schema Claude sees. See ./types.ts.

import {
  ALWAYS_ON_TOOLS,
  CONFIGURABLE_TOOLS,
  type ToolName,
} from '../utils/resolve-enabled-tools.js';
import type { ToolContext, ToolDefinition, ToolsHabilitadas } from './types.js';
import { buscarHistoricoLead } from './buscar-historico-lead.js';
import { consultarOfertasAtivas } from './consultar-ofertas-ativas.js';
import { verificarElegibilidade } from './verificar-eligibilidade.js';
import { enviarLinkCheckout } from './enviar-link-checkout.js';
import { marcarIntencaoCompra } from './marcar-intencao-compra.js';
import { adicionarTag } from './adicionar-tag.js';
import { consultarBaseConhecimento } from './consultar-base-conhecimento.js';
import { transferirHumano } from './transferir-humano.js';
import { agendarFollowup } from './agendar-followup.js';
import { solicitarReengajamento } from './solicitar-reengajamento.js';

// ─── Tool schemas (model-supplied params only) ────────────────────────────────

const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  // ── Always-on ──────────────────────────────────────────────────────────────
  buscar_historico_lead: {
    name: 'buscar_historico_lead',
    description:
      'Consulta o histórico e a qualificação do lead atual (interações passadas, tags, temperatura). Use quando precisar de contexto sobre quem é o lead antes de responder.',
    input_schema: { type: 'object', properties: {} },
  },
  consultar_ofertas_ativas: {
    name: 'consultar_ofertas_ativas',
    description:
      'Lista as ofertas/produtos ativos disponíveis para venda (nome, preço, link, argumentos, garantias). Use ao apresentar ou comparar ofertas para o lead.',
    input_schema: { type: 'object', properties: {} },
  },
  verificar_elegibilidade: {
    name: 'verificar_elegibilidade',
    description:
      'Verifica se o lead é elegível para uma oferta específica antes de enviar o checkout. Chame antes de enviar_link_checkout.',
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'ID do produto/oferta a verificar a elegibilidade.',
        },
      },
      required: ['productId'],
    },
  },
  enviar_link_checkout: {
    name: 'enviar_link_checkout',
    description:
      'Gera e envia o link de checkout de um produto para o lead concluir a compra. Use quando o lead demonstrar intenção clara de comprar.',
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'ID do produto/oferta para o qual gerar o checkout.',
        },
      },
      required: ['productId'],
    },
  },
  marcar_intencao_compra: {
    name: 'marcar_intencao_compra',
    description:
      'Registra que o lead demonstrou intenção de compra, esquentando sua temperatura para "quente". Use ao detectar sinais fortes de compra. Opcionalmente, informe o produto de interesse.',
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'Opcional: ID do produto/oferta de interesse do lead.',
        },
      },
    },
  },

  // ── Configurable (per-tenant toggles) ────────────────────────────────────────
  consultar_base_conhecimento: {
    name: 'consultar_base_conhecimento',
    description:
      'Busca na base de conhecimento (FAQs e contornos de objeção) a melhor resposta para uma dúvida ou objeção do lead. Para objeções, informe a categoria mais próxima da preocupação do lead (ex.: preco, tempo, confianca).',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['faq', 'objecao'],
          description:
            "Use 'objecao' para contornar uma objeção do lead ou 'faq' para responder a uma dúvida frequente.",
        },
        categoria: {
          type: 'string',
          description:
            "Opcional (apenas para tipo='objecao'): a categoria da objeção do lead (ex.: preco, tempo, confianca). Ignorado para FAQs.",
        },
      },
      required: ['tipo'],
    },
  },
  agendar_followup: {
    name: 'agendar_followup',
    description:
      'Agenda um follow-up automático com o lead para um horário futuro dentro da janela de 24h (ex.: lembrar de retomar a conversa).',
    input_schema: {
      type: 'object',
      properties: {
        agendado_para: {
          type: 'string',
          description:
            'Horário do follow-up em ISO 8601 (ex.: 2026-06-11T15:00:00Z). Deve estar no futuro e dentro da janela de 24h ativa.',
        },
        motivo: {
          type: 'string',
          description: 'Motivo/contexto do follow-up.',
        },
        conteudoSugerido: {
          type: 'string',
          description: 'Opcional: texto sugerido para a mensagem de follow-up.',
        },
      },
      required: ['agendado_para', 'motivo'],
    },
  },
  transferir_humano: {
    name: 'transferir_humano',
    description:
      'Transfere a conversa para um atendente humano quando o lead pede explicitamente ou a situação exige intervenção humana.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description: 'Motivo da transferência para humano.',
        },
        conversationSummary: {
          type: 'string',
          description:
            'Resumo da conversa para o atendente humano: o que o lead quer e as objeções levantadas até aqui.',
        },
      },
      required: ['motivo', 'conversationSummary'],
    },
  },
  adicionar_tag: {
    name: 'adicionar_tag',
    description:
      'Adiciona uma tag de segmentação ao lead (ex.: interesse, perfil, objeção). Forneça o contexto da conversa para que a tag mais apropriada seja classificada automaticamente.',
    input_schema: {
      type: 'object',
      properties: {
        tagText: {
          type: 'string',
          description: 'A tag sugerida para o lead (texto livre, em português).',
        },
        conversationContext: {
          type: 'string',
          description:
            'Opcional: trecho da conversa para refinar a tag mais apropriada.',
        },
      },
      required: ['tagText'],
    },
  },
  solicitar_reengajamento: {
    name: 'solicitar_reengajamento',
    description:
      'Solicita o envio de uma campanha/template de reengajamento para um lead que esfriou (fora da janela de 24h).',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description: 'Motivo do reengajamento.',
        },
      },
      required: ['motivo'],
    },
  },
};

/**
 * Builds the Anthropic `tools` array for a request: every always-on tool plus
 * the configurable tools the tenant has enabled. Order is DETERMINISTIC
 * (always-on first, then configurable in declaration order) so the tool prefix
 * is byte-stable and the prompt cache hits across messages.
 */
export function buildToolList(toolsHabilitadas: ToolsHabilitadas): ToolDefinition[] {
  const tools: ToolDefinition[] = ALWAYS_ON_TOOLS.map((name) => TOOL_DEFINITIONS[name]);
  for (const name of CONFIGURABLE_TOOLS) {
    if (toolsHabilitadas[name] === true) {
      tools.push(TOOL_DEFINITIONS[name]);
    }
  }
  return tools;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/** Result of a not-yet-implemented tool — graceful no-op, never throws. */
const NOT_YET_ENABLED = { scheduled: false, reason: 'feature_not_yet_enabled' } as const;

/** Sandbox stubs for write-side tools (Story 8.1): return simulated results without side-effects. */
const SANDBOX_STUBS: Record<string, (input: Record<string, unknown>) => unknown> = {
  enviar_link_checkout: (input) => ({
    sent: true,
    messageId: 'sandbox-noop',
    sandboxed: true,
    productId: input.productId,
  }),
  marcar_intencao_compra: (input) => ({
    updated: true,
    sandboxed: true,
    productId: input.productId ?? null,
  }),
  adicionar_tag: (input) => ({
    tagged: true,
    tag: String(input.tagText ?? ''),
    sandboxed: true,
  }),
  transferir_humano: () => ({
    transferred: true,
    assignmentId: 'sandbox-noop',
    sandboxed: true,
  }),
  agendar_followup: (input) => ({
    scheduled: true,
    sandboxed: true,
    agendado_para: input.agendado_para ?? null,
  }),
  solicitar_reengajamento: () => ({
    requested: true,
    sandboxed: true,
  }),
};

/** Tools whose real implementation ships in a later story — stubbed gracefully. */
const STUBBED_TOOLS: ReadonlySet<string> = new Set<string>([]);

/**
 * Routes a tool call to its implementation, injecting identity/transport fields
 * from ctx (NOT from Claude). Tools whose implementation isn't shipped yet
 * (agendar_followup, solicitar_reengajamento) return a graceful no-op so the
 * agent loop continues instead of crashing.
 *
 * Stories 7.3–7.6 replace the relevant branches here with real implementations
 * imported from packages/agent/src/tools/<name>.ts.
 */
export async function routeToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  // Sandbox mode: intercept write-side tools before any real execution (Story 8.1).
  if (ctx.sandboxMode && name in SANDBOX_STUBS) {
    return SANDBOX_STUBS[name]!(input);
  }

  // ── Story 7.3 — lead-context reads (always-on) ──────────────────────────────
  switch (name) {
    case 'buscar_historico_lead':
      // No model params — identity comes entirely from ctx.
      return buscarHistoricoLead(ctx);
    case 'consultar_ofertas_ativas':
      // No model params — phase scoping comes from ctx.campaignPhase.
      return consultarOfertasAtivas(ctx);
    case 'verificar_elegibilidade':
      return verificarElegibilidade(
        { productId: String(input.productId ?? '') },
        ctx
      );

    // ── Story 7.4 — sales & conversion actions ──────────────────────────────
    // enviar_link_checkout + marcar_intencao_compra are always-on; adicionar_tag
    // is configurable (gated by buildToolList, not here). routeToolCall does not
    // re-check toggles — a tool only reaches here if it was offered to Claude.
    case 'enviar_link_checkout':
      return enviarLinkCheckout({ productId: String(input.productId ?? '') }, ctx);
    case 'marcar_intencao_compra':
      return marcarIntencaoCompra(
        input.productId === undefined
          ? {}
          : { productId: String(input.productId) },
        ctx
      );
    case 'adicionar_tag':
      return adicionarTag(
        {
          tagText: String(input.tagText ?? ''),
          ...(input.conversationContext === undefined
            ? {}
            : { conversationContext: String(input.conversationContext) }),
        },
        ctx
      );

    // ── Story 7.5 — knowledge-base consultation (configurable) ───────────────
    // Gated by buildToolList; a call only reaches here if the tenant enabled it.
    case 'consultar_base_conhecimento':
      return consultarBaseConhecimento(
        {
          tipo: input.tipo === 'faq' ? 'faq' : 'objecao',
          ...(input.categoria === undefined
            ? {}
            : { categoria: String(input.categoria) }),
        },
        ctx
      );

    // ── Story 7.6 — human transfer (configurable) ────────────────────────────
    // Gated by buildToolList; a call only reaches here if the tenant enabled it.
    case 'transferir_humano':
      return transferirHumano(
        {
          motivo: String(input.motivo ?? ''),
          conversationSummary: String(input.conversationSummary ?? ''),
        },
        ctx
      );

    // ── Story 13.4 — follow-up scheduling & re-engagement (configurable) ─────
    case 'agendar_followup':
      return agendarFollowup(
        {
          agendado_para: String(input.agendado_para ?? ''),
          motivo: String(input.motivo ?? ''),
          ...(input.conteudoSugerido === undefined
            ? {}
            : { conteudoSugerido: String(input.conteudoSugerido) }),
        },
        ctx
      );
    case 'solicitar_reengajamento':
      return solicitarReengajamento({ motivo: String(input.motivo ?? '') }, ctx);
  }

  if (STUBBED_TOOLS.has(name)) {
    return NOT_YET_ENABLED;
  }

  // Stories 7.4–7.6 wire the remaining concrete tools in here. Until then, every
  // other tool returns a structured "pending" result rather than throwing — keeps
  // the loop alive and gives Claude a usable signal.
  return { ok: false, reason: 'tool_not_implemented', tool: name };
}
