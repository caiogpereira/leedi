"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2, FileDown, AlertCircle } from "lucide-react";

interface ErrorRow {
  index: number;
  raw: string;
  reason: string;
}

interface ImportResult {
  inserted: number;
  duplicated: number;
  errors: ErrorRow[];
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Interactive CSV upload form. POSTs the file as multipart/form-data to the
 * same-origin proxy route, which forwards it to the Hono import endpoint.
 * Shows a 3-counter summary (imported / duplicates / errors) and lets the user
 * download a CSV report of the rejected rows.
 */
export function ImportForm({ tenantId }: { tenantId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onSelectFile = useCallback((selected: File | null) => {
    setError(null);
    setResult(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Selecione um arquivo .csv.");
      setFile(null);
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError("Arquivo muito grande. Limite: 5MB.");
      setFile(null);
      return;
    }
    setFile(selected);
  }, []);

  const onSubmit = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/tenants/${tenantId}/leads/import`,
        { method: "POST", body: formData }
      );

      const payload = (await response.json().catch(() => null)) as
        | (ImportResult & { error?: string })
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(
          (payload && "error" in payload && payload.error) ||
            "Falha ao importar o arquivo."
        );
        return;
      }

      setResult(payload as ImportResult);
    } catch {
      setError("Erro de rede ao enviar o arquivo.");
    } finally {
      setLoading(false);
    }
  }, [file, tenantId]);

  const downloadErrorReport = useCallback(() => {
    if (!result || result.errors.length === 0) return;

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = "linha,telefone,motivo";
    const lines = result.errors.map((e) =>
      [String(e.index + 2), escape(e.raw), escape(e.reason)].join(",")
    );
    // +2: header row (1) + 0-based index → spreadsheet line number.
    const csv = [header, ...lines].join("\r\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erros-importacao-leads.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-dashed p-6">
        <div className="flex flex-col items-start gap-4">
          <label
            htmlFor="csv-file"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Escolher arquivo .csv
          </label>
          <input
            id="csv-file"
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
          />

          {file ? (
            <p className="text-sm text-muted-foreground">
              Selecionado:{" "}
              <span className="font-medium text-foreground">{file.name}</span> (
              {(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum arquivo selecionado.
            </p>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!file || loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? "Importando..." : "Importar leads"}
          </button>
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

      {result && (
        <div className="space-y-4">
          <p
            className="text-sm font-medium"
            role="status"
            aria-live="polite"
          >
            {result.inserted} leads importados, {result.duplicated} duplicados
            ignorados, {result.errors.length} erros.
          </p>

          <div className="grid grid-cols-3 gap-4">
            <Counter
              value={result.inserted}
              label="Importados"
              className="border-green-200 bg-green-50 text-green-800"
            />
            <Counter
              value={result.duplicated}
              label="Duplicados"
              className="border-amber-200 bg-amber-50 text-amber-800"
            />
            <Counter
              value={result.errors.length}
              label="Erros"
              className="border-red-200 bg-red-50 text-red-800"
            />
          </div>

          {result.errors.length > 0 && (
            <button
              type="button"
              onClick={downloadErrorReport}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Baixar relatório de erros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Counter({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className: string;
}) {
  return (
    <div className={`rounded-lg border p-4 text-center ${className}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}
