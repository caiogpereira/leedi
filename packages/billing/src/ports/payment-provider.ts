export interface PaymentProvider {
  criarCliente(dados: { nome: string; email: string; cpfCnpj?: string }): Promise<string>;
  criarAssinatura(
    customerId: string,
    plano: string,
    valor: number
  ): Promise<{ subscriptionId: string; proximoVencimento: Date }>;
  cancelarAssinatura(subscriptionId: string): Promise<void>;
  /**
   * Constant-time comparison of the token Asaas sends in the `asaas-access-token`
   * HTTP header against the expected webhook token. Returns false when the
   * incoming token is missing.
   */
  verificarWebhook(incomingToken: string | undefined | null, expectedToken: string): boolean;
}
