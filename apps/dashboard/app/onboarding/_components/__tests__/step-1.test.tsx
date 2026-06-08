import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step1 } from '../step-1.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Step1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('shows inline error when nome is empty on submit', async () => {
    const onAdvance = vi.fn();
    render(<Step1 tenantId="t1" stepData={{}} onAdvance={onAdvance} />);

    fireEvent.click(screen.getByText('Próximo'));

    await waitFor(() => {
      expect(screen.getByText('Nome da empresa é obrigatório')).toBeTruthy();
    });
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('pre-fills form from stepData[1]', () => {
    render(
      <Step1
        tenantId="t1"
        stepData={{ 1: { nome: 'Empresa Teste', logo_url: 'https://img.com/logo.png', segmento: 'saude' } }}
        onAdvance={() => {}}
      />
    );

    const nomeInput = screen.getByPlaceholderText('Ex: Academia do Sucesso') as HTMLInputElement;
    expect(nomeInput.value).toBe('Empresa Teste');
  });

  it('calls both PATCH endpoints on successful submit', async () => {
    const onAdvance = vi.fn();
    render(<Step1 tenantId="t1" stepData={{}} onAdvance={onAdvance} />);

    const nomeInput = screen.getByPlaceholderText('Ex: Academia do Sucesso');
    fireEvent.change(nomeInput, { target: { value: 'Empresa X' } });
    fireEvent.click(screen.getByText('Próximo'));

    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith(2, 1));

    const calls = mockFetch.mock.calls as Array<[string, RequestInit]>;
    const urls = calls.map(([url]) => url);
    expect(urls.some((u) => u.includes('/onboarding/profile'))).toBe(true);
    expect(urls.some((u) => u.includes('/onboarding/progress'))).toBe(true);
  });
});
