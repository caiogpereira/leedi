'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Button,
  Card,
  Badge,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@leedi/ui';
import type { BadgeProps } from '@leedi/ui';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import type { TenantFullDetail, TenantInvoice } from '@leedi/tenancy';
import { ImpersonateButton } from '../ImpersonateButton';
import { retryBillingAction, changePlanAction } from '../actions';

const STATUS_INTENT: Record<string, NonNullable<BadgeProps['variant']>> = {
  trial: 'info',
  active: 'success',
  blocked: 'danger',
  cancelled: 'neutral',
};

const SUB_STATUS_INTENT: Record<string, NonNullable<BadgeProps['variant']>> = {
  ativa: 'success',
  atrasada: 'warning',
  cancelada: 'neutral',
  trial: 'info',
};

const INVOICE_STATUS_INTENT: Record<string, NonNullable<BadgeProps['variant']>> = {
  pago: 'success',
  pendente: 'warning',
  atrasado: 'danger',
  cancelado: 'neutral',
};

function formatBRL(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatUSD(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function ClienteDetalheClient({
  detail,
  invoices,
  usdToBrlRate,
  marginPct,
  dashboardUrl,
}: {
  detail: TenantFullDetail;
  invoices: TenantInvoice[];
  usdToBrlRate: number;
  marginPct: number | null;
  dashboardUrl: string;
}) {
  const t = useTranslations('clienteDetalhe');
  const tc = useTranslations('clientes');
  const [retryOpen, setRetryOpen] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);

  const sub = detail.subscription;
  const usage = detail.usage;
  const conn = detail.connection;
  const billingPending = detail.billingStatus === 'pendente_configuracao';
  const custoIaUsd = usage?.custoIaUsd ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {t('back')}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{detail.name}</h1>
            <Badge variant={STATUS_INTENT[detail.status] ?? 'neutral'}>
              {tc(`status.${detail.status}` as Parameters<typeof tc>[0])}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.slug} · {t('createdAt')} {formatDate(detail.createdAt)}
            {detail.ownerEmail ? ` · ${t('owner')}: ${detail.ownerEmail}` : ''}
          </p>
        </div>
        <ImpersonateButton
          tenantId={detail.id}
          tenantName={detail.name}
          dashboardUrl={dashboardUrl}
        />
      </div>

      {/* Plano & Cobrança */}
      <Card className="p-6">
        <h2 className="text-base font-semibold">{t('plano.title')}</h2>
        {billingPending ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-amber-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t('plano.pending')}
          </p>
        ) : null}
        {sub ? (
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('plano.plan')}</dt>
              <dd className="mt-1 font-medium">
                {tc(`plans.${detail.plan}` as Parameters<typeof tc>[0])}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('plano.value')}</dt>
              <dd className="mt-1 font-medium">{formatBRL(sub.valor)}/mês</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('plano.subStatus')}</dt>
              <dd className="mt-1">
                <Badge variant={SUB_STATUS_INTENT[sub.status] ?? 'neutral'}>
                  {t(`subStatus.${sub.status}` as Parameters<typeof t>[0])}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('plano.nextDue')}</dt>
              <dd className="mt-1 font-medium">{formatDate(sub.proximoVencimento)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('plano.none')}</p>
        )}
        {billingPending ? (
          <div className="mt-4">
            <Button onClick={() => setRetryOpen(true)}>{t('plano.retry')}</Button>
          </div>
        ) : null}
        {sub ? (
          <div className="mt-4">
            <Button variant="outline" onClick={() => setChangePlanOpen(true)}>
              {t('plano.changePlan')}
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Uso & Margem */}
      <Card className="p-6">
        <h2 className="text-base font-semibold">{t('uso.title')}</h2>
        {usage ? (
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('uso.conversations')}</dt>
              <dd className="mt-1 font-medium">
                {usage.conversasUsadas} / {usage.conversasLimite}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('uso.overage')}</dt>
              <dd className="mt-1 font-medium">{formatBRL(usage.overageValor)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('uso.aiCost')}</dt>
              <dd className="mt-1 font-medium">{formatUSD(custoIaUsd)}</dd>
              <dd className="text-xs text-muted-foreground">
                {t('uso.aiCostBrl', {
                  brl: formatBRL(custoIaUsd * usdToBrlRate),
                  rate: usdToBrlRate.toLocaleString('pt-BR'),
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('uso.margin')}</dt>
              <dd className="mt-1 font-medium">
                {marginPct === null ? t('uso.marginNa') : `${marginPct.toFixed(1)}%`}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('uso.none')}</p>
        )}
      </Card>

      {/* Saúde do número */}
      <Card className="p-6">
        <h2 className="text-base font-semibold">{t('conexao.title')}</h2>
        {conn ? (
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('conexao.status')}</dt>
              <dd className="mt-1 font-medium capitalize">{conn.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t('conexao.quality')}</dt>
              <dd className="mt-1 font-medium">
                {conn.qualityRating
                  ? t(`quality.${conn.qualityRating}` as Parameters<typeof t>[0])
                  : '—'}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('conexao.none')}</p>
        )}
      </Card>

      {/* Faturas */}
      <Card className="p-6">
        <h2 className="text-base font-semibold">{t('faturas.title')}</h2>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('faturas.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{tc('history.columns.date')}</th>
                  <th className="py-2 pr-4 font-medium">{tc('history.columns.dueDate')}</th>
                  <th className="py-2 pr-4 text-right font-medium">{tc('history.columns.value')}</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {tc('history.columns.overage')}
                  </th>
                  <th className="py-2 pr-4 font-medium">{tc('history.columns.status')}</th>
                  <th className="py-2 pr-4 font-medium">{tc('history.columns.paidAt')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b">
                    <td className="py-3 pr-4 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatDate(inv.vencimento)}</td>
                    <td className="py-3 pr-4 text-right">{formatBRL(inv.valor)}</td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {formatBRL(inv.valorOverage)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={INVOICE_STATUS_INTENT[inv.status] ?? 'neutral'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatDate(inv.pagoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {retryOpen ? (
        <RetryBillingDialog
          tenantId={detail.id}
          plano={detail.plan}
          onClose={() => setRetryOpen(false)}
        />
      ) : null}

      {changePlanOpen ? (
        <ChangePlanDialog
          tenantId={detail.id}
          currentPlano={detail.plan}
          onClose={() => setChangePlanOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ChangePlanDialog({
  tenantId,
  currentPlano,
  onClose,
}: {
  tenantId: string;
  currentPlano: string;
  onClose: () => void;
}) {
  const t = useTranslations('clienteDetalhe');
  const router = useRouter();
  const [novoPlano, setNovoPlano] = useState<'starter' | 'pro' | 'enterprise'>(
    currentPlano === 'pro' || currentPlano === 'enterprise' ? currentPlano : 'starter'
  );
  const [valorEnterprise, setValorEnterprise] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await changePlanAction({
        tenantId,
        novoPlano,
        valorEnterprise:
          novoPlano === 'enterprise' && valorEnterprise ? Number(valorEnterprise) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('changePlanDialog.title')}</DialogTitle>
          <DialogDescription>{t('changePlanDialog.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="change-plano">{t('changePlanDialog.plan')}</Label>
            <select
              id="change-plano"
              value={novoPlano}
              onChange={(e) => setNovoPlano(e.target.value as 'starter' | 'pro' | 'enterprise')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          {novoPlano === 'enterprise' ? (
            <div className="space-y-1.5">
              <Label htmlFor="change-valor">{t('changePlanDialog.enterpriseValue')}</Label>
              <Input
                id="change-valor"
                type="number"
                min="1"
                step="0.01"
                value={valorEnterprise}
                onChange={(e) => setValorEnterprise(e.target.value)}
                required
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('changePlanDialog.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('changePlanDialog.saving') : t('changePlanDialog.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetryBillingDialog({
  tenantId,
  plano,
  onClose,
}: {
  tenantId: string;
  plano: string;
  onClose: () => void;
}) {
  const t = useTranslations('clienteDetalhe');
  const router = useRouter();
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [valorEnterprise, setValorEnterprise] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await retryBillingAction({
        tenantId,
        cpfCnpj,
        valorEnterprise:
          plano === 'enterprise' && valorEnterprise ? Number(valorEnterprise) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('retryDialog.title')}</DialogTitle>
          <DialogDescription>{t('retryDialog.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="retry-cpfcnpj">{t('retryDialog.cpfCnpj')}</Label>
            <Input
              id="retry-cpfcnpj"
              inputMode="numeric"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder={t('retryDialog.cpfCnpjPlaceholder')}
              required
            />
          </div>
          {plano === 'enterprise' ? (
            <div className="space-y-1.5">
              <Label htmlFor="retry-valor">{t('retryDialog.enterpriseValue')}</Label>
              <Input
                id="retry-valor"
                type="number"
                min="1"
                step="0.01"
                value={valorEnterprise}
                onChange={(e) => setValorEnterprise(e.target.value)}
                required
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('retryDialog.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('retryDialog.saving') : t('retryDialog.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
