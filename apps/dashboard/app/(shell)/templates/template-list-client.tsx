'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { Button } from '@leedi/ui';

export type TemplateStatus = 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' | 'pausado';
export type TemplateCategoria = 'marketing' | 'utility' | 'authentication';

export interface Template {
  id: string;
  nome: string;
  categoria: TemplateCategoria;
  idioma: string;
  status: TemplateStatus;
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<TemplateStatus, string> = {
  rascunho: 'Rascunho',
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  pausado: 'Pausado',
};

const STATUS_BADGE: Record<TemplateStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  pendente: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-green-100 text-green-700',
  rejeitado: 'bg-red-100 text-red-700',
  pausado: 'bg-orange-100 text-orange-800',
};

const CATEGORIA_LABEL: Record<TemplateCategoria, string> = {
  marketing: 'Marketing',
  utility: 'Utilidade',
  authentication: 'Autenticação',
};

const STATUS_FILTER_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
  { value: 'pausado', label: 'Pausado' },
];

function StatusBadge({ status }: { status: TemplateStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TemplateListClient({ tenantId }: { tenantId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('');

  const load = useCallback(
    async (status: string) => {
      setLoading(true);
      try {
        const url = status
          ? `/api/tenants/${tenantId}/templates?status=${status}`
          : `/api/tenants/${tenantId}/templates`;
        const res = await fetch(url);
        if (res.ok) setTemplates(await res.json());
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-filter-change; load() is a stable useCallback, not a render cascade
    load(activeFilter);
  }, [load, activeFilter]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus templates de mensagem WhatsApp
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/templates/biblioteca`}>
            <Button variant="outline">Biblioteca</Button>
          </Link>
          <Link href={`/templates/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo template
            </Button>
          </Link>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {STATUS_FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeFilter === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-12 text-center">Carregando...</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">
            {activeFilter
              ? `Nenhum template com status "${STATUS_LABEL[activeFilter as TemplateStatus]}".`
              : 'Nenhum template criado. Crie seu primeiro template para disparos.'}
          </p>
          {!activeFilter && (
            <Link href="/templates/new">
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Novo template
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Categoria</th>
                <th className="px-4 py-3 text-left font-medium">Idioma</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/templates/${t.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {CATEGORIA_LABEL[t.categoria]}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.idioma}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
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
