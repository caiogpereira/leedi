import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  BLOCK_MARKERS,
  type AgentConfigInput,
  type SalesMethodInput,
  type ActiveProductInput,
} from '../build-system-prompt.js';

const baseConfig: AgentConfigInput = {
  nomeAgente: 'Mari',
  persona: 'Você é uma consultora experiente e empática.',
  estiloMensagem: { tamanho: 'medio', formalidade: 'informal', emoji: true },
  limites: 'Nunca prometa garantia de resultados.',
};

const baseMethod: SalesMethodInput = {
  titulo: 'SPIN Selling',
  descricao: 'Método baseado em perguntas de situação, problema, implicação e necessidade.',
  systemPromptTemplate: 'Conduza a conversa usando perguntas SPIN.',
  phases: [
    { ordem: 2, nome: 'Problema', objetivo: 'Identificar dores' },
    { ordem: 1, nome: 'Situação', objetivo: 'Entender o contexto' },
  ],
};

const baseProduct: ActiveProductInput = {
  nome: 'Curso de Vendas',
  descricao: 'Curso completo de técnicas de vendas.',
  preco: '297.00',
  linkCheckout: 'https://checkout.example.com/curso',
};

describe('buildSystemPrompt', () => {
  it('contains all four blocks with their markers', () => {
    const prompt = buildSystemPrompt(baseConfig, baseMethod, baseProduct);
    expect(prompt).toContain(BLOCK_MARKERS.personaStart);
    expect(prompt).toContain(BLOCK_MARKERS.personaEnd);
    expect(prompt).toContain(BLOCK_MARKERS.methodStart);
    expect(prompt).toContain(BLOCK_MARKERS.methodEnd);
    expect(prompt).toContain(BLOCK_MARKERS.productStart);
    expect(prompt).toContain(BLOCK_MARKERS.productEnd);
    expect(prompt).toContain(BLOCK_MARKERS.limitsStart);
    expect(prompt).toContain(BLOCK_MARKERS.limitsEnd);
  });

  it('includes the configured agent name "Mari" (AC#4)', () => {
    const prompt = buildSystemPrompt(baseConfig, baseMethod, baseProduct);
    expect(prompt).toContain('Mari');
  });

  it('emits blocks in stable order: persona, method, product, limits', () => {
    const prompt = buildSystemPrompt(baseConfig, baseMethod, baseProduct);
    const idxPersona = prompt.indexOf(BLOCK_MARKERS.personaStart);
    const idxMethod = prompt.indexOf(BLOCK_MARKERS.methodStart);
    const idxProduct = prompt.indexOf(BLOCK_MARKERS.productStart);
    const idxLimits = prompt.indexOf(BLOCK_MARKERS.limitsStart);
    expect(idxPersona).toBeLessThan(idxMethod);
    expect(idxMethod).toBeLessThan(idxProduct);
    expect(idxProduct).toBeLessThan(idxLimits);
  });

  it('feeds persona and estilo into the PERSONA block, limites into LIMITS block', () => {
    const prompt = buildSystemPrompt(baseConfig, baseMethod, baseProduct);
    expect(prompt).toContain('consultora experiente');
    expect(prompt).toContain('Pode usar emojis com moderação.');
    expect(prompt).toContain('Nunca prometa garantia de resultados.');
  });

  it('sorts method phases by ordem', () => {
    const prompt = buildSystemPrompt(baseConfig, baseMethod, baseProduct);
    expect(prompt.indexOf('Situação')).toBeLessThan(prompt.indexOf('Problema'));
  });

  it('handles a null sales method and null product gracefully', () => {
    const prompt = buildSystemPrompt(baseConfig, null, null);
    expect(prompt).toContain('Nenhum método de venda específico configurado.');
    expect(prompt).toContain('Nenhuma oferta ativa no momento.');
    expect(prompt).toContain('Mari');
  });

  it('includes the objection-handling nudge ONLY when consultar_base_conhecimento is enabled (Story 7.5)', () => {
    const withTool = buildSystemPrompt(baseConfig, baseMethod, baseProduct, [
      'consultar_base_conhecimento',
    ]);
    expect(withTool).toContain('consultar_base_conhecimento');
    expect(withTool).toContain('Quando o lead levantar uma objeção');
  });

  it('omits the objection nudge when the tool is not enabled', () => {
    const withoutTool = buildSystemPrompt(baseConfig, baseMethod, baseProduct, [
      'buscar_historico_lead',
    ]);
    expect(withoutTool).not.toContain('Quando o lead levantar uma objeção');
  });

  it('omits the objection nudge when no tool list is passed (backward compatible)', () => {
    const legacy = buildSystemPrompt(baseConfig, baseMethod, baseProduct);
    expect(legacy).not.toContain('Quando o lead levantar uma objeção');
  });

  it('keeps the nudge inside the LIMITS block', () => {
    const prompt = buildSystemPrompt(baseConfig, baseMethod, baseProduct, [
      'consultar_base_conhecimento',
    ]);
    const nudgeIdx = prompt.indexOf('Quando o lead levantar uma objeção');
    const limitsStartIdx = prompt.indexOf(BLOCK_MARKERS.limitsStart);
    const limitsEndIdx = prompt.indexOf(BLOCK_MARKERS.limitsEnd);
    expect(nudgeIdx).toBeGreaterThan(limitsStartIdx);
    expect(nudgeIdx).toBeLessThan(limitsEndIdx);
  });

  it('respects emoji=false and formalidade=formal', () => {
    const prompt = buildSystemPrompt(
      {
        ...baseConfig,
        estiloMensagem: { tamanho: 'curto', formalidade: 'formal', emoji: false },
      },
      baseMethod,
      baseProduct
    );
    expect(prompt).toContain('Não use emojis.');
    expect(prompt).toContain('Mantenha um tom formal e profissional.');
  });
});
