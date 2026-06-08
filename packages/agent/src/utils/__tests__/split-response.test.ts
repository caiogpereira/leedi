import { describe, it, expect } from 'vitest';
import { splitResponse } from '../split-response.js';

describe('splitResponse', () => {
  it('returns a single segment for text ≤280 chars', () => {
    const text = 'Oi! Tudo bem? Como posso te ajudar hoje?';
    expect(splitResponse(text)).toEqual([text]);
  });

  it('returns a single segment exactly at 280 chars', () => {
    const text = 'a'.repeat(280);
    const result = splitResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(280);
  });

  it('splits on double newlines when text >280 chars', () => {
    const p1 = 'Primeiro parágrafo com conteúdo suficiente para ultrapassar o limite mínimo de quarenta caracteres por segmento.';
    const p2 = 'Segundo parágrafo igualmente longo com bastante conteúdo para formar um segundo segmento independente e válido.';
    const p3 = 'Terceiro parágrafo também longo o bastante para virar um terceiro segmento separado sem ser mesclado ao anterior.';
    const text = `${p1}\n\n${p2}\n\n${p3}`;
    const result = splitResponse(text);
    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result[0]).toContain('Primeiro');
    expect(result.join(' ')).toContain('Terceiro');
  });

  it('splits on sentence boundaries when >280 chars without double newlines', () => {
    const s = 'Esta é uma frase razoavelmente longa para servir de segmento. ';
    const text = (s.repeat(6)).trim(); // >280, no double newlines
    const result = splitResponse(text);
    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('merges tiny tail segments (<40 chars) into the previous segment', () => {
    const big = 'Parágrafo grande com muito mais de quarenta caracteres para garantir que seja um segmento válido por conta própria neste teste.';
    const tiny = 'Ok!';
    const text = `${big}\n\n${tiny}`;
    const result = splitResponse(text);
    // The tiny tail must NOT be its own segment.
    expect(result.every((seg) => seg.length >= 40 || result.length === 1)).toBe(true);
    expect(result[result.length - 1]).toContain('Ok!');
  });

  it('caps at 4 segments, merging overflow into the last', () => {
    const para = (n: number) =>
      `Parágrafo número ${n} com conteúdo suficiente para ultrapassar quarenta caracteres e virar um segmento próprio.`;
    const text = [1, 2, 3, 4, 5, 6].map(para).join('\n\n');
    const result = splitResponse(text);
    expect(result.length).toBeLessThanOrEqual(4);
    // Overflow paragraphs (5,6) must still be present, folded into the last segment.
    expect(result[result.length - 1]).toContain('número 5');
    expect(result[result.length - 1]).toContain('número 6');
  });

  it('returns [""] for empty / whitespace-only input', () => {
    expect(splitResponse('')).toEqual(['']);
    expect(splitResponse('   \n  ')).toEqual(['']);
  });
});
