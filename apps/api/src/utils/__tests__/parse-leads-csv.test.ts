import { describe, expect, it } from 'vitest';
import { parseLeadsCsv, CsvValidationError } from '../parse-leads-csv.js';

describe('parseLeadsCsv', () => {
  it('parses a valid CSV with telefone, nome and email into ParsedRow[]', () => {
    const csv = [
      'telefone,nome,email',
      '11999998888,Ana,ana@example.com',
      '+5521988887777,Bruno,bruno@example.com',
    ].join('\n');

    const { valid, errors, duplicates } = parseLeadsCsv(csv);

    expect(errors).toHaveLength(0);
    expect(duplicates).toHaveLength(0);
    expect(valid).toEqual([
      { telefone: '+5511999998888', nome: 'Ana', email: 'ana@example.com' },
      { telefone: '+5521988887777', nome: 'Bruno', email: 'bruno@example.com' },
    ]);
  });

  it('treats nome and email as optional', () => {
    const csv = ['telefone', '11999998888'].join('\n');
    const { valid, errors } = parseLeadsCsv(csv);

    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toEqual({ telefone: '+5511999998888' });
    expect(valid[0]).not.toHaveProperty('nome');
    expect(valid[0]).not.toHaveProperty('email');
  });

  it('normalizes a 13-digit number already carrying the 55 country code', () => {
    const csv = ['telefone', '5511999998888'].join('\n');
    const { valid } = parseLeadsCsv(csv);
    expect(valid[0]?.telefone).toBe('+5511999998888');
  });

  it('reports a malformed phone as an error but keeps valid rows', () => {
    const csv = [
      'telefone,nome',
      '123,Curto',
      '11999998888,Valido',
    ].join('\n');

    const { valid, errors } = parseLeadsCsv(csv);

    expect(valid).toHaveLength(1);
    expect(valid[0]?.telefone).toBe('+5511999998888');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ index: 0, raw: '123', reason: 'Telefone inválido' });
  });

  it('throws CsvValidationError when the telefone column is missing', () => {
    const csv = ['nome,email', 'Ana,ana@example.com'].join('\n');

    expect(() => parseLeadsCsv(csv)).toThrow(CsvValidationError);
    expect(() => parseLeadsCsv(csv)).toThrow(
      "Coluna 'telefone' obrigatória não encontrada no arquivo."
    );
  });

  it('keeps the first in-file occurrence and counts the second as a duplicate (not an error)', () => {
    const csv = [
      'telefone,nome',
      '11999998888,Primeiro',
      '11999998888,Segundo',
    ].join('\n');

    const { valid, errors, duplicates } = parseLeadsCsv(csv);

    expect(valid).toHaveLength(1);
    expect(valid[0]).toEqual({ telefone: '+5511999998888', nome: 'Primeiro' });

    // AC#5: the repeat is a duplicate, NOT an error.
    expect(errors).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.index).toBe(1);
    expect(duplicates[0]?.reason).toBe('Telefone duplicado no arquivo');
  });

  it('dedupes across formatting differences (same normalized E.164)', () => {
    const csv = [
      'telefone',
      '11999998888',
      '+55 (11) 99999-8888',
    ].join('\n');

    const { valid, errors, duplicates } = parseLeadsCsv(csv);

    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.reason).toBe('Telefone duplicado no arquivo');
  });

  it('separates malformed (errors) from in-file repeats (duplicates) in one file', () => {
    const csv = [
      'telefone,nome',
      '11999998888,Valido',
      '123,Curto',
      '11999998888,Repetido',
    ].join('\n');

    const { valid, errors, duplicates } = parseLeadsCsv(csv);

    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toBe('Telefone inválido');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.reason).toBe('Telefone duplicado no arquivo');
  });

  it('resolves the telefone column case-insensitively', () => {
    const csv = ['Telefone,Nome', '11999998888,Ana'].join('\n');
    const { valid, errors } = parseLeadsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(valid[0]).toEqual({ telefone: '+5511999998888', nome: 'Ana' });
  });
});
