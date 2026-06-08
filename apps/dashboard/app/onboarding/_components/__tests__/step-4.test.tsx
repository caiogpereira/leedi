import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step4 } from '../step-4.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Step4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).includes('sales-methods')) {
        return {
          ok: true,
          json: async () => [
            { id: 'spin-id', titulo: 'SPIN Selling' },
            { id: 'aida-id', titulo: 'AIDA' },
          ],
        };
      }
      // agent-config GET → return empty
      if ((url as string).includes('agent-config')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it('"Próximo" is disabled until save succeeds', async () => {
    render(<Step4 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    await waitFor(() => expect(screen.getByText('SPIN Selling')).toBeTruthy());

    const nextButton = screen.getByText('Próximo') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);
  });

  it('pre-fills nome from existing agent config', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).includes('sales-methods')) {
        return { ok: true, json: async () => [{ id: 'spin-id', titulo: 'SPIN Selling' }] };
      }
      if ((url as string).includes('agent-config')) {
        return {
          ok: true,
          json: async () => ({ nomeAgente: 'Mari', persona: '', salesMethodId: 'spin-id' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<Step4 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    await waitFor(() => {
      const nomeInput = screen.getByPlaceholderText('Ex: Mari, Sofia, Carlos') as HTMLInputElement;
      expect(nomeInput.value).toBe('Mari');
    });
  });

  it('shows validation error when nome is empty on save', async () => {
    render(<Step4 tenantId="t1" stepData={{}} onAdvance={() => {}} />);
    await waitFor(() => expect(screen.getByText('SPIN Selling')).toBeTruthy());

    fireEvent.click(screen.getByText('Salvar configuração'));

    await waitFor(() => {
      expect(screen.getByText('Nome do agente é obrigatório')).toBeTruthy();
    });
  });

  it('shows validation error when sales method is not selected', async () => {
    render(<Step4 tenantId="t1" stepData={{}} onAdvance={() => {}} />);
    await waitFor(() => expect(screen.getByText('SPIN Selling')).toBeTruthy());

    // Fill nome but not sales method
    fireEvent.change(screen.getByPlaceholderText('Ex: Mari, Sofia, Carlos'), { target: { value: 'Sofia' } });
    fireEvent.click(screen.getByText('Salvar configuração'));

    await waitFor(() => {
      expect(screen.getByText('Selecione um método de vendas')).toBeTruthy();
    });
  });
});
