export interface WhatsAppProvider {
  sendText(to: string, body: string): Promise<{ messageId: string }>;
  sendTemplate(
    to: string,
    templateName: string,
    params: string[]
  ): Promise<{ messageId: string }>;
  validateConnection(): Promise<{
    displayName: string;
    qualityRating: string;
    messagingTier: string;
  }>;
  /**
   * Resolves the temporary CDN URL for an inbound media object (Story 7.7).
   * Inbound audio/image webhooks carry a media ID, not a URL — this performs the
   * `GET /{version}/{media-id}` lookup and returns the (auth-required) CDN URL
   * plus its MIME type.
   *
   * Optional: only providers that receive inbound media need to implement it
   * (e.g. the agent loop's media path). Outbound-only call sites — health checks,
   * connection validation — don't.
   */
  getMediaUrl?(mediaId: string): Promise<{ url: string; mimeType: string }>;
  /**
   * Downloads the bytes of a media CDN URL with the connection's access token
   * (Meta CDN URLs require the Bearer header — Story 7.7). Optional (see above).
   */
  downloadMedia?(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string }>;
  /**
   * Submits a WhatsApp message template to Meta for approval (Story 12.1).
   * On success returns the Meta-assigned template ID.
   * On failure throws with Meta's error message preserved.
   */
  submitTemplate(
    wabaId: string,
    template: SubmitTemplatePayload
  ): Promise<{ metaTemplateId: string }>;
}

export interface TemplateComponentPayload {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string }>;
  example?: { header_text?: string[]; body_text?: string[][] };
}

export interface SubmitTemplatePayload {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: TemplateComponentPayload[];
}
