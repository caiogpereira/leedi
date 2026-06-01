"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import type { KnowledgeEntryRow } from "@leedi/knowledge";

interface Props {
  entries: KnowledgeEntryRow[];
  tenantId: string;
}

export function FaqClient({ entries: initial, tenantId }: Props) {
  const [entries, setEntries] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ pergunta: "", resposta: "" });
  const [newPergunta, setNewPergunta] = useState("");
  const [newResposta, setNewResposta] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleAdd() {
    if (!newPergunta.trim() || !newResposta.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/knowledge/knowledge-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "faq",
          perguntaOuObjecao: newPergunta.trim(),
          respostaOuContorno: newResposta.trim(),
        }),
      });
      if (res.ok) {
        const entry = await res.json();
        setEntries([...entries, entry]);
        setNewPergunta("");
        setNewResposta("");
        setShowForm(false);
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(entry: KnowledgeEntryRow) {
    setEditingId(entry.id);
    setEditDraft({
      pergunta: entry.perguntaOuObjecao,
      resposta: entry.respostaOuContorno,
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/knowledge/knowledge-base/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perguntaOuObjecao: editDraft.pergunta,
          respostaOuContorno: editDraft.resposta,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEntries(entries.map((e) => (e.id === id ? updated : e)));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta FAQ?")) return;
    await fetch(`/api/tenants/${tenantId}/knowledge/knowledge-base/${id}`, {
      method: "DELETE",
    });
    setEntries(entries.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">FAQ</h1>
          <p className="text-sm text-muted-foreground">
            Perguntas frequentes que o agente usará para responder leads.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar FAQ
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
          <h3 className="text-sm font-medium">Nova FAQ</h3>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Pergunta</label>
            <input
              value={newPergunta}
              onChange={(e) => setNewPergunta(e.target.value)}
              placeholder="Digite a pergunta..."
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Resposta</label>
            <textarea
              value={newResposta}
              onChange={(e) => setNewResposta(e.target.value)}
              rows={3}
              placeholder="Digite a resposta..."
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !newPergunta.trim() || !newResposta.trim()}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nenhuma FAQ cadastrada. Adicione perguntas frequentes para o agente responder leads.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border bg-card p-4">
              {editingId === entry.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editDraft.pergunta}
                    onChange={(e) => setEditDraft({ ...editDraft, pergunta: e.target.value })}
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-medium"
                  />
                  <textarea
                    value={editDraft.resposta}
                    onChange={(e) => setEditDraft({ ...editDraft, resposta: e.target.value })}
                    rows={3}
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(entry.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{entry.perguntaOuObjecao}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{entry.respostaOuContorno}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
