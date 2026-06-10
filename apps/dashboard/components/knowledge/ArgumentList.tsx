"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface Props {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  emptyState?: string;
  /** Context for AI improvement — passed to /api/ai/improve-text */
  aiContext?: string;
  tenantId?: string;
}

const EMPTY_DEFAULT = "Nenhum item cadastrado. Adicione itens para fortalecer a venda.";

export function ArgumentList({
  items,
  onChange,
  placeholder = "Digite um novo item...",
  emptyState = EMPTY_DEFAULT,
  aiContext,
  tenantId,
}: Props) {
  const [draft, setDraft] = useState("");
  const [improving, setImproving] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, text]);
    setDraft("");
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  async function improveItem(index: number) {
    if (!aiContext || !tenantId) return;
    const text = items[index];
    if (!text?.trim()) return;

    setImproving(index);
    try {
      const res = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context: aiContext }),
      });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let improved = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        improved += decoder.decode(value, { stream: true });
        updateItem(index, improved);
      }
    } finally {
      setImproving(null);
    }
  }

  // Drag-and-drop reordering (HTML5 drag API)
  function onDragStart(index: number) {
    setDragIndex(index);
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setOverIndex(index);
  }

  function onDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    if (moved === undefined) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    next.splice(dropIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addItem();
      }
    },
    [draft] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{emptyState}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li
              key={i}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={() => onDrop(i)}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
              className={`flex items-start gap-2 rounded-md border bg-background p-2 ${
                overIndex === i ? "border-primary" : ""
              }`}
            >
              <button
                type="button"
                className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
                aria-label="Reordenar"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <textarea
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                rows={2}
                className="flex-1 resize-none bg-transparent text-sm focus:outline-none"
              />
              <div className="flex items-center gap-1">
                {aiContext && (
                  <button
                    type="button"
                    onClick={() => improveItem(i)}
                    disabled={improving === i}
                    className="rounded px-1.5 py-0.5 text-xs text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                    title="Melhorar com IA"
                  >
                    {improving === i ? "..." : "✨"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remover item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
    </div>
  );
}
