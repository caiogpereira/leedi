'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MetricCard } from './metric-card.js';
import { ObjectionAnalyticsSection } from './objection-analytics-section.js';
import { NumberHealthWidget } from './number-health-widget.js';
import { ActiveCampaignWidget } from './active-campaign-widget.js';
import { UsageWidget } from './usage-widget.js';

const POLL_INTERVAL_MS = 60_000;

interface TenantSalesMetrics {
  conversas_iniciadas: number;
  taxa_resposta: number | null;
  conversoes: number;
  valor_total: number;
  ticket_medio: number | null;
  roi_estimado: number | null;
}

interface ObjectionInstance {
  leadName: string | null;
  date: string;
  windowId: string | null;
}

interface ObjectionItem {
  label: string;
  count: number;
  recentInstances: ObjectionInstance[];
}

interface ConnectionHealth {
  status: 'conectado';
  qualityRating: 'verde' | 'amarelo' | 'vermelho' | null;
  messagingTier: '1k' | '10k' | '100k' | 'unlimited' | null;
  displayName: string | null;
}

interface ActiveCampaign {
  id: string;
  nome: string;
  fase: 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';
  dataFim: string | null;
  totalAtivas: number;
  produto: { nome: string; tipo: string } | null;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatROI(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}×`;
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function DashboardClient({ tenantId }: { tenantId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const defaults = getDefaultDateRange();
  const from = searchParams.get('from') ?? defaults.from;
  const to = searchParams.get('to') ?? defaults.to;

  const [metrics, setMetrics] = useState<TenantSalesMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);

  const [objections, setObjections] = useState<ObjectionItem[]>([]);
  const [objectionsLoading, setObjectionsLoading] = useState(true);
  const [objectionsError, setObjectionsError] = useState(false);

  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [campaignError, setCampaignError] = useState(false);

  const [usage, setUsage] = useState<{
    conversasUsadas: number;
    conversasLimite: number;
    overageConversas: number;
    overageValor: string;
    pct: number;
    blocked: boolean;
    periodo: string;
  } | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/tenants/${tenantId}/analytics/sales?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('bad');
      setMetrics(await res.json() as TenantSalesMetrics);
      setMetricsError(false);
    } catch {
      setMetricsError(true);
    } finally {
      setMetricsLoading(false);
    }
  }, [tenantId, from, to]);

  const fetchObjections = useCallback(async () => {
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/tenants/${tenantId}/analytics/objections?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('bad');
      const data = await res.json() as { items: ObjectionItem[] };
      setObjections(data.items);
      setObjectionsError(false);
    } catch {
      setObjectionsError(true);
    } finally {
      setObjectionsLoading(false);
    }
  }, [tenantId, from, to]);

  const fetchConnectionHealth = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/analytics/connection-health`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('bad');
      setConnectionHealth(await res.json() as ConnectionHealth | null);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    } finally {
      setConnectionLoading(false);
    }
  }, [tenantId]);

  const fetchActiveCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/analytics/active-campaign`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('bad');
      setActiveCampaign(await res.json() as ActiveCampaign | null);
      setCampaignError(false);
    } catch {
      setCampaignError(true);
    } finally {
      setCampaignLoading(false);
    }
  }, [tenantId]);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/usage/current`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('bad');
      setUsage(await res.json());
      setUsageError(false);
    } catch {
      setUsageError(true);
    } finally {
      setUsageLoading(false);
    }
  }, [tenantId]);

  // Initial load
  useEffect(() => {
    setMetricsLoading(true);
    setObjectionsLoading(true);
    fetchMetrics();
    fetchObjections();
  }, [fetchMetrics, fetchObjections]);

  useEffect(() => {
    fetchConnectionHealth();
    fetchActiveCampaign();
    fetchUsage();
  }, [fetchConnectionHealth, fetchActiveCampaign, fetchUsage]);

  // Polling (60s)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchMetrics();
      fetchObjections();
      fetchConnectionHealth();
      fetchActiveCampaign();
      fetchUsage();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMetrics, fetchObjections, fetchConnectionHealth, fetchActiveCampaign, fetchUsage]);

  function handleDateChange(field: 'from' | 'to', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(field, value);
    router.replace(`?${params.toString()}`);
  }

  const isEmpty =
    !metricsLoading &&
    !metricsError &&
    metrics?.conversas_iniciadas === 0 &&
    metrics?.conversoes === 0;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="date-from" className="text-muted-foreground">De</label>
          <input
            id="date-from"
            type="date"
            value={from}
            onChange={(e) => handleDateChange('from', e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
          <label htmlFor="date-to" className="text-muted-foreground">Até</label>
          <input
            id="date-to"
            type="date"
            value={to}
            onChange={(e) => handleDateChange('to', e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* Empty state banner */}
      {isEmpty && (
        <div className="rounded border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Nenhuma atividade neste período.
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Conversas iniciadas"
          value={metricsLoading ? '...' : String(metrics?.conversas_iniciadas ?? 0)}
        />
        <MetricCard
          label="Taxa de resposta"
          value={metricsLoading ? '...' : formatPercent(metrics?.taxa_resposta ?? null)}
        />
        <MetricCard
          label="Conversões"
          value={metricsLoading ? '...' : String(metrics?.conversoes ?? 0)}
        />
        <MetricCard
          label="Valor total de vendas"
          value={metricsLoading ? '...' : formatBRL(metrics?.valor_total ?? 0)}
        />
        <MetricCard
          label="Ticket médio"
          value={
            metricsLoading
              ? '...'
              : metrics?.ticket_medio != null
              ? formatBRL(metrics.ticket_medio)
              : '—'
          }
        />
        <MetricCard
          label="ROI estimado"
          value={metricsLoading ? '...' : formatROI(metrics?.roi_estimado ?? null)}
          tooltip="ROI estimado com base em custo fixo de R$0,10 por conversa. O custo real pode variar."
        />
      </div>

      {/* Widgets row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberHealthWidget
          data={connectionHealth}
          loading={connectionLoading}
          error={connectionError}
          onRetry={fetchConnectionHealth}
        />
        <ActiveCampaignWidget
          data={activeCampaign}
          loading={campaignLoading}
          error={campaignError}
          onRetry={fetchActiveCampaign}
        />
        <UsageWidget
          data={usage}
          loading={usageLoading}
          error={usageError}
          onRetry={fetchUsage}
        />
      </div>

      {/* Objection analytics */}
      <ObjectionAnalyticsSection
        items={objections}
        loading={objectionsLoading}
        error={objectionsError}
      />
    </div>
  );
}
