export interface PaymentProvider {
  criarCliente(dados: { nome: string; email: string; cpfCnpj?: string }): Promise<string>;
  criarAssinatura(
    customerId: string,
    plano: string,
    valor: number
  ): Promise<{ subscriptionId: string; proximoVencimento: Date }>;
  cancelarAssinatura(subscriptionId: string): Promise<void>;
  /**
   * Updates an existing subscription's monthly value (used by plan changes).
   * Maps to `PUT /v3/subscriptions/{id}` with `updatePendingPayments: true` so
   * already-generated pending charges reflect the new amount.
   */
  atualizarAssinatura(subscriptionId: string, plano: string, valor: number): Promise<void>;
  /**
   * Creates a one-off charge (cobrança avulsa) — used to bill accumulated
   * conversation overage at the end of a period. Maps to `POST /v3/payments`.
   * `externalReference` is an idempotency/reconciliation handle on the Asaas side
   * (e.g. `overage:{tenantId}:{periodo}`).
   */
  criarCobrancaAvulsa(input: {
    customerId: string;
    valor: number;
    descricao: string;
    vencimento: string;
    externalReference: string;
  }): Promise<{ paymentId: string; vencimento: string; invoiceUrl: string | null }>;
  /**
   * Constant-time comparison of the token Asaas sends in the `asaas-access-token`
   * HTTP header against the expected webhook token. Returns false when the
   * incoming token is missing.
   */
  verificarWebhook(incomingToken: string | undefined | null, expectedToken: string): boolean;
}
