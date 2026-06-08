'use client';

import { useEffect, useState } from 'react';

interface Subscription {
  plano: 'starter' | 'pro' | 'enterprise';
  valor: string;
  status: 'ativa' | 'atrasada' | 'cancelada' | 'trial';
  proximoVencimento: string | null;
}

interface BillingSummary {
  subscription: Subscription | null;
  tenant: { status: string };
  billing_status: string | null;
}

interface Invoice {
  id: string;
  valor: string | null;
  valorOverage: string;
  vencimento: string | null;
  pagoPem: string | null;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  receiptUrl: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ativa: { label: 'Ativa', className: 'bg-green-100 text-green-800' },
  atrasada: { label: 'Atrasada', className: 'bg-yellow-100 text-yellow-800' },
  cancelada: { label: 'Cancelada', className: 'bg-gray-100 text-gray-600' },
  trial: { label: 'Trial', className: 'bg-blue-100 text-blue-800' },
};

const INVOICE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-green-100 text-green-800' },
  pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
  atrasado: { label: 'Atrasado', className: 'bg-red-100 text-red-800' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-600' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatCurrency(value: string | null): string {
  if (!value) return '—';
  return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

interface BillingClientProps {
  tenantId: string;
}

export function BillingClient({ tenantId }: BillingClientProps) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/tenants/${tenantId}/billing/summary`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/tenants/${tenantId}/billing/invoices?limit=6`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([summaryData, invoicesData]: [BillingSummary | null, Invoice[]]) => {
        setSummary(summaryData);
        setInvoices(invoicesData ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const sub = summary?.subscription;
  const tenantBlocked = summary?.tenant.status === 'blocked';
  const subOverdue = sub?.status === 'atrasada';

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold">Cobrança</h1>

      {/* Warning banner (AC: #3) */}
      {(subOverdue || tenantBlocked) && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {tenantBlocked
            ? 'Conta suspensa por inadimplência. Seus dados estão preservados.'
            : 'Seu pagamento está atrasado. Regularize para evitar bloqueio.'}
        </div>
      )}

      {/* Pending billing setup warning */}
      {summary?.billing_status === 'pendente_configuracao' && (
        <div
          role="alert"
          className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800"
        >
          Configuração de cobrança pendente para este tenant.
        </div>
      )}

      {/* Plan card (AC: #1) */}
      {sub ? (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Plano atual</p>
              <p className="mt-1 text-2xl font-bold">{PLAN_LABELS[sub.plano] ?? sub.plano}</p>
              <p className="mt-1 text-lg font-medium text-muted-foreground">
                {formatCurrency(sub.valor)}/mês
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                STATUS_LABELS[sub.status]?.className ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {STATUS_LABELS[sub.status]?.label ?? sub.status}
            </span>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Próximo vencimento:{' '}
            <span className="font-medium text-foreground">
              {formatDate(sub.proximoVencimento)}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6 shadow-sm text-sm text-muted-foreground">
          Nenhuma assinatura configurada ainda.
        </div>
      )}

      {/* Invoice table (AC: #1, #2, #5) */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Faturas recentes</h2>
        </div>

        {invoices.length === 0 ? (
          // Empty state (AC: #5)
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma fatura gerada ainda. Seu primeiro ciclo será cobrado em{' '}
            {formatDate(sub?.proximoVencimento ?? null)}.
          </div>
        ) : (
          <div className="divide-y">
            {invoices.map((invoice) => (
              <div key={invoice.id}>
                <button
                  onClick={() =>
                    setExpandedId(expandedId === invoice.id ? null : invoice.id)
                  }
                  className="flex w-full items-center justify-between px-6 py-4 text-left text-sm hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      {formatDate(invoice.vencimento)}
                    </span>
                    <span className="font-medium">{formatCurrency(invoice.valor)}</span>
                    {parseFloat(invoice.valorOverage) > 0 && (
                      <span className="text-xs text-muted-foreground">
                        + {formatCurrency(invoice.valorOverage)} em excedentes
                      </span>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      INVOICE_STATUS_LABELS[invoice.status]?.className ??
                      'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {INVOICE_STATUS_LABELS[invoice.status]?.label ?? invoice.status}
                  </span>
                </button>

                {/* Expanded detail (AC: #2) */}
                {expandedId === invoice.id && (
                  <div className="border-t bg-muted/30 px-6 py-4 text-sm">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-muted-foreground">Vencimento</p>
                        <p className="font-medium">{formatDate(invoice.vencimento)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Pagamento</p>
                        <p className="font-medium">{formatDate(invoice.pagoPem)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Valor total</p>
                        <p className="font-medium">
                          {formatCurrency(
                            invoice.valor
                              ? String(
                                  parseFloat(invoice.valor) +
                                    parseFloat(invoice.valorOverage || '0')
                                )
                              : null
                          )}
                        </p>
                      </div>
                      {invoice.receiptUrl && (
                        <div>
                          <p className="text-muted-foreground">Comprovante</p>
                          <a
                            href={invoice.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary underline hover:no-underline"
                          >
                            Baixar comprovante
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
