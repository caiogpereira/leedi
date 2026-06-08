import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mutable env mock so each test can toggle GROQ_API_KEY (validated lazily).
const envState = vi.hoisted(() => ({
  env: { TRANSCRIPTION_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_test_key' as string | undefined },
}));
vi.mock('@leedi/config', () => ({ env: envState.env }));

// Import AFTER the mock is registered.
import { GroqWhisperAdapter } from '../groq-whisper-adapter.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

beforeEach(() => {
  vi.restoreAllMocks();
  envState.env.GROQ_API_KEY = 'gsk_test_key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GroqWhisperAdapter', () => {
  it('returns the trimmed transcription text on an ok response (AC#1)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: '  Quero saber o preço  ' }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new GroqWhisperAdapter();
    const text = await adapter.transcribe(Buffer.from('ogg-bytes'), 'audio/ogg');

    expect(text).toBe('Quero saber o preço');

    // Posts to the Groq transcriptions endpoint with the Bearer header + multipart body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(GROQ_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test_key');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('pt');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('throws a clear error WITHOUT calling fetch when GROQ_API_KEY is absent (lazy validation)', async () => {
    envState.env.GROQ_API_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new GroqWhisperAdapter();
    await expect(adapter.transcribe(Buffer.from('x'), 'audio/ogg')).rejects.toThrow(
      /GROQ_API_KEY is not set/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-ok response (network/format failure surfaces to the caller — AC#3)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new GroqWhisperAdapter();
    await expect(adapter.transcribe(Buffer.from('x'), 'audio/ogg')).rejects.toThrow(
      /Groq transcription failed: 400/
    );
  });
});
