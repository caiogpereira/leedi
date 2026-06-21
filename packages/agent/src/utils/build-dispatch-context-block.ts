import type { DispatchOrigin } from '../use-cases/get-dispatch-origin.js';

/** Stable wrapper markers (consistent with build-system-prompt's block markers). */
export const DISPATCH_CONTEXT_MARKERS = {
  start: '[DISPATCH_ORIGIN_BLOCK]',
  end: '[/DISPATCH_ORIGIN_BLOCK]',
} as const;

/**
 * Builds the per-lead "dispatch origin" system block (PT-BR), appended AFTER the
 * cached prompt prefix. Returns '' for organic conversations (null origin) so the
 * caller appends nothing.
 *
 * When a product is known, the block asserts precedence over any general active
 * offer named in the cached PRODUCT_BLOCK — otherwise the agent would see two
 * offers with no tiebreaker.
 */
export function buildDispatchContextBlock(origin: DispatchOrigin | null): string {
  if (!origin) return '';

  const lines: string[] = [
    'Este lead chegou respondendo a um disparo (mensagem proativa) que enviamos.',
  ];

  if (origin.campaignNome) {
    lines.push(`Campanha de origem: ${origin.campaignNome}.`);
  }

  if (origin.produtoNome) {
    lines.push(
      `O lead foi contatado especificamente sobre a oferta "${origin.produtoNome}". ` +
        'Priorize esta oferta sobre qualquer oferta ativa geral mencionada acima.',
    );
  }

  if (origin.templateBody.trim()) {
    lines.push('', 'Mensagem que enviamos ao lead:', `"""${origin.templateBody.trim()}"""`);
  }

  lines.push(
    '',
    'Use este contexto para entender ao que o lead está respondendo e conduza a conversa de acordo.',
  );

  return `${DISPATCH_CONTEXT_MARKERS.start}\n${lines.join('\n')}\n${DISPATCH_CONTEXT_MARKERS.end}`;
}
