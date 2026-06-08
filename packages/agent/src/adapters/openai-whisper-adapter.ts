import { env } from '@leedi/config';
import type { TranscriptionProvider } from '../ports/transcription-provider.js';

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

// OpenAI's hosted Whisper. ~18× the cost of Groq for comparable Portuguese
// quality, so this is the fallback — only reached when TRANSCRIPTION_PROVIDER=openai.
const MODEL = 'whisper-1';
const LANGUAGE = 'pt';

/**
 * Fallback transcription adapter (Story 7.7).
 *
 * Identical multipart contract to the Groq adapter (OpenAI is the reference
 * implementation Groq mirrors). Used only when `TRANSCRIPTION_PROVIDER=openai`.
 * `OPENAI_API_KEY` is validated lazily at first audio use.
 */
export class OpenAiWhisperAdapter implements TranscriptionProvider {
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set — required for audio transcription (TRANSCRIPTION_PROVIDER=openai).'
      );
    }

    const form = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    form.append('file', blob, `audio.${extensionFor(mimeType)}`);
    form.append('model', MODEL);
    form.append('language', LANGUAGE);
    form.append('response_format', 'json');

    const res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI transcription failed: ${res.status} ${detail}`.trim());
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  }
}

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
