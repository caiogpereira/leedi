'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { Button } from '@leedi/ui';

interface Segment {
  id: string;
  nome: string;
  filtros: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function describeFiltros(filtros: Record<string, unknown>): string {
  const parts: string[] = [];
  if (filtros.comprou === true) parts.push('Comprou');
  if (filtros.comprou === false) parts.push('Não comprou');
  if (Array.isArray(filtros.tag) && filtros.tag.length > 0)
    parts.push(`Tags: ${(filtros.tag as string[]).join(', ')}`);
  if (typeof filtros.origem === 'string' && filtros.origem) parts.push(`Origem: ${filtros.origem}`);
  if (filtros.data_captura_inicio || filtros.data_captura_fim) parts.push('Período de captura');
  return parts.length > 0 ? parts.join(' · ') : 'Sem filtros';
}

export function SegmentListClient({ tenantId }: { tenantId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/segments`);
    if (res.ok) setSegments(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is a stable useCallback, not a render cascade
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Segmentos</h1>
          <p className="text-sm text-muted-foreground">
            Listas dinâmicas de leads usadas como público dos disparos.
          </p>
        </div>
        <Link href="/disparos/segmentos/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Novo segmento
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : segments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum segmento criado ainda.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Filtros</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{s.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {describeFiltros(s.filtros)}
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
