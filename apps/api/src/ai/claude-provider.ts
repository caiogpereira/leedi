import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider.js';

/**
 * ClaudeProvider — concrete implementation of the AIProvider port.
 *
 * Instantiated once at app startup and injected into routes. Direct SDK use is
 * isolated here — no other file imports @anthropic-ai/sdk.
 */
export class ClaudeProvider implements AIProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async completarStream(prompt: string, model: string): Promise<ReadableStream<string>> {
    const stream = await this.client.messages.stream({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    return new ReadableStream<string>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              controller.enqueue(chunk.delta.text);
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }
}
