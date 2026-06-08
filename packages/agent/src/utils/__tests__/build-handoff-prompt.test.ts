import { describe, it, expect } from 'vitest';
import { buildHandoffPrompt } from '../build-handoff-prompt.js';

describe('buildHandoffPrompt', () => {
  const input = {
    leadName: 'Maria',
    temperatura: 'quente',
    motivo: 'lead pediu para falar com humano',
    conversationSummary: 'Quer comprar mas tem dúvida sobre o preço.',
  };

  it('includes all six required handoff sections (AC#2)', () => {
    const prompt = buildHandoffPrompt(input);
    expect(prompt).toContain('## Sobre o Lead');
    expect(prompt).toContain('## O que quer');
    expect(prompt).toContain('## Objeções');
    expect(prompt).toContain('## Temperatura');
    expect(prompt).toContain('## Motivo');
    expect(prompt).toContain('## Próximo passo sugerido');
  });

  it('embeds the supplied lead data', () => {
    const prompt = buildHandoffPrompt(input);
    expect(prompt).toContain('Maria');
    expect(prompt).toContain('quente');
    expect(prompt).toContain('lead pediu para falar com humano');
    expect(prompt).toContain('Quer comprar mas tem dúvida sobre o preço.');
  });

  it('is deterministic — same input yields the same prompt', () => {
    expect(buildHandoffPrompt(input)).toBe(buildHandoffPrompt(input));
  });
});
