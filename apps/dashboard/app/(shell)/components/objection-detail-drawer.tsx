'use client';

import { X } from 'lucide-react';
import Link from 'next/link';

interface ObjectionInstance {
  leadName: string | null;
  date: string;
  windowId: string | null;
}

interface ObjectionDetailDrawerProps {
  objection: string | null;
  instances: ObjectionInstance[];
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ObjectionDetailDrawer({
  objection,
  instances,
  onClose,
}: ObjectionDetailDrawerProps) {
  if (!objection) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-sm flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Conversas com objeção</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-accent"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-sm font-medium text-muted-foreground">
            &ldquo;{objection}&rdquo;
          </p>
          {instances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conversa recente encontrada.
            </p>
          ) : (
            <ul className="space-y-2">
              {instances.map((inst, i) => (
                <li key={`${inst.windowId ?? 'noid'}-${i}`}>
                  {inst.windowId ? (
                    <Link
                      href={`/conversas/${inst.windowId}`}
                      className="block rounded border px-3 py-2 text-sm hover:bg-accent"
                      onClick={onClose}
                    >
                      <span className="font-medium">
                        {inst.leadName ?? 'Lead desconhecido'}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDate(inst.date)}
                      </span>
                      <span className="ml-1 text-xs text-primary"> →</span>
                    </Link>
                  ) : (
                    <div className="rounded border px-3 py-2 text-sm">
                      <span className="font-medium">
                        {inst.leadName ?? 'Lead desconhecido'}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDate(inst.date)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
