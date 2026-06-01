import { describe, expect, it, vi, afterEach } from 'vitest';

const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

describe('MetaCloudProvider — sendText & sendTemplate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function buildProvider() {
    const { MetaCloudProvider } = await import('../adapters/meta-cloud-provider.js');
    const { encryptToken } = await import('../adapters/crypto.js');
    const { ciphertext, iv } = encryptToken('EAABtest_token');
    return new MetaCloudProvider({
      phoneNumberId: '12345',
      wabaId: 'waba-1',
      accessTokenEncrypted: ciphertext,
      accessTokenIv: iv,
    });
  }

  it('sendText returns messageId on success (AC#1)', async () => {
    const provider = await buildProvider();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.TESTMESSAGEID001' }] }),
    }));

    const result = await provider.sendText('+5511999999999', 'Olá!');
    expect(result.messageId).toBe('wamid.TESTMESSAGEID001');
  });

  it('sendText includes correct payload structure', async () => {
    const provider = await buildProvider();
    let capturedBody: unknown;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-1' }] }),
      });
    }));

    await provider.sendText('+5511', 'Teste');
    const body = capturedBody as Record<string, unknown>;
    expect(body['messaging_product']).toBe('whatsapp');
    expect(body['type']).toBe('text');
    expect((body['text'] as Record<string, string>)['body']).toBe('Teste');
    expect(body['to']).toBe('+5511');
    // Token must not appear in body
    expect(JSON.stringify(body)).not.toContain('EAABtest_token');
  });

  it('sendText retries on 429 and succeeds on second attempt (AC#2)', async () => {
    const provider = await buildProvider();
    let callCount = 0;

    vi.useFakeTimers();

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: () => null },
          json: async () => ({}),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-retry-success' }] }),
      });
    }));

    const sendPromise = provider.sendText('+5511', 'retry test');
    await vi.runAllTimersAsync();
    const result = await sendPromise;

    expect(result.messageId).toBe('msg-retry-success');
    expect(callCount).toBe(2);

    vi.useRealTimers();
  });

  it('sendText fails fast on non-retryable 4xx (AC#2)', async () => {
    const provider = await buildProvider();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
    }));

    await expect(provider.sendText('+5511', 'bad')).rejects.toThrow('Meta API error: 400');
  });

  it('sendText throws after 3 failed attempts (AC#2)', async () => {
    const provider = await buildProvider();

    vi.useFakeTimers();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
    }));

    // Run promise and timers together, catch rejection immediately
    let caught: Error | null = null;
    const sendPromise = provider.sendText('+5511', 'fail').catch((e: Error) => { caught = e; });
    await vi.runAllTimersAsync();
    await sendPromise;

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Meta API/);

    vi.useRealTimers();
  });

  it('sendTemplate sends correct template payload', async () => {
    const provider = await buildProvider();
    let capturedBody: unknown;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: 'tmpl-msg-1' }] }),
      });
    }));

    const result = await provider.sendTemplate('+5511', 'hello_world', ['João', 'Loja X']);
    expect(result.messageId).toBe('tmpl-msg-1');

    const body = capturedBody as Record<string, unknown>;
    expect(body['type']).toBe('template');
    const template = body['template'] as Record<string, unknown>;
    expect(template['name']).toBe('hello_world');
  });

  it('sendText honors Retry-After header (AC#2)', async () => {
    const provider = await buildProvider();
    let callCount = 0;
    const delays: number[] = [];

    vi.useFakeTimers();

    const origSetTimeout = global.setTimeout;
    vi.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      delays.push(delay ?? 0);
      return origSetTimeout(fn, 0); // execute immediately in test
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: (h: string) => h === 'retry-after' ? '3' : null },
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-after-retry-after' }] }),
      });
    }));

    const sendPromise = provider.sendText('+5511', 'retry-after test');
    await vi.runAllTimersAsync();
    await sendPromise;

    // Should have used 3000ms (3s * 1000) from Retry-After header
    expect(delays.some(d => d === 3000)).toBe(true);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
