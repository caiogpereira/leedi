import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantDetail } from '@leedi/tenancy';
import { ClientesClient } from './ClientesClient';

vi.mock('next-intl', () => ({
  // Passthrough: returns the i18n key, ignoring interpolation params.
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('./actions', () => ({
  createTenantAction: vi.fn(),
  blockTenantAction: vi.fn(),
  unblockTenantAction: vi.fn(),
  getTenantInvoicesAction: vi.fn(),
}));

vi.mock('./ImpersonateButton', () => ({
  ImpersonateButton: ({ tenantName }: { tenantName: string }) => (
    <button type="button">impersonate-{tenantName}</button>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <svg className={className} />;
  return { AlertTriangle: Icon, CheckCircle2: Icon, Plus: Icon, Search: Icon };
});

vi.mock('@leedi/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open === false ? null : <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Avatar: ({ name }: { name: string }) => <span aria-label={name} />,
}));

type TenantRow = TenantDetail & { marginPct: number | null };

function makeTenant(overrides: Partial<TenantRow>): TenantRow {
  return {
    id: 'id',
    name: 'Tenant',
    slug: 'tenant',
    status: 'active',
    plan: 'pro',
    createdAt: new Date('2026-06-01'),
    billingStatus: null,
    subscriptionValor: 1497,
    overageValor: 0,
    custoIaUsd: 0,
    marginPct: 100,
    lastPayment: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('ClientesClient', () => {
  const tenants: TenantRow[] = [
    makeTenant({ id: 't-1', name: 'Acme', status: 'active' }),
    makeTenant({ id: 't-2', name: 'Beta', status: 'blocked' }),
  ];

  it('filters the list client-side by name without any server call', async () => {
    const actions = await import('./actions');
    render(<ClientesClient tenants={tenants} dashboardUrl="http://localhost:3001" />);

    // Both tenants present initially.
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();

    const search = screen.getByLabelText('searchPlaceholder');
    fireEvent.change(search, { target: { value: 'acme' } });

    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();

    // Pure client-side filter — no action invoked.
    expect(actions.getTenantInvoicesAction).not.toHaveBeenCalled();
  });

  it('shows "Liberar" only for blocked tenants and "Bloquear" for active ones', () => {
    render(<ClientesClient tenants={tenants} dashboardUrl="http://localhost:3001" />);

    // One blocked tenant → one unblock action; one active tenant → one block action.
    expect(screen.getAllByText('actions.unblock')).toHaveLength(1);
    expect(screen.getAllByText('actions.block')).toHaveLength(1);
  });

  it('renders a billing-pending warning only when billing_status flags it', () => {
    const flagged: TenantRow[] = [
      makeTenant({ id: 't-3', name: 'Gamma', billingStatus: 'pendente_configuracao' }),
    ];
    render(<ClientesClient tenants={flagged} dashboardUrl="http://localhost:3001" />);
    // The warning icon is wrapped in a span carrying the localized title.
    expect(screen.getByTitle('billingPending')).toBeTruthy();
  });
});
