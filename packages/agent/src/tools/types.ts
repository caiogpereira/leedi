import type { ToolsHabilitadas } from '../utils/resolve-enabled-tools.js';

/**
 * Identity/transport context injected into every tool call. These fields are
 * NEVER exposed in the Anthropic tool JSON Schemas — Claude never supplies them.
 * routeToolCall merges them with the model-supplied `input` before dispatching.
 */
export interface ToolContext {
  tenantId: string;
  leadId: string;
  leadPhone: string;
  connectionId: string;
  threadId: string;
  conversationWindowId: string;
  /**
   * Phase of the active campaign for this tenant, when one is running. Injected
   * by process-message from its loaded campaign context. Campaign infrastructure
   * is not yet shipped (no campaigns table exists), so this is OPTIONAL and
   * `undefined` today — the evergreen path. When a later epic adds campaigns,
   * process-message populates this and the phase-aware branches in
   * verificar_elegibilidade / consultar_ofertas_ativas activate without changes.
   */
  campaignPhase?: CampaignPhase;
  /**
   * Explicit campaign override for playground mode (Story 10.3). When set, the
   * `consultar_ofertas_ativas` tool uses this campaign instead of querying for
   * the globally active one. Must ONLY be set when sandboxMode is true.
   */
  campaignId?: string;
  /**
   * When true, routeToolCall intercepts write-side tools (enviar_link_checkout,
   * marcar_intencao_compra, adicionar_tag, transferir_humano) and returns
   * simulated results without any real side-effects (Story 8.1).
   */
  sandboxMode?: boolean;
}

/** Phases an active launch campaign can be in (Architecture §7.3). */
export type CampaignPhase = 'carrinho_aberto' | 'downsell' | 'encerrada';

/** Anthropic `tools` entry (input_schema is the model-facing JSON Schema). */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type { ToolsHabilitadas };
