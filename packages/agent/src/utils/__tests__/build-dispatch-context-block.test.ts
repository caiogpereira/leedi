import { describe, it, expect } from 'vitest';
import {
  buildDispatchContextBlock,
  DISPATCH_CONTEXT_MARKERS,
} from '../build-dispatch-context-block.js';

describe('buildDispatchContextBlock', () => {
  it('returns an empty string for null origin (organic conversation)', () => {
    expect(buildDispatchContextBlock(null)).toBe('');
  });

  it('wraps the block in stable markers', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'T',
      templateBody: 'oi',
      campaignNome: null,
      produtoNome: null,
    });
    expect(out.startsWith(DISPATCH_CONTEXT_MARKERS.start)).toBe(true);
    expect(out.endsWith(DISPATCH_CONTEXT_MARKERS.end)).toBe(true);
  });

  it('states product precedence over the general active offer when a product is known', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'Abertura',
      templateBody: 'Vagas abertas!',
      campaignNome: 'Lançamento Junho',
      produtoNome: 'Curso Alpha',
    });
    expect(out).toContain('Curso Alpha');
    expect(out).toContain('Lançamento Junho');
    expect(out.toLowerCase()).toContain('priorize'); // precedence instruction present
  });

  it('includes the literal template body the lead received', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'Abertura',
      templateBody: 'Vagas abertas! Garanta a sua.',
      campaignNome: null,
      produtoNome: null,
    });
    expect(out).toContain('Vagas abertas! Garanta a sua.');
  });

  it('omits product precedence wording when no product is known (rule path)', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'Carrinho Abandonado',
      templateBody: 'Esqueceu algo?',
      campaignNome: null,
      produtoNome: null,
    });
    expect(out.toLowerCase()).not.toContain('priorize');
    expect(out).toContain('Esqueceu algo?');
  });
});
