import { describe, it, expect } from 'vitest';
import { passwordSchema } from './password.js';

describe('passwordSchema', () => {
  it('accepts a valid password', () => {
    expect(passwordSchema.safeParse('Password1').success).toBe(true);
  });

  it('rejects a password shorter than 8 chars', () => {
    expect(passwordSchema.safeParse('Pass1').success).toBe(false);
  });

  it('rejects exactly 7 chars even when otherwise valid', () => {
    expect(passwordSchema.safeParse('Pass1ab').success).toBe(false);
  });

  it('rejects a password without an uppercase letter', () => {
    expect(passwordSchema.safeParse('password1').success).toBe(false);
  });

  it('rejects a password without a number', () => {
    expect(passwordSchema.safeParse('Password').success).toBe(false);
  });

  it('returns the pt-BR length message for short input', () => {
    const result = passwordSchema.safeParse('Aa1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('A senha deve ter pelo menos 8 caracteres');
    }
  });
});
