import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../components/ui/badge.js';

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge>Ativo</Badge>);
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('applies the danger intent classes', () => {
    render(<Badge variant="danger" data-testid="b">Bloqueado</Badge>);
    expect(screen.getByTestId('b').className).toContain('text-destructive');
  });

  it('applies the ai intent classes', () => {
    render(<Badge variant="ai" data-testid="b">IA</Badge>);
    expect(screen.getByTestId('b').className).toContain('accent-ai');
  });

  it('defaults to the neutral intent', () => {
    render(<Badge data-testid="b">x</Badge>);
    expect(screen.getByTestId('b').className).toContain('text-muted-foreground');
  });
});
