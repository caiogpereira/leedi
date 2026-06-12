'use client';

import { Card } from '@leedi/ui';

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  tooltip?: string;
}

export function MetricCard({ label, value, subtext, tooltip }: MetricCardProps) {
  return (
    <Card variant="metric" className="p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {tooltip && (
          <div className="group relative">
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded-full border text-xs text-muted-foreground hover:bg-accent"
              aria-label="Mais informações"
            >
              ?
            </button>
            <div className="absolute right-0 top-5 z-10 hidden w-56 rounded border bg-popover p-2 text-xs text-popover-foreground shadow-md group-hover:block">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
    </Card>
  );
}
