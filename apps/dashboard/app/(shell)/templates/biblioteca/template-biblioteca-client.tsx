'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@leedi/ui';

interface LibraryEntry {
  id: string;
  categoriaOcasiao: string;
  titulo: string;
  descricao: string;
  isGlobal: boolean;
}

const CATEGORIA_LABEL: Record<string, string> = {
  boas_vindas: 'Boas-vindas',
  carrinho_abandonado_1h: 'Carrinho Abandonado (1h)',
  carrinho_abandonado_6h: 'Carrinho Abandonado (6h)',
  carrinho_abandonado_24h: 'Carrinho Abandonado (24h)',
  ultima_chamada: 'Última Chamada',
  pos_compra: 'Pós-compra',
  reengajamento: 'Reengajamento',
  lembrete_evento: 'Lembrete de Evento',
};

export function TemplateBibliotecaClient({ tenantId }: { tenantId: string }) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/templates/library`)
      .then((r) => r.json())
      .then((data: LibraryEntry[]) => setEntries(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/templates" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Biblioteca de templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modelos prontos para você adaptar e usar nos seus disparos.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-12 text-center">Carregando...</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum modelo disponível na biblioteca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border bg-card p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow"
            >
              <div>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium mb-2">
                  {CATEGORIA_LABEL[entry.categoriaOcasiao] ?? entry.categoriaOcasiao}
                </span>
                <h3 className="font-semibold text-sm">{entry.titulo}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{entry.descricao}</p>
              </div>
              <div className="mt-auto pt-2">
                <Link href={`/templates/new?library=${entry.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    Usar este modelo
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
