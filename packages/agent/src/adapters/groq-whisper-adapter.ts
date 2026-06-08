import { env } from '@leedi/config';
import type { TranscriptionProvider } from '../ports/transcription-provider.js';

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Groq's fastest Whisper model — same quality tier as OpenAI's whisper-1 for
// Portuguese at ~18× lower cost. OGG/OPUS (WhatsApp's native voice format) is
// accepted directly, so NO ffmpeg transcode step is required.
const MODEL = 'whisper-large-v3-turbo';
const LANGUAGE = 'pt';

/**
 * V1 default transcription adapter (Story 7.7).
 *
 * Groq exposes an OpenAI-compatible transcriptions endpoint, so a plain
 * multipart `fetch` is all that's needed — no SDK. The audio buffer is supplied
 * by the caller (already downloaded from Meta's CDN); this adapter only POSTs it
 * to Groq and returns the text.
 *
 * `GROQ_API_KEY` is validated LAZILY here (not at boot): tenants that never send
 * audio should not be forced to configure it. A clear error is thrown at the
 * first audio use if the key is absent — process-message catches it and sends
 * the user-facing fallback.
 */
export class GroqWhisperAdapter implements TranscriptionProvider {
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY is not set — required for audio transcription (TRANSCRIPTION_PROVIDER=groq).'
      );
    }

    const form = new FormData();
    // The Web FormData/Blob API is available on Node 18+. The filename extension
    // hints the format to Whisper; the Blob carries the real MIME type.
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    form.append('file', blob, `audio.${extensionFor(mimeType)}`);
    form.append('model', MODEL);
    form.append('language', LANGUAGE);
    form.append('response_format', 'json');

    const res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Groq transcription failed: ${res.status} ${detail}`.trim());
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  }
}

/** Best-effort file extension for the Whisper filename hint. */
function extensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
  };
  return map[base] ?? 'ogg';
}
