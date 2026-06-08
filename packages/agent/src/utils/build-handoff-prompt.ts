// Handoff summary prompt builder (Story 7.6, Task 3).
//
// Pure function — assembles the Claude Haiku prompt that produces the operator
// handoff summary. The actual Haiku call lives in the tool use case
// (transferir-humano.ts); this module only builds the prompt string so it can be
// unit-tested in isolation and kept free of the Anthropic SDK.
//
// Output guidance: the summary is markdown with fixed sections so operators read
// a consistent format every time — Sobre o Lead, O que quer, Objeções,
// Temperatura, Motivo, Próximo passo sugerido (AC#2).

export interface HandoffPromptInput {
  /** Lead display name (or a fallback like the phone when name is unknown). */
  leadName: string;
  /** Current lead temperature (frio | morno | quente). */
  temperatura: string;
  /** Reason the agent decided to transfer (from the tool call). */
  motivo: string;
  /**
   * Conversation context the model supplied in the tool call — a short recap of
   * what the lead wants and any objections raised so far.
   */
  conversationSummary: string;
}

/**
 * Builds the Haiku prompt for the operator handoff summary. Deterministic and
 * side-effect free: same input → same string (so the unit test can assert it).
 */
export function buildHandoffPrompt(input: HandoffPromptInput): string {
  const { leadName, temperatura, motivo, conversationSummary } = input;

  return [
    'Você é um assistente que prepara um resumo de transferência (handoff) para',
    'um atendente humano que vai assumir uma conversa de vendas no WhatsApp.',
    '',
    'Com base nas informações abaixo, escreva um resumo OBJETIVO em português',
    'do Brasil, em markdown, EXATAMENTE com as seções a seguir (use estes títulos):',
    '',
    '## Sobre o Lead',
    '## O que quer',
    '## Objeções',
    '## Temperatura',
    '## Motivo',
    '## Próximo passo sugerido',
    '',
    'Regras:',
    '- Seja direto; o atendente precisa entender o contexto em segundos.',
    '- Em "Próximo passo sugerido", proponha a resposta/ação ideal para o operador.',
    '- Não invente fatos que não estejam no contexto.',
    '',
    '--- DADOS ---',
    `Nome do lead: ${leadName}`,
    `Temperatura atual: ${temperatura}`,
    `Motivo da transferência: ${motivo}`,
    '',
    'Contexto da conversa:',
    conversationSummary,
  ].join('\n');
}
