'use client';

import Link from 'next/link';

interface UsageCounter {
  periodo: string;
  conversasUsadas: number;
  conversasLimite: number;
  overageConversas: number;
  overageValor: string;
  pct: number;
  blocked: boolean;
}

interface UsageWidgetProps {
  data: UsageCounter | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

function progressBarColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 95) return 'bg-orange-500';
  if (pct >= 80) return 'bg-amber-500';
  return 'bg-green-500';
}

function formatOverageValor(valor: string): string {
  const num = parseFloat(valor);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

export function UsageWidget({ data, loading, error, onRetry }: UsageWidgetProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Uso do plano</p>
        <div className="h-12 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error || data === null) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Uso do plano</p>
        <p className="text-sm text-muted-foreground">Dados de uso indisponíveis.</p>
        <button
          onClick={onRetry}
          className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { conversasUsadas, conversasLimite, overageConversas, overageValor, pct } = data;
  const barColor = progressBarColor(pct);
  const barWidth = Math.min(pct, 100);
  const hasOverage = overageConversas > 0;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Uso do plano</p>
        <Link
          href="/uso"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Ver histórico
        </Link>
      </div>

      <p className="mb-1 text-sm text-muted-foreground">
        {conversasUsadas.toLocaleString('pt-BR')} / {conversasLimite.toLocaleString('pt-BR')} conversas ({pct}%)
      </p>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Overage row */}
      {hasOverage && (
        <p className="mt-2 text-xs text-orange-600">
          Conversas excedentes: {overageConversas.toLocaleString('pt-BR')} ({formatOverageValor(overageValor)} extra)
        </p>
      )}
    </div>
  );
}
