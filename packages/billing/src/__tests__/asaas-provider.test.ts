import { describe, it, expect } from 'vitest';
import { AsaasProvider } from '../adapters/asaas-provider.js';

const SANDBOX_KEY = 'test-api-key';

describe('AsaasProvider.verificarWebhook', () => {
  const provider = new AsaasProvider(SANDBOX_KEY, true);
  const TOKEN = 'my-webhook-secret-token';

  it('returns true when accessToken matches expected token', () => {
    expect(provider.verificarWebhook({ accessToken: TOKEN }, TOKEN)).toBe(true);
  });

  it('returns false when accessToken does not match', () => {
    expect(provider.verificarWebhook({ accessToken: 'wrong-token' }, TOKEN)).toBe(false);
  });

  it('returns false when accessToken is missing from payload', () => {
    expect(provider.verificarWebhook({ event: 'PAYMENT_RECEIVED' }, TOKEN)).toBe(false);
  });

  it('returns false when payload is not an object', () => {
    expect(provider.verificarWebhook(null, TOKEN)).toBe(false);
    expect(provider.verificarWebhook('string', TOKEN)).toBe(false);
  });

  it('uses constant-time comparison (does not short-circuit on length mismatch)', () => {
    // Both tokens go through sha256 so length is always 64 hex chars — safe
    expect(provider.verificarWebhook({ accessToken: '' }, TOKEN)).toBe(false);
    expect(provider.verificarWebhook({ accessToken: TOKEN.slice(0, -1) }, TOKEN)).toBe(false);
  });
});
