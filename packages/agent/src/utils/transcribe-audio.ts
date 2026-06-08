import { env } from '@leedi/config';
import type { TranscriptionProvider } from '../ports/transcription-provider.js';
import { GroqWhisperAdapter } from '../adapters/groq-whisper-adapter.js';
import { OpenAiWhisperAdapter } from '../adapters/openai-whisper-adapter.js';
import { DeepgramAdapter } from '../adapters/deepgram-adapter.js';

/**
 * Returns the transcription adapter selected by `TRANSCRIPTION_PROVIDER`
 * (`'groq'` | `'openai'` | `'deepgram'`, default `'groq'`). Provider choice is a
 * platform-level setting, not per-tenant (Story 7.7 / Architecture §13).
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  switch (env.TRANSCRIPTION_PROVIDER) {
    case 'openai':
      return new OpenAiWhisperAdapter();
    case 'deepgram':
      return new DeepgramAdapter();
    case 'groq':
    default:
      return new GroqWhisperAdapter();
  }
}

/**
 * Transcribes an already-downloaded audio buffer to text using the configured
 * provider. Thin convenience wrapper over the factory + port so callers don't
 * touch the adapter classes directly.
 *
 * @throws If the provider fails (network, missing key, unsupported format).
 *   process-message catches this and sends the AC#3 fallback message.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  provider: TranscriptionProvider = getTranscriptionProvider()
): Promise<string> {
  return provider.transcribe(audioBuffer, mimeType);
}
