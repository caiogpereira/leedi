import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConhecimentoLayout from '../layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/conhecimento/faq' }));

describe('ConhecimentoLayout', () => {
  it('renders sub-nav links to FAQ, Objeções and Produtos', () => {
    render(<ConhecimentoLayout><div>conteúdo</div></ConhecimentoLayout>);
    expect(screen.getByRole('link', { name: 'FAQ' }).getAttribute('href')).toBe('/conhecimento/faq');
    expect(screen.getByRole('link', { name: 'Objeções' }).getAttribute('href')).toBe('/conhecimento/objecoes');
    expect(screen.getByRole('link', { name: 'Produtos' }).getAttribute('href')).toBe('/conhecimento/produtos');
    expect(screen.getByText('conteúdo')).toBeTruthy();
  });

  it('marks the FAQ link as active for pathname /conhecimento/faq', () => {
    render(<ConhecimentoLayout><div>conteúdo</div></ConhecimentoLayout>);
    const faqLink = screen.getByRole('link', { name: 'FAQ' });
    expect(faqLink.className.includes('bg-primary')).toBe(true);
    expect(faqLink.className.includes('text-primary-foreground')).toBe(true);
  });
});
