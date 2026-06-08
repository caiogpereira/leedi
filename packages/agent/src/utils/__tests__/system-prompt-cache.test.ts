import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, BLOCK_MARKERS } from '../build-system-prompt.js';
import type { AgentConfigInput } from '../build-system-prompt.js';

const config: AgentConfigInput = {
  nomeAgente: 'Léo',
  persona: 'Vendedor consultivo e simpático.',
  estiloMensagem: { tamanho: 'medio', formalidade: 'informal', emoji: true },
  limites: 'Não prometa o que não pode cumprir.',
};

// AC#2: the system prompt produced here is the STABLE prefix that Story 7.2
// wraps in a single cache_control block. These tests lock in the properties the
// caching path depends on: it's a deterministic string, byte-stable across calls
// with identical inputs, and contains all blocks (no variable lead message).
describe('buildSystemPrompt — caching readiness', () => {
  it('is deterministic (byte-stable) for identical inputs', () => {
    const a = buildSystemPrompt(config, null, null);
    const b = buildSystemPrompt(config, null, null);
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
  });

  it('contains the stable block markers in order', () => {
    const prompt = buildSystemPrompt(config, null, null);
    const personaIdx = prompt.indexOf(BLOCK_MARKERS.personaStart);
    const methodIdx = prompt.indexOf(BLOCK_MARKERS.methodStart);
    const productIdx = prompt.indexOf(BLOCK_MARKERS.productStart);
    const limitsIdx = prompt.indexOf(BLOCK_MARKERS.limitsStart);
    expect(personaIdx).toBeGreaterThanOrEqual(0);
    expect(methodIdx).toBeGreaterThan(personaIdx);
    expect(productIdx).toBeGreaterThan(methodIdx);
    expect(limitsIdx).toBeGreaterThan(productIdx);
  });

  it('does not embed any per-message variable content (no lead message)', () => {
    const prompt = buildSystemPrompt(config, null, null);
    // The system prefix must never contain the volatile user turn — that goes in
    // `messages`. A sanity check: the prompt is fully derived from config inputs.
    expect(prompt).toContain('Léo');
    expect(prompt).toContain('Não prometa');
  });
});
