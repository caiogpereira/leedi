"use client";

import { useCallback, useState } from "react";
import { Loader2, X, AlertCircle, Plus } from "lucide-react";
import type { LeadDetail } from "@leedi/lead";

type LeadTemperatura = LeadDetail["temperatura"];
type LeadStatus = LeadDetail["status"];
type Tag = LeadDetail["tags"][number];
type JourneyEvent = LeadDetail["journeyEvents"][number];

const TEMPERATURA_BADGE: Record<LeadTemperatura, string> = {
  frio: "bg-gray-100 text-gray-700",
  morno: "bg-amber-100 text-amber-800",
  quente: "bg-red-100 text-red-700",
};

const TEMPERATURA_LABEL: Record<LeadTemperatura, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

const STATUS_BADGE: Record<LeadStatus, string> = {
  ativo: "bg-green-100 text-green-700",
  optout: "bg-gray-100 text-gray-600",
  bloqueado: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  ativo: "Ativo",
  optout: "Opt-out",
  bloqueado: "Bloqueado",
};

// Journey event labels. Falls back to the raw tipo for unmapped events.
const TIPO_LABEL: Record<string, string> = {
  captado: "Lead captado",
  abordado: "Lead abordado",
  respondeu: "Lead respondeu",
  objecao: "Objeção registrada",
  interesse: "Interesse demonstrado",
  comprou: "Compra realizada",
  optout: "Opt-out",
  reativado: "Lead reativado",
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: Date): string {
  // Intl emits "DD/MM/YYYY, HH:mm" for pt-BR; we drop the comma the locale
  // inserts between date and time.
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", "");
}

function stringifyDetalheValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Interactive lead-detail surface (Story 5.4).
 *
 * Receives the server-fetched lead as initialLead and owns the mutable parts:
 * tags, status, and the journey timeline. All mutations are optimistic and roll
 * back on API error.
 *
 * - Tag add: insert a placeholder row, then reconcile its temp id with the row
 *   returned by the API (so a subsequent remove sends the real id).
 * - Tag remove: drop the chip immediately, restore the previous list on error.
 * - Opt-out / reactivate: window.confirm for opt-out, PATCH the status route,
 *   then update status (showing the banner) and prepend the journey event the
 *   server recorded. operadorId is never sent — the API derives it from session.
 */
export function LeadDetailClient({
  initialLead,
  tenantId,
}: {
  initialLead: LeadDetail;
  tenantId: string;
}) {
  const lead = initialLead;

  const [tags, setTags] = useState<Tag[]>(initialLead.tags);
  const [status, setStatus] = useState<LeadStatus>(initialLead.status);
  const [journeyEvents, setJourneyEvents] = useState<JourneyEvent[]>(
    initialLead.journeyEvents
  );

  const [newTag, setNewTag] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagsBase = `/api/tenants/${tenantId}/leads/${lead.id}/tags`;
  const statusUrl = `/api/tenants/${tenantId}/leads/${lead.id}/status`;

  const onAddTag = useCallback(async () => {
    const value = newTag.trim();
    if (!value || isAddingTag) return;

    setError(null);
    setIsAddingTag(true);

    // Optimistic insert with a temporary id; reconciled with the server row below.
    const tempId = `temp-${Date.now()}`;
    const optimistic: Tag = {
      id: tempId,
      tag: value,
      origemTag: "manual",
      createdAt: new Date(),
    };
    setTags((prev) => [...prev, optimistic]);
    setNewTag("");

    try {
      const response = await fetch(tagsBase, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag: value }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        // Roll back the optimistic insert.
        setTags((prev) => prev.filter((t) => t.id !== tempId));
        setError(payload?.error ?? "Falha ao adicionar a tag.");
        return;
      }

      const created = (await response.json()) as Tag;
      // Reconcile: swap the temp row for the real one (real id + createdAt).
      setTags((prev) =>
        prev.map((t) =>
          t.id === tempId
            ? {
                id: created.id,
                tag: created.tag,
                origemTag: "manual",
                createdAt: new Date(created.createdAt),
              }
            : t
        )
      );
    } catch {
      setTags((prev) => prev.filter((t) => t.id !== tempId));
      setError("Erro de rede ao adicionar a tag.");
    } finally {
      setIsAddingTag(false);
    }
  }, [newTag, isAddingTag, tagsBase]);

  const onRemoveTag = useCallback(
    async (tagId: string) => {
      // Cannot delete a not-yet-persisted tag (temp id).
      if (tagId.startsWith("temp-")) return;

      setError(null);
      const previous = tags;
      // Optimistic removal.
      setTags((prev) => prev.filter((t) => t.id !== tagId));

      try {
        const response = await fetch(`${tagsBase}/${tagId}`, { method: "DELETE" });
        if (!response.ok && response.status !== 204) {
          setTags(previous);
          setError("Falha ao remover a tag.");
        }
      } catch {
        setTags(previous);
        setError("Erro de rede ao remover a tag.");
      }
    },
    [tags, tagsBase]
  );

  const changeStatus = useCallback(
    async (next: "optout" | "ativo") => {
      if (isProcessing) return;
      setError(null);
      setIsProcessing(true);

      try {
        const response = await fetch(statusUrl, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: next }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(payload?.error ?? "Falha ao atualizar o status.");
          return;
        }

        setStatus(next);
        // Reflect the journey event the server recorded in the same transaction.
        const event: JourneyEvent = {
          id: `local-${Date.now()}`,
          tipo: next === "optout" ? "optout" : "reativado",
          detalhes: next === "optout" ? { origem: "manual" } : {},
          createdAt: new Date(),
        };
        setJourneyEvents((prev) => [event, ...prev]);
      } catch {
        setError("Erro de rede ao atualizar o status.");
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, statusUrl]
  );

  const onOptout = useCallback(() => {
    const confirmed = window.confirm(
      "Marcar este lead como opt-out? Ele deixará de receber mensagens."
    );
    if (confirmed) {
      void changeStatus("optout");
    }
  }, [changeStatus]);

  const onReactivate = useCallback(() => {
    void changeStatus("ativo");
  }, [changeStatus]);

  const qualificacaoEntries = Object.entries(lead.qualificacao).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="rounded-md border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{lead.nome ?? "Lead sem nome"}</h1>
            <p className="font-mono text-sm text-muted-foreground">{lead.telefone}</p>
            {lead.email && <p className="text-sm text-muted-foreground">{lead.email}</p>}
            {lead.origem && (
              <p className="text-sm text-muted-foreground">Origem: {lead.origem}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <Badge className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
            {status === "optout" ? (
              <button
                type="button"
                onClick={onReactivate}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Reativar lead
              </button>
            ) : (
              <button
                type="button"
                onClick={onOptout}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Marcar como opt-out
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Opt-out warning (reactive) */}
      {status === "optout" && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
        >
          Este lead optou por não receber mensagens.
        </div>
      )}

      {/* Lead data */}
      <div className="rounded-md border p-6">
        <h2 className="mb-4 text-lg font-semibold">Dados do lead</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">Temperatura</dt>
            <dd className="mt-1">
              <Badge className={TEMPERATURA_BADGE[lead.temperatura]}>
                {TEMPERATURA_LABEL[lead.temperatura]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Lead recorrente
            </dt>
            <dd className="mt-1 text-sm">{lead.leadRecorrente ? "Sim" : "Não"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Primeira interação
            </dt>
            <dd className="mt-1 text-sm">{formatDate(lead.primeiraInteracao)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Última interação
            </dt>
            <dd className="mt-1 text-sm">{formatDate(lead.ultimaInteracao)}</dd>
          </div>
        </dl>

        {qualificacaoEntries.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Qualificação
            </h3>
            <dl className="grid gap-2 sm:grid-cols-2">
              {qualificacaoEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <dt className="font-medium">{key}:</dt>
                  <dd className="text-muted-foreground">{stringifyDetalheValue(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Purchase */}
      <div className="rounded-md border p-6">
        <h2 className="mb-4 text-lg font-semibold">Compra</h2>
        {lead.comprou ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">Status</dt>
              <dd className="mt-1 text-sm">Comprou</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">Produto</dt>
              <dd className="mt-1 text-sm">{lead.produtoCompradoId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Data da compra
              </dt>
              <dd className="mt-1 text-sm">{formatDate(lead.dataCompra)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>
        )}
      </div>

      {/* Tags */}
      <div className="rounded-md border p-6">
        <h2 className="mb-4 text-lg font-semibold">Tags</h2>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAddTag();
              }
            }}
            maxLength={50}
            placeholder="Nova tag"
            aria-label="Nova tag"
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => void onAddTag()}
            disabled={!newTag.trim() || isAddingTag}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAddingTag ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Adicionar
          </button>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
              >
                {t.tag}
                <button
                  type="button"
                  onClick={() => void onRemoveTag(t.id)}
                  aria-label={`Remover tag ${t.tag}`}
                  className="rounded-full p-0.5 hover:bg-blue-200 disabled:opacity-50"
                  disabled={t.id.startsWith("temp-")}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma tag</p>
        )}
      </div>

      {/* Conversations */}
      <div className="rounded-md border p-6">
        <h2 className="mb-2 text-lg font-semibold">Conversas</h2>
        <p className="text-sm text-muted-foreground">
          {lead.conversationCount} {lead.conversationCount === 1 ? "conversa" : "conversas"}
        </p>
      </div>

      {/* Journey timeline */}
      <div className="rounded-md border p-6">
        <h2 className="mb-4 text-lg font-semibold">Linha do tempo</h2>
        {journeyEvents.length > 0 ? (
          <ol className="space-y-4">
            {journeyEvents.map((event) => {
              const detalheEntries = Object.entries(event.detalhes).filter(
                ([, value]) => value !== null && value !== undefined && value !== ""
              );
              return (
                <li key={event.id} className="border-l-2 border-muted pl-4">
                  <p className="text-sm font-medium">
                    {TIPO_LABEL[event.tipo] ?? event.tipo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>
                  {detalheEntries.length > 0 && (
                    <dl className="mt-1 space-y-0.5">
                      {detalheEntries.map(([key, value]) => (
                        <div key={key} className="flex gap-1 text-xs text-muted-foreground">
                          <dt className="font-medium">{key}:</dt>
                          <dd>{stringifyDetalheValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        )}
      </div>
    </div>
  );
}
