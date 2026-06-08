import { describe, it, expect } from 'vitest';
import { buildScenarioContext } from '../scenarios.js';

describe('buildScenarioContext', () => {
  it('novo_lead returns empty history', () => {
    const ctx = buildScenarioContext('novo_lead');
    expect(ctx.syntheticHistory).toHaveLength(0);
    expect(ctx.initialUserMessage).toBeUndefined();
  });

  it('lead_recorrente returns exactly 5 messages in Anthropic format', () => {
    const ctx = buildScenarioContext('lead_recorrente');
    expect(ctx.syntheticHistory).toHaveLength(5);
    // Every message must have role + content matching Anthropic format.
    for (const msg of ctx.syntheticHistory) {
      expect(['user', 'assistant']).toContain(msg.role);
      expect(typeof msg.content).toBe('string');
      expect(msg.content).not.toBe('');
    }
    expect(ctx.initialUserMessage).toBeUndefined();
  });

  it('lead_recorrente history includes a prior objection as a user message', () => {
    const ctx = buildScenarioContext('lead_recorrente');
    const userMessages = ctx.syntheticHistory.filter((m) => m.role === 'user');
    const hasObjection = userMessages.some(
      (m) => typeof m.content === 'string' && /caro|preço|dinheiro|pens/i.test(m.content)
    );
    expect(hasObjection).toBe(true);
  });

  it('lead_com_objecao returns empty history with initialUserMessage', () => {
    const ctx = buildScenarioContext('lead_com_objecao');
    expect(ctx.syntheticHistory).toHaveLength(0);
    expect(ctx.initialUserMessage).toBe('Achei caro, não vale o preço');
  });
});
