'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Menu, Sun, Moon, ShieldCheck, Search } from 'lucide-react';
import { cn, Avatar } from '@leedi/ui';
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
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
    <header className="flex h-14 items-center gap-4 border-b bg-gradient-header px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        {/* Hamburger — visible only on mobile */}
        <button
          type="button"
          onClick={open}
          aria-label="Abrir menu de navegação"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'transition-colors'
          )}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Admin indicator — color + text badge for WCAG: never rely on color alone */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="text-sm font-bold text-foreground">Leedi</span>
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold tracking-wider text-primary">
            ADMIN
          </span>
        </div>
      </div>

      {/* Visual search (non-functional this round — decorative only) */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          disabled
          aria-hidden="true"
          tabIndex={-1}
          placeholder="Buscar…"
          className="glass-subtle h-9 w-full rounded-md pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <Avatar name="Admin" size="sm" />
          <div className="leading-tight">
            <p className="text-sm font-medium text-foreground">Admin</p>
            <p className="text-xs text-muted-foreground">Super Admin</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
