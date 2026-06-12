'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@leedi/ui';
import { LayoutDashboard, Users, DollarSign, Activity, Settings, X, ShieldCheck } from 'lucide-react';
import { useSidebar } from './sidebar-context';

interface AdminNavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/', icon: LayoutDashboard, labelKey: 'visaoGeral' },
  { href: '/clientes', icon: Users, labelKey: 'clientes' },
  { href: '/financeiro', icon: DollarSign, labelKey: 'financeiro' },
  { href: '/operacional', icon: Activity, labelKey: 'operacional' },
  { href: '/configuracoes', icon: Settings, labelKey: 'configuracoes' },
];

function AdminNavLink({ item }: { item: AdminNavItem }) {
  const pathname = usePathname();
  const t = useTranslations('adminNav');
  const isActive =
    pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'glass bg-gradient-active border border-primary/40 text-foreground shadow-glow'
          : 'text-muted-foreground hover:glass-subtle hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden md:block">{t(item.labelKey as Parameters<typeof t>[0])}</span>
    </Link>
  );
}

export function AdminSidebar() {
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar',
          'w-64 transition-transform duration-300 ease-in-out',
          'md:relative md:z-auto md:w-16 md:translate-x-0 lg:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand + ADMIN badge */}
        <div className="flex h-14 items-center gap-2 px-4">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="hidden text-base font-bold text-foreground lg:block">Leedi</span>
          <span className="hidden rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold tracking-wider text-primary lg:inline">
            ADMIN
          </span>
        </div>

        {/* Mobile close */}
        <div className="flex items-center justify-between px-4 py-4 md:hidden">
          <span className="text-sm font-semibold text-foreground">Menu</span>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar menu"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Navegação administrativa" className="flex flex-col gap-1 px-2 py-4">
          {ADMIN_NAV_ITEMS.map((item) => (
            <AdminNavLink key={item.href} item={item} />
          ))}
        </nav>
      </aside>
    </>
  );
}
