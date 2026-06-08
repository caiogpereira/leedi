'use client';

import { useState } from 'react';
import { ObjectionDetailDrawer } from './objection-detail-drawer.js';

interface ObjectionInstance {
  leadName: string | null;
  date: string;
  windowId: string | null;
}

interface ObjectionItem {
  label: string;
  count: number;
  recentInstances: ObjectionInstance[];
}

interface ObjectionAnalyticsSectionProps {
  items: ObjectionItem[];
  loading: boolean;
  error: boolean;
}

const MIN_ITEMS_THRESHOLD = 3;

export function ObjectionAnalyticsSection({
  items,
  loading,
  error,
}: ObjectionAnalyticsSectionProps) {
  const [selected, setSelected] = useState<ObjectionItem | null>(null);

  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Objeções mais frequentes</h2>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-destructive">
          Erro ao carregar objeções. Tente recarregar a página.
        </p>
      )}

      {!loading && !error && items.length < MIN_ITEMS_THRESHOLD && (
        <p className="text-sm text-muted-foreground">
          Poucas objeções registradas neste período. Os dados aparecem à medida que o agente
          identifica objeções nas conversas.
        </p>
      )}

      {!loading && !error && items.length >= MIN_ITEMS_THRESHOLD && (
        <ol className="space-y-2">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className="w-full rounded border bg-card px-3 py-2 text-left hover:bg-accent"
                onClick={() => setSelected(item)}
              >
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">{item.count}×</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-indigo-500"
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}

      <ObjectionDetailDrawer
        objection={selected?.label ?? null}
        instances={selected?.recentInstances ?? []}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
