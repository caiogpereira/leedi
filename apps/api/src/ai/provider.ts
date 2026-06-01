/**
 * AI Provider port — Architecture §8.4.
 *
 * This interface is the only surface the rest of the application depends on.
 * Swap the implementation (ClaudeProvider → OpenAIProvider) without touching
 * any domain or route code.
 */
export interface AIProvider {
  /**
   * Simple text completion — for formatting/auxiliary tasks (§7.4 cost routing).
   * Returns a ReadableStream of text tokens for streaming to the client.
   */
  completarStream(prompt: string, model: string): Promise<ReadableStream<string>>;
}
