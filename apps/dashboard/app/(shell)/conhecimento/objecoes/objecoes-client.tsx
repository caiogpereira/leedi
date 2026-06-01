"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import type { KnowledgeEntryRow } from "@leedi/knowledge";

const CATEGORIAS = [
  { value: "preco", label: "Preço" },
  { value: "tempo", label: "Tempo" },
  { value: "capacidade", label: "Capacidade" },
  { value: "outros", label: "Outros" },
];

interface Props {
  entries: KnowledgeEntryRow[];
  tenantId: string;
}

export function ObjecoesClient({ entries: initial, tenantId }: Props) {
  const [entries, setEntries] = useState(initial);
  const [filterCategoria, setFilterCategoria] = useState<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    objecao: "",
    contorno: "",
    categoria: "",
  });
  const [newObjecao, setNewObjecao] = useState("");
  const [newContorno, setNewContorno] = useState("");
  const [newCategoria, setNewCategoria] = useState("preco");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = filterCategoria
    ? entries.filter((e) => e.categoria === filterCategoria)
    : entries;

  async function handleAdd() {
    if (!newObjecao.trim() || !newContorno.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/knowledge/knowledge-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "objecao",
          perguntaOuObjecao: newObjecao.trim(),
          respostaOuContorno: newContorno.trim(),
          categoria: newCategoria,
        }),
      });
      if (res.ok) {
        const entry = await res.json();
        setEntries([...entries, entry]);
        setNewObjecao("");
        setNewContorno("");
        setShowForm(false);
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(entry: KnowledgeEntryRow) {
    setEditingId(entry.id);
    setEditDraft({
      objecao: entry.perguntaOuObjecao,
      contorno: entry.respostaOuContorno,
      categoria: entry.categoria ?? "outros",
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/knowledge/knowledge-base/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perguntaOuObjecao: editDraft.objecao,
          respostaOuContorno: editDraft.contorno,
          categoria: editDraft.categoria,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEntries(entries.map((e) => (e.id === id ? updated : e)));
        setEditingId(null);
        showToast("Contorno atualizado com sucesso.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta objeção?")) return;
    await fetch(`/api/tenants/${tenantId}/knowledge/knowledge-base/${id}`, {
      method: "DELETE",
    });
    setEntries(entries.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      {toast && (
        <div className="fixed bottom-4 right-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 shadow-md">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Objeções</h1>
          <p className="text-sm text-muted-foreground">
            Contornos para objeções que o agente usará durante vendas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar objeção
        </button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Filtrar:</span>
        <button
          type="button"
          onClick={() => setFilterCategoria(undefined)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${!filterCategoria ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          Todas
        </button>
        {CATEGORIAS.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setFilterCategoria(cat.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filterCategoria === cat.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
          <h3 className="text-sm font-medium">Nova objeção</h3>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Categoria</label>
            <select
              value={newCategoria}
              onChange={(e) => setNewCategoria(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIAS.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Objeção</label>
            <input
              value={newObjecao}
              onChange={(e) => setNewObjecao(e.target.value)}
              placeholder="Ex: É muito caro"
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Contorno</label>
            <textarea
              value={newContorno}
              onChange={(e) => setNewContorno(e.target.value)}
              rows={3}
              placeholder="Como o agente deve responder a essa objeção..."
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !newObjecao.trim() || !newContorno.trim()}
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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nenhuma objeção cadastrada{filterCategoria ? ` para esta categoria` : ""}.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((entry) => (
            <div key={entry.id} className="rounded-lg border bg-card p-4">
              {editingId === entry.id ? (
                <div className="flex flex-col gap-2">
                  <select
                    value={editDraft.categoria}
                    onChange={(e) => setEditDraft({ ...editDraft, categoria: e.target.value })}
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  <input
                    value={editDraft.objecao}
                    onChange={(e) => setEditDraft({ ...editDraft, objecao: e.target.value })}
                    className="rounded-md border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <textarea
                    value={editDraft.contorno}
                    onChange={(e) => setEditDraft({ ...editDraft, contorno: e.target.value })}
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
                    <div className="flex items-center gap-2 mb-1">
                      {entry.categoria && (
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          {CATEGORIAS.find((c) => c.value === entry.categoria)?.label ?? entry.categoria}
                        </span>
                      )}
                    </div>
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
