'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, ListChecks } from 'lucide-react';
import { Button } from '@leedi/ui';

interface Rule {
  id: string;
  nome: string;
  trigger: string;
  ativo: boolean;
}

const TRIGGER_LABEL: Record<string, string> = {
  carrinho_abandonado: 'Carrinho abandonado',
  boleto_gerado: 'Boleto gerado',
  pix_gerado: 'PIX gerado',
  sem_resposta_48h: 'Sem resposta 48h',
  fim_oferta_24h: 'Fim de oferta 24h',
};

export function RulesListClient({ tenantId }: { tenantId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/dispatch-rules`);
    if (res.ok) setRules(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (rule: Rule) => {
      setError(null);
      const res = await fetch(`/api/tenants/${tenantId}/dispatch-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ativo: !rule.ativo }),
      });
      if (res.ok) {
        void load();
      } else {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Falha ao alterar a regra.');
      }
    },
    [tenantId, load]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Regras automáticas</h1>
          <p className="text-sm text-muted-foreground">
            Disparos disparados por eventos (recuperação de carrinho, boleto, PIX).
          </p>
        </div>
        <Link href="/disparos/regras/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Nova regra
          </Button>
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma regra configurada.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Gatilho</th>
                <th className="px-4 py-3">Ativa</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{rule.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TRIGGER_LABEL[rule.trigger] ?? rule.trigger}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggle(rule)}
                      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        rule.ativo ? 'bg-green-500' : 'bg-muted'
                      }`}
                      aria-label={rule.ativo ? 'Desativar regra' : 'Ativar regra'}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          rule.ativo ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
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
