import * as React from 'react';
import { cn } from '../lib/utils.js';
import { Label } from './ui/label.js';

interface FormFieldProps {
  id: string;
  label: string;
  /** Error message — links to the field via aria-describedby */
  error?: string;
  children: React.ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }>;
  className?: string;
}

/**
 * Accessible form-field wrapper (AC: Story 3.4 #3).
 *
 * Renders Label → Input/Textarea → ErrorMessage in a consistent pattern.
 * The child element receives `id`, `aria-describedby`, and `aria-invalid`
 * automatically, so no manual wiring is needed at the call site.
 */
export function FormField({ id, label, error, children, className }: FormFieldProps) {
  const errorId = `${id}-error`;

  const extraProps: Record<string, unknown> = { id };
  if (error) {
    extraProps['aria-describedby'] = errorId;
    extraProps['aria-invalid'] = true;
  }
  const child = React.cloneElement(children, extraProps);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {child}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
