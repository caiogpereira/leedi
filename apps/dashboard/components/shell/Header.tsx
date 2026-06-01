'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Menu, Sun, Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@leedi/ui';
import type { UserTenant } from '@leedi/tenancy';
import { TenantSwitcher } from '../TenantSwitcher';
import { useSidebar } from './sidebar-context';

interface HeaderProps {
  tenants: UserTenant[];
  currentTenantId: string | null;
}

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

export function Header({ tenants, currentTenantId }: HeaderProps) {
  const { open } = useSidebar();
  const t = useTranslations('app');

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
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
        <span className="hidden text-sm font-bold text-foreground lg:block">{t('title')}</span>
      </div>

      <div className="flex items-center gap-2">
        <TenantSwitcher tenants={tenants} currentTenantId={currentTenantId} />
        <ThemeToggle />
      </div>
    </header>
  );
}
