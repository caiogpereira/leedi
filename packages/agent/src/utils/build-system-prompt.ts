// Shape of agent_configs.estilo_mensagem. Kept local to keep this a pure, dependency-free
// utility (no DB import) — the DB schema in @leedi/db declares the authoritative column type.
export interface EstiloMensagem {
  tamanho: 'curto' | 'medio' | 'longo';
  formalidade: 'formal' | 'informal';
  emoji: boolean;
}

// Stable block markers. Story 7.2 attaches cache_control to the end of the stable
// prefix (PERSONA + METHOD + PRODUCT), so these markers MUST stay byte-stable to
// preserve prompt-cache hits (Architecture §7.5).
export const BLOCK_MARKERS = {
  personaStart: '[PERSONA_BLOCK]',
  personaEnd: '[/PERSONA_BLOCK]',
  methodStart: '[METHOD_BLOCK]',
  methodEnd: '[/METHOD_BLOCK]',
  productStart: '[PRODUCT_BLOCK]',
  productEnd: '[/PRODUCT_BLOCK]',
  limitsStart: '[LIMITS_BLOCK]',
  limitsEnd: '[/LIMITS_BLOCK]',
} as const;

/** Subset of agent_configs needed to build the persona + limits blocks. */
export interface AgentConfigInput {
  nomeAgente: string;
  persona: string;
  estiloMensagem: EstiloMensagem;
  limites: string;
}

/** Subset of sales_methods needed to build the method block. May be null (no method picked). */
export interface SalesMethodInput {
  titulo: string;
  descricao: string;
  systemPromptTemplate: string;
  phases: Array<{ ordem: number; nome: string; objetivo: string }>;
}

/** Subset of products needed to build the product block. May be null (no active product). */
export interface ActiveProductInput {
  nome: string;
  descricao?: string | null;
  preco?: string | null;
  linkCheckout?: string | null;
}

const TAMANHO_LABEL: Record<EstiloMensagem['tamanho'], string> = {
  curto: 'Prefira respostas curtas e diretas.',
  medio: 'Use respostas de tamanho médio, equilibrando contexto e objetividade.',
  longo: 'Pode usar respostas mais longas e detalhadas quando fizer sentido.',
};

const FORMALIDADE_LABEL: Record<EstiloMensagem['formalidade'], string> = {
  formal: 'Mantenha um tom formal e profissional.',
  informal: 'Use um tom informal e amigável.',
};

function buildPersonaBlock(config: AgentConfigInput): string {
  const lines = [
    `Seu nome é ${config.nomeAgente}.`,
  ];

  if (config.persona.trim()) {
    lines.push('', config.persona.trim());
  }

  const { estiloMensagem } = config;
  lines.push(
    '',
    'Estilo de mensagem:',
    `- ${TAMANHO_LABEL[estiloMensagem.tamanho]}`,
    `- ${FORMALIDADE_LABEL[estiloMensagem.formalidade]}`,
    `- ${estiloMensagem.emoji ? 'Pode usar emojis com moderação.' : 'Não use emojis.'}`
  );

  return `${BLOCK_MARKERS.personaStart}\n${lines.join('\n')}\n${BLOCK_MARKERS.personaEnd}`;
}

function buildMethodBlock(method: SalesMethodInput | null): string {
  if (!method) {
    return `${BLOCK_MARKERS.methodStart}\nNenhum método de venda específico configurado. Conduza a conversa de forma livre e consultiva.\n${BLOCK_MARKERS.methodEnd}`;
  }

  const lines = [
    `Método de venda: ${method.titulo}`,
    method.descricao,
    '',
    method.systemPromptTemplate,
  ];

  if (method.phases.length > 0) {
    const phases = [...method.phases].sort((a, b) => a.ordem - b.ordem);
    lines.push('', 'Fases da conversa:');
    for (const phase of phases) {
      lines.push(`${phase.ordem}. ${phase.nome}: ${phase.objetivo}`);
    }
  }

  return `${BLOCK_MARKERS.methodStart}\n${lines.join('\n')}\n${BLOCK_MARKERS.methodEnd}`;
}

function buildProductBlock(product: ActiveProductInput | null): string {
  if (!product) {
    return `${BLOCK_MARKERS.productStart}\nNenhuma oferta ativa no momento.\n${BLOCK_MARKERS.productEnd}`;
  }

  const lines = [`Produto/oferta ativa: ${product.nome}`];
  if (product.descricao?.trim()) lines.push(product.descricao.trim());
  if (product.preco) lines.push(`Preço: ${product.preco}`);
  if (product.linkCheckout) lines.push(`Link de checkout: ${product.linkCheckout}`);

  return `${BLOCK_MARKERS.productStart}\n${lines.join('\n')}\n${BLOCK_MARKERS.productEnd}`;
}

/**
 * Prompt-level nudge appended to the LIMITS block ONLY when the
 * consultar_base_conhecimento tool is enabled (Story 7.5, AC#1/#5). This is
 * guidance, not hard-coded routing — Claude still chooses when to call the tool
 * and which match to use.
 */
const OBJECTION_NUDGE =
  'Quando o lead levantar uma objeção ou dúvida, chame `consultar_base_conhecimento` antes de responder. Para objeções, associe a preocupação do lead à categoria mais relevante.';

function buildLimitsBlock(config: AgentConfigInput, includeObjectionNudge: boolean): string {
  const parts = [
    config.limites.trim()
      ? config.limites.trim()
      : 'Nenhum limite ou restrição adicional configurado.',
  ];
  if (includeObjectionNudge) {
    parts.push(OBJECTION_NUDGE);
  }
  return `${BLOCK_MARKERS.limitsStart}\n${parts.join('\n\n')}\n${BLOCK_MARKERS.limitsEnd}`;
}

/**
 * Builds the agent's system prompt from its config, the chosen sales method, and the
 * active product. Pure function — no Claude API calls, fully unit-testable.
 *
 * Layout: PERSONA + METHOD + PRODUCT form the STABLE PREFIX (cacheable in Story 7.2),
 * LIMITS closes the prompt. Each block is wrapped in stable markers.
 *
 * `enabledToolIds` (optional, Story 7.5) is the list of tool identifiers offered to
 * Claude for this request. When it includes `consultar_base_conhecimento`, an
 * objection-handling nudge is appended to the LIMITS block. Omitting the argument
 * preserves the prior (no-nudge) output — backward compatible.
 */
export function buildSystemPrompt(
  agentConfig: AgentConfigInput,
  salesMethod: SalesMethodInput | null,
  activeProduct: ActiveProductInput | null,
  enabledToolIds: readonly string[] = []
): string {
  const includeObjectionNudge = enabledToolIds.includes('consultar_base_conhecimento');
  return [
    buildPersonaBlock(agentConfig),
    buildMethodBlock(salesMethod),
    buildProductBlock(activeProduct),
    buildLimitsBlock(agentConfig, includeObjectionNudge),
  ].join('\n\n');
}
