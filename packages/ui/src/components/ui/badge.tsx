import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'bg-success/12 text-success border-success/20',
        info: 'bg-info/12 text-info border-info/20',
        warning: 'bg-warning/12 text-warning border-warning/20',
        danger: 'bg-destructive/12 text-destructive border-destructive/20',
        ai: 'bg-accent-ai/12 text-accent-ai border-accent-ai/20',
        neutral: 'bg-muted text-muted-foreground border-border',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
