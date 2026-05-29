import { describe, expect, it } from 'vitest';
import { validateEnv } from '../validate.js';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/leedi',
  SENTRY_DSN: 'https://abc123@sentry.io/123456',
  POSTHOG_KEY: 'phc_examplekey',
  BETTER_STACK_TOKEN: 'example_token',
  API_PORT: '3003',
} as const;

describe('validateEnv', () => {
  it('returns typed env on valid input', () => {
    const result = validateEnv(validEnv as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.NODE_ENV).toBe('development');
      expect(result.env.API_PORT).toBe(3003);
      expect(result.env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/leedi');
    }
  });

  it('fails when DATABASE_URL is missing and names the field', () => {
    const { DATABASE_URL: _removed, ...withoutDb } = validEnv;
    const result = validateEnv(withoutDb as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('DATABASE_URL');
    }
  });

  it('fails when DATABASE_URL is not a valid URL', () => {
    const result = validateEnv({ ...validEnv, DATABASE_URL: 'not-a-url' } as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('DATABASE_URL');
    }
  });

  it('coerces API_PORT string to number', () => {
    const result = validateEnv({ ...validEnv, API_PORT: '4000' } as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.API_PORT).toBe(4000);
    }
  });

  it('uses default API_PORT when not provided', () => {
    const { API_PORT: _removed, ...withoutPort } = validEnv;
    const result = validateEnv(withoutPort as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.API_PORT).toBe(3003);
    }
  });
});
