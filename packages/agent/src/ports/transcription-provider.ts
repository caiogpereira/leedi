/**
 * Port for speech-to-text transcription providers (Story 7.7).
 *
 * The adapter is responsible ONLY for turning an already-downloaded audio buffer
 * into text. Fetching the audio from Meta's CDN is the caller's job (it owns the
 * tenant's encrypted access token), so adapters stay provider-agnostic and easy
 * to unit-test by mocking a single outbound transcription call.
 */
export interface TranscriptionProvider {
  /**
   * Transcribes spoken audio to text.
   *
   * @param audioBuffer Raw audio bytes (e.g. OGG/OPUS from WhatsApp — accepted
   *   natively by Whisper, no transcode needed).
   * @param mimeType The audio MIME type as reported by Meta (e.g. `audio/ogg`).
   * @returns The transcribed text.
   * @throws If transcription fails (network error, missing API key, unsupported
   *   format). The caller (process-message) catches this and sends the fallback.
   */
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
