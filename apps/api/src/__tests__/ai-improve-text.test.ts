import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAiRouter } from '../routes/ai.js';
import type { AIProvider } from '../ai/provider.js';
import { Hono } from 'hono';

// Mock @leedi/config to avoid env validation in tests
vi.mock('@leedi/config', () => ({
  env: {
    UPSTASH_REDIS_REST_URL: 'https://fake.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'fake-token',
    ANTHROPIC_API_KEY: 'fake-key',
  },
}));

// Mock @upstash/redis — must use a class (constructor) mock
vi.mock('@upstash/redis', () => {
  class Redis {
    incr = vi.fn().mockResolvedValue(1);
    expire = vi.fn().mockResolvedValue(1);
  }
  return { Redis };
});

function makeStreamProvider(text: string): AIProvider {
  return {
    completarStream: vi.fn().mockResolvedValue(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue(text);
          controller.close();
        },
      })
    ),
  };
}

describe('POST /api/ai/improve-text', () => {
  let app: Hono;
  let aiProvider: AIProvider;

  beforeEach(() => {
    aiProvider = makeStreamProvider('texto melhorado pela IA');
    const router = createAiRouter(aiProvider);
    app = new Hono();
    app.route('/api/ai', router);
  });

  it('calls completarStream with the Haiku model', async () => {
    const res = await app.request('/api/ai/improve-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'texto para melhorar', context: 'agent persona' }),
    });

    expect(res.status).toBe(200);
    expect(aiProvider.completarStream).toHaveBeenCalledWith(
      expect.stringContaining('texto para melhorar'),
      'claude-haiku-4-5-20251001'
    );
  });

  it('streams the AI response as text/plain', async () => {
    const res = await app.request('/api/ai/improve-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'texto para melhorar', context: 'agent persona' }),
    });

    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toBe('texto melhorado pela IA');
  });

  it('returns 400 for missing text', async () => {
    const res = await app.request('/api/ai/improve-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'agent persona' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing context', async () => {
    const res = await app.request('/api/ai/improve-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'some text' }),
    });
    expect(res.status).toBe(400);
  });
});
