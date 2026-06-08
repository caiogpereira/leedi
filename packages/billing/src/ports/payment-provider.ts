export interface PaymentProvider {
  criarCliente(dados: { nome: string; email: string; cpfCnpj?: string }): Promise<string>;
  criarAssinatura(
    customerId: string,
    plano: string,
    valor: number
  ): Promise<{ subscriptionId: string; proximoVencimento: Date }>;
  cancelarAssinatura(subscriptionId: string): Promise<void>;
  /** Constant-time comparison of payload.accessToken against the expected token. */
  verificarWebhook(payload: unknown, token: string): boolean;
}
