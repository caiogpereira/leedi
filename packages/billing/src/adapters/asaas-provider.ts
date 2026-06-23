import { createHash, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider } from '../ports/payment-provider.js';

export class BillingProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'BillingProviderError';
  }
}

interface AsaasCustomerResponse {
  id: string;
  name: string;
  email: string;
}

interface AsaasSubscriptionResponse {
  id: string;
  nextDueDate: string;
}

export class AsaasProvider implements PaymentProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, sandbox: boolean) {
    this.apiKey = apiKey;
    this.baseUrl = sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';
  }

  private async request<T>(
    path: string,
    body: unknown,
    method: 'POST' | 'PUT' = 'POST'
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BillingProviderError(
        `Asaas ${path} failed: ${res.status} ${text}`,
        res.status
      );
    }

    return res.json() as Promise<T>;
  }

  async criarCliente(dados: { nome: string; email: string; cpfCnpj?: string }): Promise<string> {
    const customer = await this.request<AsaasCustomerResponse>('/customers', {
      name: dados.nome,
      email: dados.email,
      ...(dados.cpfCnpj ? { cpfCnpj: dados.cpfCnpj } : {}),
    });
    return customer.id;
  }

  async criarAssinatura(
    customerId: string,
    _plano: string,
    valor: number
  ): Promise<{ subscriptionId: string; proximoVencimento: Date }> {
    const nextDueDateStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const sub = await this.request<AsaasSubscriptionResponse>('/subscriptions', {
      customer: customerId,
      billingType: 'BOLETO',
      cycle: 'MONTHLY',
      value: valor,
      nextDueDate: nextDueDateStr,
    });

    return {
      subscriptionId: sub.id,
      proximoVencimento: new Date(sub.nextDueDate),
    };
  }

  async atualizarAssinatura(subscriptionId: string, _plano: string, valor: number): Promise<void> {
    // PUT /v3/subscriptions/{id}. `updatePendingPayments: true` propagates the new
    // value to already-generated pending charges (Asaas docs). The new value takes
    // effect from the next billing cycle. cycle/billingType kept consistent with
    // criarAssinatura (MONTHLY/BOLETO).
    await this.request<AsaasSubscriptionResponse>(
      `/subscriptions/${subscriptionId}`,
      {
        value: valor,
        billingType: 'BOLETO',
        cycle: 'MONTHLY',
        updatePendingPayments: true,
      },
      'PUT'
    );
  }

  async cancelarAssinatura(subscriptionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { access_token: this.apiKey },
    });

    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new BillingProviderError(
        `Asaas cancelarAssinatura failed: ${res.status} ${text}`,
        res.status
      );
    }
  }

  verificarWebhook(incomingToken: string | undefined | null, expectedToken: string): boolean {
    // Asaas sends the configured webhook auth token in the `asaas-access-token`
    // HTTP header (see https://docs.asaas.com/docs/sobre-os-webhooks), NOT in the
    // JSON body. The caller is responsible for reading the header and passing it here.
    if (typeof incomingToken !== 'string' || incomingToken.length === 0) return false;
    if (typeof expectedToken !== 'string' || expectedToken.length === 0) return false;

    try {
      // SHA-256 first so the constant-time compare always runs over equal-length
      // buffers regardless of the raw token lengths (avoids leaking length).
      const a = Buffer.from(createHash('sha256').update(incomingToken).digest('hex'), 'utf8');
      const b = Buffer.from(createHash('sha256').update(expectedToken).digest('hex'), 'utf8');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
