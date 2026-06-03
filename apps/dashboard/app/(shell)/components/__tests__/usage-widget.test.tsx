import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageWidget } from '../usage-widget.js';

const BASE_DATA = {
  periodo: '2026-06',
  conversasUsadas: 0,
  conversasLimite: 1000,
  overageConversas: 0,
  overageValor: '0.00',
  pct: 0,
  blocked: false,
};

describe('UsageWidget', () => {
  it('renders loading skeleton when loading=true', () => {
    const { container } = render(
      <UsageWidget data={null} loading={true} error={false} onRetry={() => {}} />
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders error state when error=true', () => {
    render(<UsageWidget data={null} loading={false} error={true} onRetry={() => {}} />);
    expect(screen.getByText('Dados de uso indisponíveis.')).toBeTruthy();
  });

  it('renders usage count and percentage', () => {
    render(
      <UsageWidget
        data={{ ...BASE_DATA, conversasUsadas: 830, conversasLimite: 1000, pct: 83 }}
        loading={false}
        error={false}
        onRetry={() => {}}
      />
    );
    expect(screen.getByText(/830/)).toBeTruthy();
    expect(screen.getByText(/83%/)).toBeTruthy();
  });

  it('shows overage row when overageConversas > 0', () => {
    render(
      <UsageWidget
        data={{ ...BASE_DATA, overageConversas: 50, overageValor: '15.00', pct: 105 }}
        loading={false}
        error={false}
        onRetry={() => {}}
      />
    );
    expect(screen.getByText(/excedentes/i)).toBeTruthy();
  });

  it('does NOT show overage row when overageConversas = 0', () => {
    const { container } = render(
      <UsageWidget
        data={{ ...BASE_DATA, pct: 50 }}
        loading={false}
        error={false}
        onRetry={() => {}}
      />
    );
    expect(container.querySelector('.text-orange-600')).toBeNull();
  });

  it('shows "Ver histórico" link', () => {
    render(
      <UsageWidget data={BASE_DATA} loading={false} error={false} onRetry={() => {}} />
    );
    expect(screen.getByText('Ver histórico')).toBeTruthy();
  });
});
