'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Menu, Sun, Moon, ShieldCheck } from 'lucide-react';
import { cn } from '@leedi/ui';
import { useSidebar } from './sidebar-context';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md',
        'text-primary-foreground/80 hover:bg-primary-700 hover:text-primary-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'transition-colors'
      )}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/**
 * Admin header — AC#2: visually distinguishes the admin interface.
 *
 * Uses a deep indigo primary background (from the token system) with an "ADMIN"
 * text + shield badge. No tenant switcher — admins operate workspace-wide.
 */
export function AdminHeader() {
  const { open } = useSidebar();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-primary px-4">
      <div className="flex items-center gap-2">
        {/* Hamburger — visible only on mobile */}
        <button
          type="button"
          onClick={open}
          aria-label="Abrir menu de navegação"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden',
            'text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'transition-colors'
          )}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Admin indicator — color + text badge for WCAG: never rely on color alone */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
          <span className="text-sm font-bold text-primary-foreground">Leedi</span>
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-semibold tracking-wider text-primary-foreground">
            ADMIN
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
