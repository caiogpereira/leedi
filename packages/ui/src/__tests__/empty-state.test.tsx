import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../components/ui/empty-state.js';

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="Nenhuma conversa ainda"
        description="As conversas aparecerão aqui."
        action={<button type="button">Começar</button>}
      />,
    );
    expect(screen.getByText('Nenhuma conversa ainda')).toBeTruthy();
    expect(screen.getByText('As conversas aparecerão aqui.')).toBeTruthy();
    expect(screen.getByText('Começar')).toBeTruthy();
  });

  it('renders without an action', () => {
    render(<EmptyState title="Vazio" description="Nada aqui." />);
    expect(screen.getByText('Vazio')).toBeTruthy();
  });
});
