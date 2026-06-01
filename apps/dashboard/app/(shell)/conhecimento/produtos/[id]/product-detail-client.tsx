"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArgumentList } from "@/components/knowledge/ArgumentList";
import type { ProductRow } from "@leedi/knowledge";

type Tab = "basico" | "argumentos" | "diferenciais" | "provas" | "garantia" | "bonus";

const TABS: { id: Tab; label: string }[] = [
  { id: "basico", label: "Dados básicos" },
  { id: "argumentos", label: "Argumentos" },
  { id: "diferenciais", label: "Diferenciais" },
  { id: "provas", label: "Provas sociais" },
  { id: "garantia", label: "Garantia" },
  { id: "bonus", label: "Bônus" },
];

const TIPOS = [
  { value: "principal", label: "Principal" },
  { value: "downsell", label: "Downsell" },
  { value: "upsell", label: "Upsell" },
  { value: "orderbump", label: "Order Bump" },
];

interface Props {
  product: ProductRow;
  tenantId: string;
}

export function ProductDetailClient({ product, tenantId }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("basico");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state for material fields
  const [argumentos, setArgumentos] = useState<string[]>(product.argumentos ?? []);
  const [diferenciais, setDiferenciais] = useState<string[]>(product.diferenciais ?? []);
  const [provasSociais, setProvasSociais] = useState<string[]>(product.provasSociais ?? []);
  const [garantia, setGarantia] = useState(product.garantia ?? "");
  const [bonus, setBonus] = useState<string[]>(product.bonus ?? []);

  async function saveMaterial(
    field: "argumentos" | "diferenciais" | "provasSociais" | "bonus",
    items: string[]
  ) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/knowledge/products/${product.id}/material`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, items }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao salvar.");
      } else {
        setSuccess("Salvo com sucesso.");
        setTimeout(() => setSuccess(null), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveGarantia() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/knowledge/products/${product.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ garantia }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao salvar.");
      } else {
        setSuccess("Garantia salva com sucesso.");
        setTimeout(() => setSuccess(null), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleBasicSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = {
      nome: form.get("nome"),
      descricao: form.get("descricao") || null,
      preco: form.get("preco"),
      parcelas: form.get("parcelas") || null,
      precoParcelado: form.get("precoParcelado") || null,
      linkCheckout: form.get("linkCheckout"),
      tipo: form.get("tipo"),
      gatewayProductId: form.get("gatewayProductId") || null,
    };
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/knowledge/products/${product.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao salvar.");
      } else {
        setSuccess("Produto salvo com sucesso.");
        setTimeout(() => setSuccess(null), 2000);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Arquivar este produto? Ele não aparecerá mais na lista ativa.")) return;
    setArchiving(true);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/knowledge/products/${product.id}/archive`,
        { method: "PATCH" }
      );
      if (res.ok) {
        router.push("/conhecimento/produtos");
      } else {
        const data = await res.json();
        setError(data.error ?? "Erro ao arquivar.");
      }
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.nome}</h1>
          <p className="text-sm text-muted-foreground capitalize">{product.tipo}</p>
        </div>
        {product.ativo && (
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving}
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {archiving ? "Arquivando..." : "Arquivar"}
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex border-b gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Basic info tab */}
      {activeTab === "basico" && (
        <form onSubmit={handleBasicSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Nome *</label>
            <input
              name="nome"
              defaultValue={product.nome}
              required
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Descrição</label>
            <textarea
              name="descricao"
              defaultValue={product.descricao ?? ""}
              rows={3}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Preço (R$) *</label>
              <input
                name="preco"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={product.preco}
                required
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Tipo</label>
              <select
                name="tipo"
                defaultValue={product.tipo}
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
              <label className="text-sm font-medium">Parcelas</label>
              <input
                name="parcelas"
                type="number"
                min="1"
                defaultValue={product.parcelas ?? ""}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Preço parcelado (R$)</label>
              <input
                name="precoParcelado"
                type="number"
                step="0.01"
                defaultValue={product.precoParcelado ?? ""}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Link de checkout *</label>
            <input
              name="linkCheckout"
              type="url"
              defaultValue={product.linkCheckout}
              required
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              O link de checkout é obrigatório para que o agente possa enviar ao lead.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">ID no gateway</label>
            <input
              name="gatewayProductId"
              defaultValue={product.gatewayProductId ?? ""}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {/* Argumentos tab */}
      {activeTab === "argumentos" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Argumentos de venda que o agente usará para persuadir o lead.
          </p>
          <ArgumentList
            items={argumentos}
            onChange={setArgumentos}
            placeholder="Adicione um argumento de venda..."
            emptyState="Nenhum argumento cadastrado. Adicione argumentos para fortalecer a venda."
            aiContext="sales_argument"
            tenantId={tenantId}
          />
          <button
            type="button"
            onClick={() => saveMaterial("argumentos", argumentos)}
            disabled={saving}
            className="self-start inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar argumentos"}
          </button>
        </div>
      )}

      {/* Diferenciais tab */}
      {activeTab === "diferenciais" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Diferenciais do produto em relação à concorrência.
          </p>
          <ArgumentList
            items={diferenciais}
            onChange={setDiferenciais}
            placeholder="Adicione um diferencial..."
            emptyState="Nenhum diferencial cadastrado. Adicione argumentos para fortalecer a venda."
            aiContext="differential"
            tenantId={tenantId}
          />
          <button
            type="button"
            onClick={() => saveMaterial("diferenciais", diferenciais)}
            disabled={saving}
            className="self-start inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar diferenciais"}
          </button>
        </div>
      )}

      {/* Provas sociais tab */}
      {activeTab === "provas" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Provas sociais: depoimentos, resultados, números que comprovam o valor do produto.
          </p>
          <ArgumentList
            items={provasSociais}
            onChange={setProvasSociais}
            placeholder="Adicione uma prova social..."
            emptyState="Nenhum argumento cadastrado. Adicione argumentos para fortalecer a venda."
            aiContext="social_proof"
            tenantId={tenantId}
          />
          <button
            type="button"
            onClick={() => saveMaterial("provasSociais", provasSociais)}
            disabled={saving}
            className="self-start inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar provas sociais"}
          </button>
        </div>
      )}

      {/* Garantia tab */}
      {activeTab === "garantia" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Descreva a garantia oferecida com o produto.
          </p>
          <div className="relative">
            <textarea
              value={garantia}
              onChange={(e) => setGarantia(e.target.value)}
              rows={4}
              placeholder="Ex: 30 dias de garantia incondicional. Se não gostar, devolvemos 100% do valor."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveGarantia}
              disabled={saving}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar garantia"}
            </button>
          </div>
        </div>
      )}

      {/* Bônus tab */}
      {activeTab === "bonus" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Bônus incluídos na compra do produto.
          </p>
          <ArgumentList
            items={bonus}
            onChange={setBonus}
            placeholder="Adicione um bônus..."
            emptyState="Nenhum argumento cadastrado. Adicione argumentos para fortalecer a venda."
            aiContext="bonus"
            tenantId={tenantId}
          />
          <button
            type="button"
            onClick={() => saveMaterial("bonus", bonus)}
            disabled={saving}
            className="self-start inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar bônus"}
          </button>
        </div>
      )}
    </div>
  );
}
