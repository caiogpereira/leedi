import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../components/ui/button.js';

afterEach(cleanup);

describe('Button', () => {
  it('renders with default primary token class', () => {
    const { container } = render(<Button>Click me</Button>);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.className).toContain('bg-primary');
  });

  it('renders with correct text', () => {
    const { getByText } = render(<Button>Submit</Button>);
    expect(getByText('Submit')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<Button className="extra-class">Label</Button>);
    expect(container.querySelector('button')?.className).toContain('extra-class');
  });
});
