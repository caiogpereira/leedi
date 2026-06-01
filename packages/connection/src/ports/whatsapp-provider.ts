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
}
