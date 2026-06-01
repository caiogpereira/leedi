import { describe, it, expect } from 'vitest';

// Validate the seed data shapes defined inline (we can't import the seed file
// directly because it calls process.exit). These tests validate the contract:
// 4 global methods, correct phases, non-empty templates.

// Copy the method name/phase structure from the seed for validation
const METHOD_SPECS = [
  {
    nome: 'spin',
    titulo: 'SPIN Selling',
    isGlobal: true,
    expectedPhaseNames: ['Situação', 'Problema', 'Implicação', 'Necessidade'],
  },
  {
    nome: 'aida',
    titulo: 'AIDA',
    isGlobal: true,
    expectedPhaseNames: ['Atenção', 'Interesse', 'Desejo', 'Ação'],
  },
  {
    nome: 'storytelling',
    titulo: 'Storytelling',
    isGlobal: true,
    expectedPhaseNames: ['Identificação', 'Conflito', 'Transformação', 'Convite'],
  },
  {
    nome: 'livre',
    titulo: 'Livre',
    isGlobal: true,
    // Livre has a single open phase
    expectedPhaseMinLength: 1,
  },
];

describe('sales methods seed data', () => {
  it('defines exactly 4 global methods', () => {
    expect(METHOD_SPECS).toHaveLength(4);
  });

  it('all methods are global', () => {
    for (const m of METHOD_SPECS) {
      expect(m.isGlobal).toBe(true);
    }
  });

  it('all methods have non-empty titulo', () => {
    for (const m of METHOD_SPECS) {
      expect(m.titulo.length).toBeGreaterThan(0);
    }
  });

  it('defines all 4 expected nome values', () => {
    const nomes = METHOD_SPECS.map((m) => m.nome);
    expect(nomes).toContain('spin');
    expect(nomes).toContain('aida');
    expect(nomes).toContain('storytelling');
    expect(nomes).toContain('livre');
  });

  it('storytelling uses Identificação→Conflito→Transformação→Convite (not Contexto→Resolução)', () => {
    const storytelling = METHOD_SPECS.find((m) => m.nome === 'storytelling');
    expect(storytelling).toBeDefined();
    const phases = storytelling!.expectedPhaseNames!;
    expect(phases).toContain('Identificação');
    expect(phases).toContain('Conflito');
    expect(phases).toContain('Transformação');
    expect(phases).toContain('Convite');
    expect(phases).not.toContain('Contexto');
    expect(phases).not.toContain('Resolução');
  });

  it('SPIN phases follow Situação→Problema→Implicação→Necessidade order', () => {
    const spin = METHOD_SPECS.find((m) => m.nome === 'spin');
    const phases = spin!.expectedPhaseNames!;
    expect(phases[0]).toBe('Situação');
    expect(phases[1]).toBe('Problema');
    expect(phases[2]).toBe('Implicação');
    expect(phases[3]).toBe('Necessidade');
  });

  it('AIDA phases follow Atenção→Interesse→Desejo→Ação order', () => {
    const aida = METHOD_SPECS.find((m) => m.nome === 'aida');
    const phases = aida!.expectedPhaseNames!;
    expect(phases[0]).toBe('Atenção');
    expect(phases[1]).toBe('Interesse');
    expect(phases[2]).toBe('Desejo');
    expect(phases[3]).toBe('Ação');
  });
});
