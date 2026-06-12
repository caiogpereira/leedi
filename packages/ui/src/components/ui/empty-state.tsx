import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="relative mb-4 text-muted-foreground">
          {icon}
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
          >
            0
          </span>
        </div>
      )}
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
