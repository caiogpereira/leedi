// Playground scenario builders for Story 8.2.
// Each scenario produces a synthetic conversation context injected into the
// sandbox processMessage call. No real lead rows are created.

import type { AnthropicHistoryMessage } from '@leedi/agent-memory';

export interface PlaygroundScenarioContext {
  /** Pre-built Anthropic-format history messages used as seedHistory. */
  syntheticHistory: AnthropicHistoryMessage[];
  /**
   * For 'lead_com_objecao': injected as the first user message before the
   * operator's input, triggering the objection-handling tool immediately.
   */
  initialUserMessage?: string;
}

/**
 * Builds the scenario context for the three supported playground scenarios.
 * History format matches AnthropicHistoryMessage exactly so it can be passed
 * directly to processMessage as seedHistory.
 */
export function buildScenarioContext(
  scenario: 'novo_lead' | 'lead_recorrente' | 'lead_com_objecao'
): PlaygroundScenarioContext {
  switch (scenario) {
    case 'novo_lead':
      return { syntheticHistory: [] };

    case 'lead_recorrente':
      // 5 messages: system warmth + prior objection surfaced (one of tipo='objecao').
      return {
        syntheticHistory: [
          { role: 'user', content: 'Olá, quero saber mais sobre o produto.' },
          {
            role: 'assistant',
            content: 'Olá! Fico feliz em ajudar. O que gostaria de saber?',
          },
          { role: 'user', content: 'Qual é o preço exato?' },
          {
            role: 'assistant',
            content:
              'O investimento é acessível e traz muito retorno. Posso te enviar o link para garantir sua vaga!',
          },
          { role: 'user', content: 'Acho que está caro para mim agora, vou pensar...' },
        ],
      };

    case 'lead_com_objecao':
      return {
        syntheticHistory: [],
        initialUserMessage: 'Achei caro, não vale o preço',
      };
  }
}
