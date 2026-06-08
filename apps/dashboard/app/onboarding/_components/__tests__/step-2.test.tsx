import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step2 } from '../step-2.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Step2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('"Próximo" button is disabled until validation succeeds', () => {
    render(<Step2 tenantId="t1" stepData={{}} onAdvance={() => {}} />);
    const nextButton = screen.getByText('Próximo') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);
  });

  it('shows success message after validation and enables Próximo', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'conectado', displayName: '+55 11 99999-9999', phoneNumberId: 'p1' }),
    });

    const onAdvance = vi.fn();
    render(<Step2 tenantId="t1" stepData={{}} onAdvance={onAdvance} />);

    const idInputs = screen.getAllByPlaceholderText('123456789012345') as HTMLInputElement[];
    fireEvent.change(idInputs[0]!, { target: { value: 'p1' } }); // phone_number_id
    fireEvent.change(idInputs[1]!, { target: { value: 'w1' } }); // waba_id
    fireEvent.change(screen.getByPlaceholderText('EAAxxxxx...'), { target: { value: 'token123' } });

    fireEvent.click(screen.getByText('Validar conexão'));

    await waitFor(() => {
      expect(screen.getByText(/Número conectado/)).toBeTruthy();
    });

    const nextButton = screen.getByText('Próximo') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(false);
  });

  it('does NOT include access_token in the progress PATCH stepData', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'conectado', displayName: '+55 11 99999-9999', phoneNumberId: 'p1' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const onAdvance = vi.fn();
    render(<Step2 tenantId="t1" stepData={{}} onAdvance={onAdvance} />);

    const idInputs = screen.getAllByPlaceholderText('123456789012345') as HTMLInputElement[];
    fireEvent.change(idInputs[0]!, { target: { value: 'p1' } });
    fireEvent.change(idInputs[1]!, { target: { value: 'w1' } });
    fireEvent.change(screen.getByPlaceholderText('EAAxxxxx...'), { target: { value: 'secret-token' } });

    fireEvent.click(screen.getByText('Validar conexão'));
    await waitFor(() => expect(screen.getByText(/Número conectado/)).toBeTruthy());

    fireEvent.click(screen.getByText('Próximo'));
    await waitFor(() => expect(onAdvance).toHaveBeenCalled());

    const calls = mockFetch.mock.calls as Array<[string, RequestInit]>;
    const progressCall = calls.find(([url]) => url.includes('/onboarding/progress'));
    expect(progressCall).toBeDefined();

    const body = JSON.parse(progressCall![1].body as string) as { data: Record<string, unknown> };
    expect(body.data['access_token']).toBeUndefined();
    expect(body.data['phone_number_id']).toBe('p1');
  });

  it('shows error when validation fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Credenciais invalidas.' }),
    });

    render(<Step2 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    const idInputs = screen.getAllByPlaceholderText('123456789012345') as HTMLInputElement[];
    fireEvent.change(idInputs[0]!, { target: { value: 'bad' } });
    fireEvent.change(idInputs[1]!, { target: { value: 'bad' } });
    fireEvent.change(screen.getByPlaceholderText('EAAxxxxx...'), { target: { value: 'bad' } });

    fireEvent.click(screen.getByText('Validar conexão'));

    await waitFor(() => {
      expect(screen.getByText('Credenciais invalidas.')).toBeTruthy();
    });

    const nextButton = screen.getByText('Próximo') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);
  });
});
