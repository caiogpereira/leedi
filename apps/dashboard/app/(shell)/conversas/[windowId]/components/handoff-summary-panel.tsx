'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface HandoffSummary {
  quem_e?: string;
  o_que_quer?: string;
  objecoes?: string[];
  temperatura?: 'frio' | 'morno' | 'quente';
  motivo?: string;
  resposta_sugerida?: string;
}

interface HandoffSummaryPanelProps {
  resumoHandoff: string | null;
  motivoHandoff: string | null;
}

function parseHandoff(raw: string | null): HandoffSummary | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HandoffSummary;
  } catch {
    return { motivo: raw };
  }
}

const TEMP_LABEL: Record<string, string> = { frio: 'Frio', morno: 'Morno', quente: 'Quente' };

export function HandoffSummaryPanel({ resumoHandoff, motivoHandoff }: HandoffSummaryPanelProps) {
  const [open, setOpen] = useState(true);

  if (!resumoHandoff) {
    return (
      <aside className="w-72 shrink-0 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Nenhuma transferência do agente. Aberto diretamente.
      </aside>
    );
  }

  const summary = parseHandoff(resumoHandoff);

  return (
    <aside className="w-72 shrink-0 rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/50"
      >
        <span>Resumo do Agente</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && summary && (
        <div className="border-t px-4 py-3 flex flex-col gap-3 text-sm">
          {summary.quem_e && (
            <div>
              <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Quem é o lead</span>
              <p className="mt-0.5">{summary.quem_e}</p>
            </div>
          )}
          {summary.o_que_quer && (
            <div>
              <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">O que quer</span>
              <p className="mt-0.5">{summary.o_que_quer}</p>
            </div>
          )}
          {Array.isArray(summary.objecoes) && summary.objecoes.length > 0 && (
            <div>
              <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Objeções</span>
              <ul className="mt-0.5 list-disc list-inside space-y-0.5">
                {summary.objecoes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.temperatura && (
            <div>
              <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Temperatura</span>
              <p className="mt-0.5">{TEMP_LABEL[summary.temperatura] ?? summary.temperatura}</p>
            </div>
          )}
          {(summary.motivo ?? motivoHandoff) && (
            <div>
              <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Motivo da transferência</span>
              <p className="mt-0.5">{summary.motivo ?? motivoHandoff}</p>
            </div>
          )}
          {summary.resposta_sugerida && (
            <div>
              <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Resposta sugerida</span>
              <p className="mt-0.5 text-muted-foreground italic">{summary.resposta_sugerida}</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
