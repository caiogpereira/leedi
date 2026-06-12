import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock sidebar-context
vi.mock('./sidebar-context', () => ({
  useSidebar: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <svg className={className} />;
  return {
    LayoutDashboard: Icon,
    MessageSquare: Icon,
    Users: Icon,
    Bot: Icon,
    BookOpen: Icon,
    Megaphone: Icon,
    FileText: Icon,
    Send: Icon,
    BarChart3: Icon,
    Settings: Icon,
    X: Icon,
    FlaskConical: Icon,
    Sparkles: Icon,
  };
});

afterEach(cleanup);

describe('Sidebar', () => {
  it('renders the navigation landmark', () => {
    render(<Sidebar />);
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeTruthy();
  });

  it('highlights the active route with aria-current="page"', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/leads');

    render(<Sidebar />);

    const links = screen.getAllByRole('link');
    const leadsLink = links.find((l) => l.getAttribute('href') === '/leads');
    expect(leadsLink?.getAttribute('aria-current')).toBe('page');

    const dashboardLink = links.find((l) => l.getAttribute('href') === '/');
    expect(dashboardLink?.getAttribute('aria-current')).toBeNull();
  });

  it('marks / as active only for exact match', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/leads');

    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    const homeLink = links.find((l) => l.getAttribute('href') === '/');
    expect(homeLink?.getAttribute('aria-current')).toBeNull();
  });

  it('renders all 11 nav items', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(11);
  });
});
