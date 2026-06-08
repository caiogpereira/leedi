'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Send, AlertTriangle, Users, ListChecks } from 'lucide-react';
import { Button } from '@leedi/ui';

interface ThrottleConfig {
  paused_reason?: string;
  tier?: string | null;
}

interface DispatchJob {
  id: string;
  tipo: string;
  status: 'agendado' | 'processando' | 'concluido' | 'pausado' | 'erro';
  agendadoPara: string;
  totalAlvos: number;
  enviados: number;
  falhas: number;
  configThrottle: ThrottleConfig;
}

const STATUS_LABEL: Record<DispatchJob['status'], string> = {
  agendado: 'Agendado',
  processando: 'Processando',
  concluido: 'Concluído',
  pausado: 'Pausado',
  erro: 'Cancelado',
};

const STATUS_BADGE: Record<DispatchJob['status'], string> = {
  agendado: 'bg-blue-100 text-blue-800',
  processando: 'bg-amber-100 text-amber-800',
  concluido: 'bg-green-100 text-green-700',
  pausado: 'bg-yellow-100 text-yellow-800',
  erro: 'bg-red-100 text-red-700',
};

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export function DispatchListClient({ tenantId }: { tenantId: string }) {
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/dispatch-jobs`);
    if (res.ok) setJobs(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const qualityPaused = jobs.some((j) => j.configThrottle?.paused_reason === 'quality_red');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Disparos</h1>
          <p className="text-sm text-muted-foreground">
            Envios de templates em massa e regras de recuperação automática.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/disparos/segmentos">
            <Button variant="outline">
              <Users className="mr-2 h-4 w-4" /> Segmentos
            </Button>
          </Link>
          <Link href="/disparos/regras">
            <Button variant="outline">
              <ListChecks className="mr-2 h-4 w-4" /> Regras
            </Button>
          </Link>
          <Link href="/disparos/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo disparo
            </Button>
          </Link>
        </div>
      </div>

      {qualityPaused && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Qualidade do número VERMELHA</p>
            <p>
              Um ou mais disparos foram pausados automaticamente porque a qualidade do número
              está vermelha. Aguarde a recuperação da qualidade antes de retomar os envios.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Send className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhum disparo agendado ainda.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Agendado para</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progresso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="px-4 py-3">{formatDate(job.agendadoPara)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[job.status]}`}
                    >
                      {STATUS_LABEL[job.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {job.enviados}/{job.totalAlvos} enviados
                    {job.falhas > 0 ? ` · ${job.falhas} falhas` : ''}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/disparos/${job.id}`} className="text-sm text-primary underline">
                      Detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
