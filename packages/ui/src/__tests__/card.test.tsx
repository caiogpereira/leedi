import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/card.js';

afterEach(cleanup);

describe('Card', () => {
  it('renders composed children', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Foot')).toBeTruthy();
  });

  it('applies the metric variant gradient class', () => {
    render(<Card variant="metric" data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('bg-gradient-metric');
  });

  it('applies the default variant by default', () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('bg-card');
  });
});
