import { describe, it, expect } from 'vitest';
import { isValidCpfCnpj, normalizeCpfCnpj } from '../lib/cpf-cnpj.js';

describe('normalizeCpfCnpj', () => {
  it('strips formatting characters', () => {
    expect(normalizeCpfCnpj('529.982.247-25')).toBe('52998224725');
    expect(normalizeCpfCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });
});

describe('isValidCpfCnpj', () => {
  it('accepts a valid CPF (formatted or raw)', () => {
    expect(isValidCpfCnpj('529.982.247-25')).toBe(true);
    expect(isValidCpfCnpj('52998224725')).toBe(true);
  });

  it('accepts a valid CNPJ (formatted or raw)', () => {
    expect(isValidCpfCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
  });

  it('rejects a CPF with an invalid check digit', () => {
    expect(isValidCpfCnpj('52998224724')).toBe(false);
    expect(isValidCpfCnpj('12345678900')).toBe(false);
  });

  it('rejects a CNPJ with an invalid check digit', () => {
    expect(isValidCpfCnpj('11222333000180')).toBe(false);
  });

  it('rejects repeated-digit sequences (structurally invalid)', () => {
    expect(isValidCpfCnpj('00000000000')).toBe(false);
    expect(isValidCpfCnpj('11111111111111')).toBe(false);
  });

  it('rejects wrong-length, empty, and nullish values', () => {
    expect(isValidCpfCnpj('123')).toBe(false);
    expect(isValidCpfCnpj('')).toBe(false);
    expect(isValidCpfCnpj(undefined)).toBe(false);
    expect(isValidCpfCnpj(null)).toBe(false);
  });
});
