'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle } from '@leedi/ui';
import type { TemplateCategoria, TemplateStatus, Template } from './template-list-client';

interface TemplateLibraryEntry {
  id: string;
  categoriaOcasiao: string;
  titulo: string;
  descricao: string;
  componentesSugeridos: TemplateComponentes;
}

interface TemplateHeaderComp {
  type: 'HEADER';
  format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
}

interface TemplateBodyComp {
  type: 'BODY';
  text: string;
}

interface TemplateFooterComp {
  type: 'FOOTER';
  text: string;
}

interface TemplateButton {
  type: 'URL' | 'QUICK_REPLY';
  text: string;
  url?: string;
}

interface TemplateButtonsComp {
  type: 'BUTTONS';
  buttons: TemplateButton[];
}

export interface TemplateComponentes {
  header?: TemplateHeaderComp;
  body: TemplateBodyComp;
  footer?: TemplateFooterComp;
  buttons?: TemplateButtonsComp;
}

interface TemplateVariavel {
  index: number;
  exemplo: string;
}

/** Full template payload (incl. componentes/variaveis) returned by GET /:id. */
export interface FullTemplate {
  id: string;
  nome: string;
  categoria: TemplateCategoria;
  idioma: string;
  status: TemplateStatus;
  componentes: TemplateComponentes;
  variaveis: TemplateVariavel[];
  metaTemplateId: string | null;
  motivoRejeicao: string | null;
}

interface BuilderProps {
  tenantId: string;
  libraryId?: string | undefined;
  /** When set, the builder edits this existing template (PATCH) instead of creating one. */
  editTemplate?: FullTemplate | undefined;
}

const CATEGORIA_OPTIONS: Array<{ value: TemplateCategoria; label: string }> = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'utility', label: 'Utilidade' },
  { value: 'authentication', label: 'Autenticação' },
];

const HEADER_FORMAT_OPTIONS = [
  { value: 'NONE', label: 'Nenhum' },
  { value: 'TEXT', label: 'Texto' },
  { value: 'IMAGE', label: 'Imagem' },
  { value: 'VIDEO', label: 'Vídeo' },
  { value: 'DOCUMENT', label: 'Documento' },
];

/** Extracts {{N}} variable indices from text. */
function extractVariableIndices(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  const indices = matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10));
  return [...new Set(indices)].sort((a, b) => a - b);
}

export function TemplateBuilderClient({ tenantId, libraryId, editTemplate }: BuilderProps) {
  const router = useRouter();
  const isEdit = Boolean(editTemplate);
  const initComp = editTemplate?.componentes;

  const [nome, setNome] = useState(editTemplate?.nome ?? '');
  const [categoria, setCategoria] = useState<TemplateCategoria>(editTemplate?.categoria ?? 'marketing');
  const [idioma, setIdioma] = useState(editTemplate?.idioma ?? 'pt_BR');
  const [headerFormat, setHeaderFormat] = useState<'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>(
    initComp?.header?.format ?? 'NONE'
  );
  const [headerText, setHeaderText] = useState(initComp?.header?.text ?? '');
  const [bodyText, setBodyText] = useState(initComp?.body.text ?? '');
  const [footerText, setFooterText] = useState(initComp?.footer?.text ?? '');
  const [buttons, setButtons] = useState<TemplateButton[]>(initComp?.buttons?.buttons ?? []);
  const [variaveis, setVariaveis] = useState<TemplateVariavel[]>(editTemplate?.variaveis ?? []);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState<Template | null>(
    editTemplate
      ? ({
          id: editTemplate.id,
          nome: editTemplate.nome,
          categoria: editTemplate.categoria,
          idioma: editTemplate.idioma,
          status: editTemplate.status,
          metaTemplateId: editTemplate.metaTemplateId,
          createdAt: '',
          updatedAt: '',
        } satisfies Template)
      : null
  );
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const prefillFromLibrary = useCallback((entry: TemplateLibraryEntry) => {
    const comps = entry.componentesSugeridos;
    if (comps.header) {
      setHeaderFormat(comps.header.format);
      setHeaderText(comps.header.text ?? '');
    }
    setBodyText(comps.body.text);
    setFooterText(comps.footer?.text ?? '');
    if (comps.buttons) setButtons(comps.buttons.buttons as TemplateButton[]);
    // Suggest a nome based on entry title
    setNome(entry.categoriaOcasiao);
  }, []);

  // Load library template if libraryId is provided
  useEffect(() => {
    if (!libraryId) return;
    fetch(`/api/tenants/${tenantId}/templates/library`)
      .then((r) => r.json())
      .then((entries: TemplateLibraryEntry[]) => {
        const entry = entries.find((e) => e.id === libraryId);
        if (!entry) return;
        prefillFromLibrary(entry);
      })
      .catch(() => {});
  }, [libraryId, tenantId, prefillFromLibrary]);

  // Auto-derive variaveis from body text
  useEffect(() => {
    const indices = extractVariableIndices(bodyText);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derives variable slots from body text while preserving user-entered examples; keyed on bodyText only, not a render cascade
    setVariaveis((prev) => {
      const updated = indices.map((i) => {
        const existing = prev.find((v) => v.index === i);
        return existing ?? { index: i, exemplo: '' };
      });
      return updated;
    });
  }, [bodyText]);

  function buildComponentes(): TemplateComponentes {
    const comps: TemplateComponentes = {
      body: { type: 'BODY', text: bodyText },
    };
    if (headerFormat !== 'NONE') {
      comps.header = { type: 'HEADER', format: headerFormat, ...(headerText && { text: headerText }) };
    }
    if (footerText.trim()) {
      comps.footer = { type: 'FOOTER', text: footerText };
    }
    if (buttons.length > 0) {
      comps.buttons = { type: 'BUTTONS', buttons };
    }
    return comps;
  }

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(
        isEdit
          ? `/api/tenants/${tenantId}/templates/${editTemplate!.id}`
          : `/api/tenants/${tenantId}/templates`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nome,
            categoria,
            idioma,
            componentes: buildComponentes(),
            variaveis,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Erro ao salvar rascunho.');
        return;
      }
      setSavedTemplate(data as Template);
      setSaveSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitToMeta() {
    if (!savedTemplate) return;
    setSubmitting(true);
    setError(null);
    setConfirmSubmitOpen(false);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/templates/${savedTemplate.id}/submit`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Erro ao enviar para aprovação.');
        return;
      }
      router.push('/templates');
    } finally {
      setSubmitting(false);
    }
  }

  function addButton() {
    if (buttons.length >= 2) return;
    setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }]);
  }

  function removeButton(idx: number) {
    setButtons(buttons.filter((_, i) => i !== idx));
  }

  function updateButton(idx: number, patch: Partial<TemplateButton>) {
    setButtons(buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  const canSubmit =
    savedTemplate?.status === 'rascunho' &&
    variaveis.every((v) => v.exemplo.trim() !== '');

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{isEdit ? 'Editar template' : 'Novo template'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEdit
            ? 'Edite o rascunho e salve as alterações antes de enviar para aprovação.'
            : 'Crie um template de mensagem para submeter à Meta para aprovação.'}
        </p>
      </div>

      <form onSubmit={handleSaveDraft} className="space-y-6">
        {/* Nome */}
        <div className="space-y-1">
          <Label htmlFor="nome">Nome do template</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
            placeholder="ex: boas_vindas_curso"
            required
          />
          <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e underscores.</p>
        </div>

        {/* Categoria + Idioma */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="categoria">Categoria</Label>
            <select
              id="categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as TemplateCategoria)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="idioma">Idioma</Label>
            <Input
              id="idioma"
              value={idioma}
              onChange={(e) => setIdioma(e.target.value)}
              placeholder="pt_BR"
            />
          </div>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <Label>Cabeçalho</Label>
          <div className="flex gap-2 flex-wrap">
            {HEADER_FORMAT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setHeaderFormat(o.value as typeof headerFormat)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  headerFormat === o.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input text-muted-foreground hover:bg-accent'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {headerFormat === 'TEXT' && (
            <Input
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="Texto do cabeçalho"
            />
          )}
          {(headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT') && (
            <p className="text-xs text-muted-foreground">
              Você poderá especificar a mídia ao enviar a mensagem.
            </p>
          )}
        </div>

        {/* Body */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Corpo *</Label>
            <div className="flex gap-1">
              {[1, 2, 3].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBodyText((t) => `${t}{{${i}}}`)}
                  className="px-2 py-0.5 rounded text-xs border border-input text-muted-foreground hover:bg-accent"
                >
                  {`{{${i}}}`}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="body"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={5}
            required
            placeholder="Olá, {{1}}! Temos uma oferta especial para você..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />

          {/* Variable examples */}
          {variaveis.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Exemplos de variáveis (obrigatório para envio):
              </p>
              {variaveis.map((v) => (
                <div key={v.index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8">{`{{${v.index}}}`}</span>
                  <Input
                    value={v.exemplo}
                    onChange={(e) =>
                      setVariaveis((prev) =>
                        prev.map((vv) =>
                          vv.index === v.index ? { ...vv, exemplo: e.target.value } : vv
                        )
                      )
                    }
                    placeholder={`Exemplo para {{${v.index}}}`}
                    className="flex-1 h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="space-y-1">
          <Label htmlFor="footer">Rodapé (opcional)</Label>
          <Input
            id="footer"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="Ex: Responda PARAR para sair"
          />
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Botões (opcional, máx. 2)</Label>
            {buttons.length < 2 && (
              <button
                type="button"
                onClick={addButton}
                className="text-xs text-primary hover:underline"
              >
                + Adicionar botão
              </button>
            )}
          </div>
          {buttons.map((btn, idx) => (
            <div key={idx} className="flex gap-2 items-start border rounded-md p-3">
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex gap-2">
                  <select
                    value={btn.type}
                    onChange={(e) => updateButton(idx, { type: e.target.value as TemplateButton['type'] })}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="QUICK_REPLY">Resposta rápida</option>
                    <option value="URL">URL</option>
                  </select>
                  <Input
                    value={btn.text}
                    onChange={(e) => updateButton(idx, { text: e.target.value })}
                    placeholder="Texto do botão"
                    className="flex-1"
                  />
                </div>
                {btn.type === 'URL' && (
                  <Input
                    value={btn.url ?? ''}
                    onChange={(e) => updateButton(idx, { url: e.target.value })}
                    placeholder="https://..."
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => removeButton(idx)}
                className="text-muted-foreground hover:text-destructive text-xs mt-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {saveSuccess && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            {isEdit ? 'Alterações salvas com sucesso!' : 'Rascunho salvo com sucesso!'}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push('/templates')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => setConfirmSubmitOpen(true)}
          >
            {submitting ? 'Enviando...' : 'Enviar para aprovação'}
          </Button>
        </div>
      </form>

      {/* Confirm submit dialog */}
      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para aprovação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O template será enviado para a Meta para avaliação. Após o envio, ele ficará com
            status <strong>Pendente</strong> até ser aprovado ou rejeitado pela Meta.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitToMeta} disabled={submitting}>
              {submitting ? 'Enviando...' : 'Confirmar envio'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
