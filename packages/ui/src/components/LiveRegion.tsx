import * as React from 'react';
import { cn } from '../lib/utils.js';

interface LiveRegionProps {
  children: React.ReactNode;
  /** "polite" (default) — announces after user is idle; "assertive" — interrupts */
  politeness?: 'polite' | 'assertive';
  /** When true, the region is invisible but still announced by screen readers */
  srOnly?: boolean;
  className?: string;
}

/**
 * Accessible live-region wrapper for async state announcements (AC: Story 3.4 #4).
 *
 * Use for: AI generation status, form save confirmations, async loading states.
 * Screen readers announce changes to this region without requiring focus.
 */
export function LiveRegion({
  children,
  politeness = 'polite',
  srOnly = false,
  className,
}: LiveRegionProps) {
  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      className={cn(
        srOnly && 'sr-only',
        className
      )}
    >
      {children}
    </div>
  );
}
