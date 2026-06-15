"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIPOS = [
  { value: "principal", label: "Principal" },
  { value: "downsell", label: "Downsell" },
  { value: "upsell", label: "Upsell" },
  { value: "orderbump", label: "Order Bump" },
];

export default function NovoProdutoForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = {
      nome: form.get("nome"),
      descricao: form.get("descricao") || undefined,
      preco: form.get("preco"),
      parcelas: form.get("parcelas") || undefined,
      precoParcelado: form.get("precoParcelado") || undefined,
      linkCheckout: form.get("linkCheckout"),
      tipo: form.get("tipo") || "principal",
      gatewayProductId: form.get("gatewayProductId") || undefined,
    };

    try {
      const res = await fetch(`/api/tenants/${tenantId}/knowledge/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao criar produto.");
        return;
      }

      const product = await res.json();
      router.push(`/conhecimento/produtos/${product.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nome" className="text-sm font-medium">Nome *</label>
        <input
          id="nome"
          name="nome"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="descricao" className="text-sm font-medium">Descrição</label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="preco" className="text-sm font-medium">Preço (R$) *</label>
          <input
            id="preco"
            name="preco"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tipo" className="text-sm font-medium">Tipo</label>
          <select
            id="tipo"
            name="tipo"
            className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="parcelas" className="text-sm font-medium">Parcelas</label>
          <input
            id="parcelas"
            name="parcelas"
            type="number"
            min="1"
            className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="precoParcelado" className="text-sm font-medium">Preço parcelado (R$)</label>
          <input
            id="precoParcelado"
            name="precoParcelado"
            type="number"
            step="0.01"
            min="0.01"
            className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="linkCheckout" className="text-sm font-medium">Link de checkout *</label>
        <input
          id="linkCheckout"
          name="linkCheckout"
          type="url"
          required
          placeholder="https://..."
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          O link de checkout é obrigatório para que o agente possa enviar ao lead.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="gatewayProductId" className="text-sm font-medium">ID do produto no gateway</label>
        <input
          id="gatewayProductId"
          name="gatewayProductId"
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Ex: prod_123abc"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar produto"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
