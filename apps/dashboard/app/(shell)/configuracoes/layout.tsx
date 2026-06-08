'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@leedi/ui';

const SETTINGS_NAV = [
  { href: '/configuracoes/uso', label: 'Uso' },
  { href: '/configuracoes/cobranca', label: 'Cobrança' },
  { href: '/configuracoes/notificacoes', label: 'Notificações' },
];

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6">
      <nav className="hidden w-44 shrink-0 flex-col gap-1 md:flex">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Configurações
        </p>
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
