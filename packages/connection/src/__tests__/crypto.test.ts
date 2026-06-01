import { describe, expect, it, vi } from 'vitest';

const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

describe('envelope encryption', () => {
  it('round-trip: decrypted value equals original', async () => {
    const { encryptToken, decryptToken } = await import('../adapters/crypto.js');
    const original = 'EAABsbCS9jboBACtoken123abc';
    const { ciphertext, iv } = encryptToken(original);
    expect(decryptToken(ciphertext, iv)).toBe(original);
  });

  it('each call produces a different IV', async () => {
    const { encryptToken } = await import('../adapters/crypto.js');
    const { iv: iv1 } = encryptToken('token');
    const { iv: iv2 } = encryptToken('token');
    expect(iv1).not.toBe(iv2);
  });

  it('tampered ciphertext throws (GCM integrity check)', async () => {
    const { encryptToken, decryptToken } = await import('../adapters/crypto.js');
    const { ciphertext, iv } = encryptToken('sensitivetoken');
    const parts = ciphertext.split('.');
    parts[1] = Buffer.from('tampered').toString('base64');
    const tampered = parts.join('.');
    expect(() => decryptToken(tampered, iv)).toThrow();
  });

  it('output contains no plaintext token', async () => {
    const { encryptToken } = await import('../adapters/crypto.js');
    const token = 'EAABsbCS9jboBACsecrettoken';
    const { ciphertext, iv } = encryptToken(token);
    expect(ciphertext).not.toContain(token);
    expect(iv).not.toContain(token);
  });
});
