// Tool resolution for the agent loop. Pure logic — returns tool IDENTIFIERS only.
// SDK tool schemas are wired in Story 7.2 (no @anthropic-ai/sdk dependency here).

/** Configurable tools — toggled per-tenant via agent_configs.tools_habilitadas. */
export const CONFIGURABLE_TOOLS = [
  'consultar_base_conhecimento',
  'agendar_followup',
  'transferir_humano',
  'adicionar_tag',
  'solicitar_reengajamento',
] as const;

export type ConfigurableTool = (typeof CONFIGURABLE_TOOLS)[number];

/**
 * Always-on tools — NOT stored in tools_habilitadas and NOT toggleable. Every agent
 * call includes these (Architecture §6.5 / story pitfalls).
 */
export const ALWAYS_ON_TOOLS = [
  'buscar_historico_lead',
  'consultar_ofertas_ativas',
  'verificar_elegibilidade',
  'enviar_link_checkout',
  'marcar_intencao_compra',
  'consultar_material_produto',
] as const;

export type AlwaysOnTool = (typeof ALWAYS_ON_TOOLS)[number];

export type ToolName = ConfigurableTool | AlwaysOnTool;

/** Shape of agent_configs.tools_habilitadas. */
export type ToolsHabilitadas = Record<ConfigurableTool, boolean>;

/**
 * Resolves the full list of tool identifiers to pass to the Claude API: every
 * always-on tool, plus the configurable tools the tenant has enabled.
 *
 * AC#5: when tools_habilitadas.transferir_humano = false, 'transferir_humano' is
 * NOT included in the result. Pure function — fully unit-testable.
 */
export function resolveEnabledTools(toolsHabilitadas: ToolsHabilitadas): ToolName[] {
  const enabledConfigurable = CONFIGURABLE_TOOLS.filter((tool) => toolsHabilitadas[tool] === true);
  return [...ALWAYS_ON_TOOLS, ...enabledConfigurable];
}
