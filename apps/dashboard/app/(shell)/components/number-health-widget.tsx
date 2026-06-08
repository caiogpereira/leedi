'use client';

import Link from 'next/link';

type QualityRating = 'verde' | 'amarelo' | 'vermelho';
type MessagingTier = '1k' | '10k' | '100k' | 'unlimited';

interface ConnectionHealth {
  status: 'conectado';
  qualityRating: QualityRating | null;
  messagingTier: MessagingTier | null;
  displayName: string | null;
}

interface NumberHealthWidgetProps {
  data: ConnectionHealth | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const QUALITY_LABEL: Record<QualityRating, string> = {
  verde: 'Verde',
  amarelo: 'Amarelo',
  vermelho: 'Vermelho',
};

const TIER_LABEL: Record<MessagingTier, string> = {
  '1k': 'Tier 1k',
  '10k': 'Tier 10k',
  '100k': 'Tier 100k',
  unlimited: 'Ilimitado',
};

const QUALITY_BADGE: Record<QualityRating, string> = {
  verde: 'bg-green-100 text-green-700',
  amarelo: 'bg-amber-100 text-amber-700',
  vermelho: 'bg-red-100 text-red-700',
};

const QUALITY_BORDER: Record<QualityRating, string> = {
  verde: '',
  amarelo: 'border-amber-400',
  vermelho: 'border-red-400',
};

export function NumberHealthWidget({
  data,
  loading,
  error,
  onRetry,
}: NumberHealthWidgetProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Saúde do número</p>
        <div className="h-12 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Saúde do número</p>
        <p className="text-sm text-muted-foreground">Dados indisponíveis. Tente novamente.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs text-primary underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Saúde do número</p>
        <p className="mb-3 text-sm text-muted-foreground">Número não conectado.</p>
        <Link
          href="/settings/whatsapp"
          className="inline-block rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Conectar número
        </Link>
      </div>
    );
  }

  const quality = data.qualityRating;
  const hasWarning = quality === 'amarelo' || quality === 'vermelho';
  const borderClass = quality ? QUALITY_BORDER[quality] : '';

  return (
    <div className={`rounded-lg border bg-card p-5 shadow-sm ${borderClass ? `border-2 ${borderClass}` : ''}`}>
      <p className="mb-3 text-sm font-semibold">Saúde do número</p>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
          Conectado
        </span>
        {quality && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${QUALITY_BADGE[quality]}`}
          >
            {QUALITY_LABEL[quality]}
          </span>
        )}
        {data.messagingTier && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {TIER_LABEL[data.messagingTier]}
          </span>
        )}
      </div>
      {data.displayName && (
        <p className="mt-2 text-xs text-muted-foreground">{data.displayName}</p>
      )}
      {hasWarning && (
        <p className="mt-3 text-xs text-amber-700">
          Qualidade do número em queda.{' '}
          <Link href="/settings/whatsapp" className="underline">
            Verifique em Configurações → WhatsApp.
          </Link>
        </p>
      )}
    </div>
  );
}
