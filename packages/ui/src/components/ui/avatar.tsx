import * as React from 'react';
import { cn } from '../../lib/utils.js';

// Brand-tinted palette (Tailwind classes mapped in tooling/tailwind-config).
const AVATAR_COLORS = [
  'bg-primary/15 text-primary-300',
  'bg-accent-ai/15 text-accent-ai-300',
  'bg-info/15 text-info',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-secondary text-secondary-foreground',
] as const;

export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

// Deterministic non-negative hash → palette index (FNV-1a style).
export function avatarColorIndex(name: string, paletteSize: number): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % paletteSize;
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  online?: boolean;
  className?: string;
}

export function Avatar({ name, size = 'md', online = false, className }: AvatarProps) {
  const initials = initialsFromName(name);
  const color = AVATAR_COLORS[avatarColorIndex(name, AVATAR_COLORS.length)]!;
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        aria-label={name}
        role="img"
        className={cn(
          'inline-flex items-center justify-center rounded-full font-medium',
          SIZE_CLASSES[size],
          color,
        )}
      >
        {initials}
      </span>
      {online && (
        <span
          data-testid="avatar-online"
          aria-hidden="true"
          className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-2 ring-background"
        />
      )}
    </span>
  );
}
