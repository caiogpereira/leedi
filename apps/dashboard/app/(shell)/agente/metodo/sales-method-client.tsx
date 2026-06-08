"use client";

import { useState } from "react";
import { Check } from "lucide-react";

interface Phase {
  ordem: number;
  nome: string;
  objetivo: string;
}

interface SalesMethod {
  id: string;
  nome: string;
  titulo: string;
  descricao: string;
  phases: Phase[];
}

interface Props {
  methods: SalesMethod[];
  currentMethodId: string | null;
  tenantId: string;
}

export function SalesMethodClient({ methods, currentMethodId, tenantId }: Props) {
  const [selected, setSelected] = useState(currentMethodId ?? methods[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      // Persist to agent_configs.sales_method_id (Story 7.1 wired this — the legacy
      // tenants.config.tenant_sales_method_preference temporary store is retired).
      const res = await fetch(`/api/tenants/${tenantId}/agent-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesMethodId: selected }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao salvar método.");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Método de venda</h1>
        <p className="text-sm text-muted-foreground">
          Escolha a metodologia que o agente usará para conduzir conversas e converter leads.
          Esta escolha afeta o comportamento do agente em todas as conversas.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {methods.map((method) => {
          const isSelected = selected === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => setSelected(method.id)}
              className={`flex items-start gap-4 rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                }`}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{method.titulo}</p>
                <p className="mt-1 text-xs text-muted-foreground">{method.descricao}</p>
                {method.phases?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {method.phases.map((phase) => (
                      <span
                        key={phase.ordem}
                        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {phase.nome}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Método de venda salvo com sucesso.
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !selected}
        className="self-start inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar método"}
      </button>
    </div>
  );
}
