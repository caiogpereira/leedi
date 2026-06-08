import type { TranscriptionProvider } from '../ports/transcription-provider.js';

/**
 * Deepgram transcription adapter — STUB for V1 (Story 7.7).
 *
 * Deepgram is a candidate alternative provider whose admin-panel configuration
 * is V2 scope (see Architecture §13). The port is implemented so the factory can
 * route to it without code changes once it's wired, but for V1 it intentionally
 * fails loudly rather than silently returning empty text — that would let an
 * audio message reach Claude as an empty turn and look like a coherent reply to
 * nothing.
 */
export class DeepgramAdapter implements TranscriptionProvider {
  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<string> {
    // TODO(V2): implement Deepgram pre-recorded transcription via
    // POST https://api.deepgram.com/v1/listen?language=pt with a DEEPGRAM_API_KEY.
    throw new Error(
      'DeepgramAdapter is not implemented for V1 — set TRANSCRIPTION_PROVIDER=groq (default) or =openai.'
    );
  }
}
