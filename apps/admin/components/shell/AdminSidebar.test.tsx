import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from './AdminSidebar';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('./sidebar-context', () => ({
  useSidebar: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <svg className={className} />;
  return {
    LayoutDashboard: Icon,
    Users: Icon,
    DollarSign: Icon,
    Activity: Icon,
    Settings: Icon,
    X: Icon,
    ShieldCheck: Icon,
  };
});

afterEach(cleanup);

describe('AdminSidebar', () => {
  it('renders the administrative navigation landmark', () => {
    render(<AdminSidebar />);
    expect(screen.getByRole('navigation', { name: 'Navegação administrativa' })).toBeTruthy();
  });

  it('renders exactly 4 admin nav items', () => {
    render(<AdminSidebar />);
    // 4 since the dead "/configuracoes" link was removed (admin settings unbuilt).
    expect(screen.getAllByRole('link').length).toBe(4);
  });

  it('highlights the active route with aria-current="page"', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/clientes');

    render(<AdminSidebar />);

    const links = screen.getAllByRole('link');
    const clientesLink = links.find((l) => l.getAttribute('href') === '/clientes');
    expect(clientesLink?.getAttribute('aria-current')).toBe('page');

    const homeLink = links.find((l) => l.getAttribute('href') === '/');
    expect(homeLink?.getAttribute('aria-current')).toBeNull();
  });

  it('does not include a tenant switcher', () => {
    render(<AdminSidebar />);
    expect(screen.queryByText(/selecionar empresa/i)).toBeNull();
    expect(screen.queryByText(/tenant/i)).toBeNull();
  });
});
