import { describe, it, expect } from 'vitest';
import { AsaasProvider } from '../adapters/asaas-provider.js';

const SANDBOX_KEY = 'test-api-key';

describe('AsaasProvider.verificarWebhook', () => {
  const provider = new AsaasProvider(SANDBOX_KEY, true);
  const TOKEN = 'my-webhook-secret-token';

  it('returns true when the incoming token matches the expected token', () => {
    expect(provider.verificarWebhook(TOKEN, TOKEN)).toBe(true);
  });

  it('returns false when the incoming token does not match', () => {
    expect(provider.verificarWebhook('wrong-token', TOKEN)).toBe(false);
  });

  it('returns false when the incoming token is missing (undefined/null/empty)', () => {
    // Asaas sends the token in the `asaas-access-token` header; a request without
    // it (undefined) must be rejected — this is the real-world 401 case.
    expect(provider.verificarWebhook(undefined, TOKEN)).toBe(false);
    expect(provider.verificarWebhook(null, TOKEN)).toBe(false);
    expect(provider.verificarWebhook('', TOKEN)).toBe(false);
  });

  it('returns false when the expected token is empty (misconfiguration)', () => {
    expect(provider.verificarWebhook(TOKEN, '')).toBe(false);
  });

  it('uses constant-time comparison over equal-length sha256 digests', () => {
    // Near-miss tokens (differ by one char / length) must still return false.
    expect(provider.verificarWebhook(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(provider.verificarWebhook(TOKEN + 'x', TOKEN)).toBe(false);
  });
});
