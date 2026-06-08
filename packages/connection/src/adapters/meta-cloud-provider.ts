import { env } from '@leedi/config';
import { decryptToken } from './crypto.js';
import type { WhatsAppProvider, SubmitTemplatePayload } from '../ports/whatsapp-provider.js';

const BASE_URL = 'https://graph.facebook.com';

interface ConnectionRecord {
  phoneNumberId: string;
  wabaId: string;
  accessTokenEncrypted: string;
  accessTokenIv: string;
}

export class MetaCloudProvider implements WhatsAppProvider {
  readonly #phoneNumberId: string;
  readonly #accessTokenEncrypted: string;
  readonly #accessTokenIv: string;

  constructor(record: ConnectionRecord) {
    this.#phoneNumberId = record.phoneNumberId;
    this.#accessTokenEncrypted = record.accessTokenEncrypted;
    this.#accessTokenIv = record.accessTokenIv;
  }

  // Redact all sensitive fields from serialization
  toJSON() {
    return { phoneNumberId: this.#phoneNumberId, type: 'MetaCloudProvider' };
  }

  async validateConnection(): Promise<{
    displayName: string;
    qualityRating: string;
    messagingTier: string;
  }> {
    const token = decryptToken(this.#accessTokenEncrypted, this.#accessTokenIv);
    const version = env.WHATSAPP_API_VERSION;
    const url = `${BASE_URL}/${version}/${this.#phoneNumberId}?fields=verified_name,quality_rating,messaging_limit_tier`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Meta API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      verified_name: string;
      quality_rating: string;
      messaging_limit_tier: string;
    };

    return {
      displayName: data.verified_name,
      qualityRating: data.quality_rating,
      messagingTier: data.messaging_limit_tier,
    };
  }

  async sendText(to: string, body: string): Promise<{ messageId: string }> {
    const token = decryptToken(this.#accessTokenEncrypted, this.#accessTokenIv);
    const version = env.WHATSAPP_API_VERSION;
    const url = `${BASE_URL}/${version}/${this.#phoneNumberId}/messages`;

    const result = await this.#fetchWithRetry(url, token, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body },
    });

    const messageId = result.messages[0]?.id;
    if (!messageId) throw new Error('Meta API: missing message ID in response');
    return { messageId };
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: string[]
  ): Promise<{ messageId: string }> {
    const token = decryptToken(this.#accessTokenEncrypted, this.#accessTokenIv);
    const version = env.WHATSAPP_API_VERSION;
    const url = `${BASE_URL}/${version}/${this.#phoneNumberId}/messages`;

    const components =
      params.length > 0
        ? [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ]
        : [];

    const result = await this.#fetchWithRetry(url, token, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components,
      },
    });

    const messageId = result.messages[0]?.id;
    if (!messageId) throw new Error('Meta API: missing message ID in response');
    return { messageId };
  }

  /**
   * Resolves an inbound media ID to its temporary CDN URL (Story 7.7).
   *
   * Inbound audio/image messages deliver only a media ID; the binary lives behind
   * `GET /{version}/{media-id}`, which returns a short-lived (~5 min) `url`. The
   * URL itself still requires the Bearer token to fetch (see downloadMedia).
   */
  async getMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string }> {
    const token = decryptToken(this.#accessTokenEncrypted, this.#accessTokenIv);
    const version = env.WHATSAPP_API_VERSION;
    const url = `${BASE_URL}/${version}/${mediaId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Meta media lookup error: ${res.status}`);
    }

    const data = (await res.json()) as { url: string; mime_type: string };
    return { url: data.url, mimeType: data.mime_type };
  }

  /**
   * Downloads the bytes of a media CDN URL (Story 7.7). The Meta CDN host (e.g.
   * `lookaside.fbsbx.com`) requires the same Bearer token as the Graph API.
   */
  async downloadMedia(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const token = decryptToken(this.#accessTokenEncrypted, this.#accessTokenIv);

    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Meta media download error: ${res.status}`);
    }

    const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType };
  }

  async submitTemplate(
    wabaId: string,
    template: SubmitTemplatePayload
  ): Promise<{ metaTemplateId: string }> {
    const token = decryptToken(this.#accessTokenEncrypted, this.#accessTokenIv);
    const version = env.WHATSAPP_API_VERSION;
    const url = `${BASE_URL}/${version}/${wabaId}/message_templates`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(template),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      const message = errBody.error?.message ?? `Meta API error: ${res.status}`;
      throw new Error(message);
    }

    const data = (await res.json()) as { id: string | number };
    return { metaTemplateId: String(data.id) };
  }

  /**
   * Sends a POST to the Meta API with exponential backoff for 429/5xx.
   * Max 3 attempts: 1s / 2s / 4s (or Retry-After if present).
   * Non-retryable 4xx errors fail fast.
   */
  async #fetchWithRetry(
    url: string,
    token: string,
    payload: Record<string, unknown>
  ): Promise<{ messages: Array<{ id: string }> }> {
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [1000, 2000, 4000] as const;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return res.json() as Promise<{ messages: Array<{ id: string }> }>;
      }

      const shouldRetry = res.status === 429 || res.status >= 500;
      if (!shouldRetry || attempt === MAX_ATTEMPTS - 1) {
        throw new Error(`Meta API error: ${res.status}`);
      }

      const retryAfterHeader = res.headers.get('retry-after');
      const delayMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : BACKOFF_MS[attempt]!;

      await new Promise((r) => setTimeout(r, delayMs));
    }

    throw new Error('Meta API: max retries exceeded');
  }
}
