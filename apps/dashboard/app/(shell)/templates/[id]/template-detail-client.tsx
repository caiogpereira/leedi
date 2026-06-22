'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@leedi/ui';
import type { TemplateStatus, TemplateCategoria } from '../template-list-client';
import { TemplateBuilderClient, type FullTemplate } from '../template-builder-client';

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

export function TemplateDetailClient({
  tenantId,
  templateId,
}: {
  tenantId: string;
  templateId: string;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState<FullTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/templates/${templateId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) setTemplate((await res.json()) as FullTemplate);
    } finally {
      setLoading(false);
    }
  }, [tenantId, templateId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is a stable useCallback, not a render cascade
    load();
  }, [load]);

  // AC#7: editing an already-submitted/approved template creates a NEW draft copy
  // (the current version is kept) via POST /:id/duplicate.
  async function handleDuplicate() {
    setDuplicating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/templates/${templateId}/duplicate`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Erro ao criar nova versão.');
        return;
      }
      setConfirmEditOpen(false);
      router.push(`/templates/${(data as { id: string }).id}`);
    } finally {
      setDuplicating(false);
    }
  }

  function handleEditClick() {
    if (!template) return;
    if (template.status === 'rascunho') {
      setEditing(true);
    } else {
      setConfirmEditOpen(true);
    }
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground text-sm">Carregando...</div>;
  }

  if (notFound || !template) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground text-sm">Template não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/templates')}>
          Voltar para templates
        </Button>
      </div>
    );
  }

  // Edit mode (rascunho only) — reuse the builder in PATCH mode.
  if (editing && template.status === 'rascunho') {
    return <TemplateBuilderClient tenantId={tenantId} editTemplate={template} />;
  }

  const { componentes } = template;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{template.nome}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[template.status]}`}
            >
              {STATUS_LABEL[template.status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {CATEGORIA_LABEL[template.categoria]} · {template.idioma}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/templates')}>
            Voltar
          </Button>
          <Button onClick={handleEditClick}>Editar</Button>
        </div>
      </div>

      {template.status === 'rejeitado' && template.motivoRejeicao && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-6">
          <strong>Motivo da rejeição:</strong> {template.motivoRejeicao}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
          {error}
        </div>
      )}

      {/* Read-only preview */}
      <div className="rounded-md border divide-y">
        {componentes.header && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Cabeçalho</p>
            <p className="text-sm">
              {componentes.header.format === 'TEXT'
                ? componentes.header.text
                : `Mídia (${componentes.header.format})`}
            </p>
          </div>
        )}
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Corpo</p>
          <p className="text-sm whitespace-pre-wrap">{componentes.body.text}</p>
        </div>
        {componentes.footer && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Rodapé</p>
            <p className="text-sm">{componentes.footer.text}</p>
          </div>
        )}
        {componentes.buttons && componentes.buttons.buttons.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Botões</p>
            <div className="flex flex-wrap gap-2">
              {componentes.buttons.buttons.map((b, i) => (
                <span key={i} className="rounded border px-2 py-1 text-xs">
                  {b.text}
                  {b.type === 'URL' && b.url ? ` → ${b.url}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
        {template.variaveis.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Variáveis</p>
            <div className="flex flex-col gap-1">
              {template.variaveis.map((v) => (
                <span key={v.index} className="text-sm text-muted-foreground">
                  {`{{${v.index}}}`}: {v.exemplo}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AC#7 warning modal — editing a non-draft template creates a new version */}
      <Dialog open={confirmEditOpen} onOpenChange={setConfirmEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Editar um template aprovado criará uma nova versão para revisão. A versão atual
            continuará aprovada até a nova ser avaliada pela Meta.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDuplicate} disabled={duplicating}>
              {duplicating ? 'Criando...' : 'Criar nova versão'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
