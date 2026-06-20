import { describe, expect, it } from 'vitest';
import {
  getStatusBadge,
  getQualityBadge,
  getTierLabel,
  getErrorExplanation,
  formatRelativeTime,
} from './health-display';

describe('getStatusBadge', () => {
  it('conectado -> semantic success (not WhatsApp green)', () => {
    const badge = getStatusBadge('conectado');
    expect(badge.label).toBe('Conectado');
    // Must use green-* tailwind classes (semantic), NOT #25D366 / hardcoded WhatsApp green
    expect(badge.className).toContain('green');
    expect(badge.className).not.toContain('25D366');
  });

  it('erro -> semantic error/red', () => {
    const badge = getStatusBadge('erro');
    expect(badge.label).toBe('Erro');
    expect(badge.className).toContain('red');
  });

  it('desconectado -> neutral gray', () => {
    const badge = getStatusBadge('desconectado');
    expect(badge.label).toBe('Desconectado');
    expect(badge.className).toContain('gray');
  });

  it('null -> neutral gray fallback', () => {
    const badge = getStatusBadge(null);
    expect(badge.className).toContain('gray');
  });
});

describe('getQualityBadge', () => {
  it.each([
    ['verde', 'Qualidade Alta', 'green'],
    ['GREEN', 'Qualidade Alta', 'green'],
    ['amarelo', 'Qualidade Média', 'yellow'],
    ['YELLOW', 'Qualidade Média', 'yellow'],
    ['vermelho', 'Qualidade Baixa', 'red'],
    ['RED', 'Qualidade Baixa', 'red'],
  ])('%s -> label=%s, color=%s', (rating, expectedLabel, expectedColor) => {
    const badge = getQualityBadge(rating);
    expect(badge?.label).toBe(expectedLabel);
    expect(badge?.className).toContain(expectedColor);
  });

  it('null -> null', () => {
    expect(getQualityBadge(null)).toBeNull();
  });
});

describe('getTierLabel', () => {
  it.each([
    ['1k', '1.000 mensagens/dia'],
    ['TIER_1K', '1.000 mensagens/dia'],
    ['10k', '10.000 mensagens/dia'],
    ['TIER_10K', '10.000 mensagens/dia'],
    ['100k', '100.000 mensagens/dia'],
    ['TIER_100K', '100.000 mensagens/dia'],
    ['unlimited', 'Ilimitado'],
    ['TIER_UNLIMITED', 'Ilimitado'],
  ])('%s -> %s', (tier, expected) => {
    expect(getTierLabel(tier)).toBe(expected);
  });

  it('null -> null', () => {
    expect(getTierLabel(null)).toBeNull();
  });
});

describe('getErrorExplanation', () => {
  it('contains Meta Business Suite guidance and no token hints', () => {
    const msg = getErrorExplanation();
    expect(msg).toContain('Meta Business Suite');
    expect(msg).toContain('token');
    // Must not expose or hint at the current token value
    expect(msg.toLowerCase()).not.toContain('token atual');
    expect(msg.toLowerCase()).not.toContain('valor');
  });
});

describe('formatRelativeTime', () => {
  it('null -> null', () => {
    expect(formatRelativeTime(null)).toBeNull();
  });

  it('< 1 min -> agora', () => {
    expect(formatRelativeTime(new Date())).toBe('verificado agora');
  });

  it('~3 min -> "verificado há 3 min"', () => {
    const d = new Date(Date.now() - 3 * 60_000);
    expect(formatRelativeTime(d)).toBe('verificado há 3 min');
  });

  it('~2 hours -> "verificado há 2 horas"', () => {
    const d = new Date(Date.now() - 2 * 60 * 60_000);
    expect(formatRelativeTime(d)).toBe('verificado há 2 horas');
  });
});
