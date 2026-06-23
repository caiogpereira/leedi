'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Badge,
  Avatar,
} from '@leedi/ui';
import type { BadgeProps } from '@leedi/ui';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import type { TenantDetail } from '@leedi/tenancy';
import { ImpersonateButton } from './ImpersonateButton';
import {
  createTenantAction,
  blockTenantAction,
  unblockTenantAction,
} from './actions';

/** A tenant row augmented with the per-client margin computed on the server. */
type TenantRow = TenantDetail & { marginPct: number | null };

const STATUS_INTENT: Record<string, NonNullable<BadgeProps['variant']>> = {
  trial: 'info',
  active: 'success',
  blocked: 'danger',
  cancelled: 'neutral',
};

function formatBRL(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function ClientesClient({
  tenants,
  dashboardUrl,
}: {
  tenants: TenantRow[];
  dashboardUrl: string;
}) {
  const t = useTranslations('clientes');
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{ tenant: TenantRow; mode: 'block' | 'unblock' } | null>(
    null
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((tenant) => tenant.name.toLowerCase().includes(q));
  }, [search, tenants]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('create.button')}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="pl-9"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t('columns.name')}</th>
                <th className="py-2 pr-4 font-medium">{t('columns.plan')}</th>
                <th className="py-2 pr-4 font-medium">{t('columns.status')}</th>
                <th className="py-2 pr-4 text-right font-medium">{t('columns.value')}</th>
                <th className="py-2 pr-4 text-right font-medium">{t('columns.overage')}</th>
                <th className="py-2 pr-4 text-right font-medium">{t('columns.margin')}</th>
                <th className="py-2 pr-4 font-medium">{t('columns.lastPayment')}</th>
                <th className="py-2 pr-4 font-medium">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => (
                <tr key={tenant.id} className="border-b hover:bg-surface-2">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/clientes/${tenant.id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Avatar name={tenant.name} size="sm" />
                      {tenant.name}
                      {tenant.billingStatus === 'pendente_configuracao' ? (
                        <span title={t('billingPending')} className="inline-flex">
                          <AlertTriangle
                            className="h-4 w-4 text-amber-500"
                            aria-label={t('billingPending')}
                          />
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 capitalize text-muted-foreground">{tenant.plan}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={STATUS_INTENT[tenant.status] ?? 'neutral'}>
                      {t(`status.${tenant.status}` as Parameters<typeof t>[0])}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-right">{formatBRL(tenant.subscriptionValor)}</td>
                  <td className="py-3 pr-4 text-right text-muted-foreground">
                    {formatBRL(tenant.overageValor)}
                  </td>
                  <td className="py-3 pr-4 text-right text-muted-foreground">
                    {formatPct(tenant.marginPct)}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{formatDate(tenant.lastPayment)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <ImpersonateButton
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        dashboardUrl={dashboardUrl}
                      />
                      {tenant.status === 'blocked' ? (
                        <button
                          type="button"
                          onClick={() => setBlockTarget({ tenant, mode: 'unblock' })}
                          className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                        >
                          {t('actions.unblock')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setBlockTarget({ tenant, mode: 'block' })}
                          className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          {t('actions.block')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <CreateTenantDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => router.refresh()}
        />
      ) : null}

      {blockTarget ? (
        <BlockDialog
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
          onDone={() => {
            setBlockTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateTenantDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('clientes');
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [plano, setPlano] = useState<'starter' | 'pro' | 'enterprise'>('starter');
  const [valorEnterprise, setValorEnterprise] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await createTenantAction({
        name,
        ownerEmail,
        cpfCnpj,
        plano,
        valorEnterprise:
          plano === 'enterprise' && valorEnterprise ? Number(valorEnterprise) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.billingFailed) {
        // Tenant exists but billing setup failed — keep the dialog open with a warning.
        setWarning(t('create.billingFailed'));
        onCreated();
        return;
      }
      onOpenChange(false);
      onCreated();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">{t('create.name')}</Label>
            <Input
              id="tenant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-email">{t('create.ownerEmail')}</Label>
            <Input
              id="tenant-email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-cpfcnpj">{t('create.cpfCnpj')}</Label>
            <Input
              id="tenant-cpfcnpj"
              inputMode="numeric"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder={t('create.cpfCnpjPlaceholder')}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-plano">{t('create.plan')}</Label>
            <select
              id="tenant-plano"
              value={plano}
              onChange={(e) => setPlano(e.target.value as 'starter' | 'pro' | 'enterprise')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="starter">{t('plans.starter')}</option>
              <option value="pro">{t('plans.pro')}</option>
              <option value="enterprise">{t('plans.enterprise')}</option>
            </select>
          </div>
          {plano === 'enterprise' ? (
            <div className="space-y-1.5">
              <Label htmlFor="tenant-valor">{t('create.enterpriseValue')}</Label>
              <Input
                id="tenant-valor"
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
          {warning ? (
            <p className="flex items-start gap-2 text-sm text-amber-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {warning}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('create.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('create.saving') : t('create.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({
  target,
  onClose,
  onDone,
}: {
  target: { tenant: TenantDetail; mode: 'block' | 'unblock' };
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('clientes');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isBlock = target.mode === 'block';

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const action = isBlock ? blockTenantAction : unblockTenantAction;
      const result = await action({ tenantId: target.tenant.id, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBlock ? t('block.title') : t('unblock.title')}
          </DialogTitle>
          <DialogDescription>
            {isBlock
              ? t('block.description', { name: target.tenant.name })
              : t('unblock.description', { name: target.tenant.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="block-reason">{t('block.reasonLabel')}</Label>
          <Textarea
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t('block.reasonPlaceholder')}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('block.cancel')}
          </Button>
          <Button
            type="button"
            variant={isBlock ? 'destructive' : 'default'}
            disabled={pending || reason.trim().length < 10}
            onClick={handleConfirm}
          >
            {pending ? t('block.saving') : isBlock ? t('actions.block') : t('actions.unblock')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
