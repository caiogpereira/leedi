'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UsageRecord {
  periodo: string;
  conversasUsadas: number;
  conversasLimite: number;
  overageConversas: number;
  overageValor: string;
  pct: number;
  blocked: boolean;
}

function formatPeriodo(periodo: string): string {
  const [year, month] = periodo.split('-');
  if (!year || !month) return periodo;
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function formatBRL(valor: string): string {
  const num = parseFloat(valor);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

export function UsageHistoryClient({ tenantId }: { tenantId: string }) {
  const [history, setHistory] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/usage/history?limit=6`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('bad');
        return r.json() as Promise<UsageRecord[]>;
      })
      .then((data) => {
        setHistory(data);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Histórico de Uso</h1>
        <Link
          href="/settings/uso"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Configurar alertas →
        </Link>
      </div>

      {loading && <div className="h-40 animate-pulse rounded-lg bg-muted" />}

      {!loading && error && (
        <p className="text-sm text-muted-foreground">Dados de uso indisponíveis.</p>
      )}

      {!loading && !error && history.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum registro de uso encontrado.</p>
      )}

      {!loading && !error && history.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Conversas usadas</th>
                <th className="px-4 py-3 font-medium">Limite</th>
                <th className="px-4 py-3 font-medium">Excedentes</th>
                <th className="px-4 py-3 font-medium">Valor excedente</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.periodo} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 capitalize">{formatPeriodo(row.periodo)}</td>
                  <td className="px-4 py-3">
                    {row.conversasUsadas.toLocaleString('pt-BR')}
                    <span className="ml-1 text-xs text-muted-foreground">({row.pct}%)</span>
                  </td>
                  <td className="px-4 py-3">{row.conversasLimite.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    {row.overageConversas > 0 ? (
                      <span className="text-orange-600">{row.overageConversas.toLocaleString('pt-BR')}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.overageConversas > 0 ? (
                      <span className="text-orange-600">{formatBRL(row.overageValor)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
