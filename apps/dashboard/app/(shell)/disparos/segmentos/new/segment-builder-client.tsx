'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Eye } from 'lucide-react';
import { Button, Input, Label } from '@leedi/ui';

type FilterType = 'comprou' | 'tag' | 'origem' | 'periodo';

interface FilterRow {
  key: string;
  type: FilterType;
  value: string; // for comprou: 'true'|'false'; tag: comma list; origem: text; periodo: 'inicio|fim'
}

interface PreviewLead {
  id: string;
  nome: string | null;
  telefone: string;
  tags: string[];
}

const TYPE_LABELS: Record<FilterType, string> = {
  comprou: 'Comprou',
  tag: 'Tag',
  origem: 'Origem',
  periodo: 'Período de captura',
};

let rowSeq = 0;
function newRow(type: FilterType): FilterRow {
  rowSeq += 1;
  return { key: `row-${rowSeq}`, type, value: type === 'comprou' ? 'true' : '' };
}

function rowsToFiltros(rows: FilterRow[]): Record<string, unknown> {
  const filtros: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.type === 'comprou') {
      filtros.comprou = row.value === 'true';
    } else if (row.type === 'tag') {
      const tags = row.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) filtros.tag = tags;
    } else if (row.type === 'origem') {
      if (row.value.trim()) filtros.origem = row.value.trim();
    } else if (row.type === 'periodo') {
      const [inicio, fim] = row.value.split('|');
      if (inicio) filtros.data_captura_inicio = new Date(inicio).toISOString();
      if (fim) filtros.data_captura_fim = new Date(fim).toISOString();
    }
  }
  return filtros;
}

export function SegmentBuilderClient({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [rows, setRows] = useState<FilterRow[]>([newRow('comprou')]);
  const [preview, setPreview] = useState<{ count: number; leads: PreviewLead[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFilters = rowsToFiltros(rows) && Object.keys(rowsToFiltros(rows)).length > 0;

  const updateRow = useCallback((key: string, patch: Partial<FilterRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const runPreview = useCallback(async () => {
    setPreviewing(true);
    setError(null);
    const res = await fetch(`/api/tenants/${tenantId}/segments/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filtros: rowsToFiltros(rows) }),
    });
    if (res.ok) {
      setPreview(await res.json());
    } else {
      setError('Falha ao visualizar os leads.');
    }
    setPreviewing(false);
  }, [tenantId, rows]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tenants/${tenantId}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome, filtros: rowsToFiltros(rows) }),
    });
    if (res.ok) {
      router.push('/disparos/segmentos');
      return;
    }
    const payload = await res.json().catch(() => ({}));
    setError(payload.error ?? 'Falha ao salvar o segmento.');
    setSaving(false);
  }, [tenantId, nome, rows, router]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Novo segmento</h1>
        <p className="text-sm text-muted-foreground">
          Defina filtros para construir o público dinâmico.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nome">Nome do segmento</Label>
        <Input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Leads quentes que não compraram"
        />
      </div>

      <div className="space-y-3">
        <Label>Filtros</Label>
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={row.type}
              onChange={(e) =>
                updateRow(row.key, {
                  type: e.target.value as FilterType,
                  value: e.target.value === 'comprou' ? 'true' : '',
                })
              }
            >
              {(Object.keys(TYPE_LABELS) as FilterType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>

            {row.type === 'comprou' && (
              <select
                className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                value={row.value}
                onChange={(e) => updateRow(row.key, { value: e.target.value })}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            )}
            {row.type === 'tag' && (
              <Input
                className="flex-1"
                placeholder="tags separadas por vírgula"
                value={row.value}
                onChange={(e) => updateRow(row.key, { value: e.target.value })}
              />
            )}
            {row.type === 'origem' && (
              <Input
                className="flex-1"
                placeholder="ex.: webinar"
                value={row.value}
                onChange={(e) => updateRow(row.key, { value: e.target.value })}
              />
            )}
            {row.type === 'periodo' && (
              <div className="flex flex-1 gap-2">
                <Input
                  type="date"
                  value={row.value.split('|')[0] ?? ''}
                  onChange={(e) =>
                    updateRow(row.key, {
                      value: `${e.target.value}|${row.value.split('|')[1] ?? ''}`,
                    })
                  }
                />
                <Input
                  type="date"
                  value={row.value.split('|')[1] ?? ''}
                  onChange={(e) =>
                    updateRow(row.key, {
                      value: `${row.value.split('|')[0] ?? ''}|${e.target.value}`,
                    })
                  }
                />
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              aria-label="Remover filtro"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button variant="outline" type="button" onClick={() => setRows((prev) => [...prev, newRow('tag')])}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar filtro
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button variant="outline" type="button" onClick={runPreview} disabled={previewing}>
          <Eye className="mr-2 h-4 w-4" /> {previewing ? 'Visualizando…' : 'Visualizar leads'}
        </Button>
        <Button type="button" onClick={save} disabled={!nome.trim() || !hasFilters || saving}>
          {saving ? 'Salvando…' : 'Salvar segmento'}
        </Button>
      </div>

      {preview && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">
            ~{preview.count} {preview.count === 1 ? 'lead' : 'leads'} no segmento
          </p>
          {preview.leads.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {preview.leads.slice(0, 10).map((l) => (
                <li key={l.id}>
                  {l.nome ?? 'Sem nome'} — {l.telefone}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
