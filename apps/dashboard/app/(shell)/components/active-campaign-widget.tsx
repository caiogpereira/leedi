'use client';

import Link from 'next/link';

type CampaignFase = 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';

interface ActiveCampaign {
  id: string;
  nome: string;
  fase: CampaignFase;
  dataFim: string | null;
  totalAtivas: number;
  produto: { nome: string; tipo: string } | null;
}

interface ActiveCampaignWidgetProps {
  data: ActiveCampaign | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const FASE_LABEL: Record<CampaignFase, string> = {
  aquecimento: 'Aquecimento',
  carrinho_aberto: 'Carrinho aberto',
  downsell: 'Downsell',
  encerrada: 'Encerrada',
};

const FASE_BADGE: Record<CampaignFase, string> = {
  aquecimento: 'bg-blue-100 text-blue-700',
  carrinho_aberto: 'bg-green-100 text-green-700',
  downsell: 'bg-amber-100 text-amber-700',
  encerrada: 'bg-gray-100 text-gray-600',
};

export function daysRemaining(dataFim: string | null, now = Date.now()): number | null {
  if (!dataFim) return null;
  const ts = new Date(dataFim).getTime();
  if (isNaN(ts)) return null;
  const diff = ts - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function ActiveCampaignWidget({
  data,
  loading,
  error,
  onRetry,
}: ActiveCampaignWidgetProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Campanha ativa</p>
        <div className="h-12 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Campanha ativa</p>
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
        <p className="mb-2 text-sm font-semibold">Campanha ativa</p>
        <p className="mb-3 text-sm text-muted-foreground">Nenhuma campanha ativa.</p>
        <Link
          href="/campanhas"
          className="inline-block rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Criar campanha
        </Link>
      </div>
    );
  }

  const days = daysRemaining(data.dataFim);
  const isEncerrada = data.fase === 'encerrada' || (days !== null && days < 0);

  if (isEncerrada) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Campanha ativa</p>
        <p className="mb-1 font-medium">{data.nome}</p>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${FASE_BADGE.encerrada}`}>
          Encerrada
        </span>
        <p className="mt-3 text-sm text-muted-foreground">
          Crie ou ative outra campanha.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <p className="mb-2 text-sm font-semibold">Campanha ativa</p>
      <p className="mb-2 font-medium">{data.nome}</p>
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${FASE_BADGE[data.fase]}`}>
          {FASE_LABEL[data.fase]}
        </span>
        {days !== null && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {days === 0
              ? 'Encerra hoje'
              : days === 1
              ? '1 dia restante'
              : `${days} dias restantes`}
          </span>
        )}
        {days === null && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            Sem data de encerramento
          </span>
        )}
      </div>
      {data.produto && (
        <p className="mt-2 text-xs text-muted-foreground">
          Produto: {data.produto.nome}
        </p>
      )}
      {data.totalAtivas > 1 && (
        <p className="mt-2 text-xs text-muted-foreground">
          (+{data.totalAtivas - 1} {data.totalAtivas - 1 === 1 ? 'outra ativa' : 'outras ativas'})
        </p>
      )}
    </div>
  );
}
