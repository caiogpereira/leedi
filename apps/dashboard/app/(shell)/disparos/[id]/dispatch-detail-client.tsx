'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pause } from 'lucide-react';
import { Button } from '@leedi/ui';

interface DispatchJobDetail {
  id: string;
  status: 'agendado' | 'processando' | 'concluido' | 'pausado' | 'erro';
  agendadoPara: string;
  totalAlvos: number;
  enviados: number;
  falhas: number;
  configThrottle: { paused_reason?: string };
  targetCounts: Record<string, number>;
}

const STATUS_LABEL: Record<DispatchJobDetail['status'], string> = {
  agendado: 'Agendado',
  processando: 'Processando',
  concluido: 'Concluído',
  pausado: 'Pausado',
  erro: 'Cancelado',
};

export function DispatchDetailClient({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  const [job, setJob] = useState<DispatchJobDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/dispatch-jobs/${jobId}`);
    if (res.ok) setJob(await res.json());
    setLoading(false);
  }, [tenantId, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh while the job is in flight.
  useEffect(() => {
    if (!job || (job.status !== 'processando' && job.status !== 'agendado')) return;
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [job, load]);

  const pause = useCallback(async () => {
    await fetch(`/api/tenants/${tenantId}/dispatch-jobs/${jobId}/pause`, { method: 'POST' });
    void load();
  }, [tenantId, jobId, load]);

  if (loading) return <p className="p-2 text-sm text-muted-foreground">Carregando…</p>;
  if (!job) return <p className="p-2 text-sm text-muted-foreground">Disparo não encontrado.</p>;

  const pct = job.totalAlvos > 0 ? Math.round((job.enviados / job.totalAlvos) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/disparos" className="inline-flex items-center text-sm text-muted-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Disparo</h1>
          <p className="text-sm text-muted-foreground">
            Agendado para {new Date(job.agendadoPara).toLocaleString('pt-BR')}
          </p>
        </div>
        {(job.status === 'processando' || job.status === 'agendado') && (
          <Button variant="outline" onClick={pause}>
            <Pause className="mr-2 h-4 w-4" /> Pausar
          </Button>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm">
          Status: <span className="font-medium">{STATUS_LABEL[job.status]}</span>
        </p>
        {job.configThrottle?.paused_reason === 'quality_red' && (
          <p className="mt-1 text-sm text-red-600">
            Pausado automaticamente: qualidade do número VERMELHA.
          </p>
        )}

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {job.enviados}/{job.totalAlvos} enviados ({pct}%)
          {job.falhas > 0 ? ` · ${job.falhas} falhas` : ''}
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">Alvos por status</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {Object.entries(job.targetCounts).map(([status, count]) => (
            <li key={status}>
              {status}: {count}
            </li>
          ))}
          {Object.keys(job.targetCounts).length === 0 && <li>Sem alvos ainda.</li>}
        </ul>
      </div>
    </div>
  );
}
