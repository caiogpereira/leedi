'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@leedi/ui';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Bot,
  BookOpen,
  Megaphone,
  FileText,
  Send,
  BarChart3,
  Settings,
  FlaskConical,
  X,
} from 'lucide-react';
import { useSidebar } from './sidebar-context';

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', icon: LayoutDashboard, labelKey: 'dashboard' },
  { href: '/conversas', icon: MessageSquare, labelKey: 'conversas' },
  { href: '/leads', icon: Users, labelKey: 'leads' },
  { href: '/agente', icon: Bot, labelKey: 'agente' },
  { href: '/agente/playground', icon: FlaskConical, labelKey: 'playground' },
  { href: '/conhecimento', icon: BookOpen, labelKey: 'conhecimento' },
  { href: '/campanhas', icon: Megaphone, labelKey: 'campanhas' },
  { href: '/templates', icon: FileText, labelKey: 'templates' },
  { href: '/disparos', icon: Send, labelKey: 'disparos' },
  { href: '/relatorios', icon: BarChart3, labelKey: 'relatorios' },
  { href: '/configuracoes', icon: Settings, labelKey: 'configuracoes' },
];

function NavItemLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden md:block">{t(item.labelKey as Parameters<typeof t>[0])}</span>
    </Link>
  );
}

export function Sidebar() {
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

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-background',
          'w-64 transition-transform duration-300 ease-in-out',
          'md:relative md:z-auto md:w-16 md:translate-x-0 lg:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Mobile close button */}
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

        {/* Nav */}
        <nav aria-label="Navegação principal" className="flex flex-col gap-1 px-2 py-4">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.href} item={item} />
          ))}
        </nav>
      </aside>
    </>
  );
}
