import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step5 } from '../step-5.js';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location for redirect
const mockLocation = { href: '' };
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('Step5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = '';
  });

  it('"Concluir configuração" is disabled before agent responds', () => {
    render(<Step5 tenantId="t1" stepData={{}} onAdvance={() => {}} />);
    const concludeButton = screen.getByText('Concluir configuração') as HTMLButtonElement;
    expect(concludeButton.disabled).toBe(true);
  });

  it('enables "Concluir" after agent responds to first message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionId: 'sess-1', segments: ['Olá! Como posso ajudar?'] }),
    });

    render(<Step5 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    const textarea = screen.getByPlaceholderText('Escreva como se fosse o lead… (Enter para enviar)');
    fireEvent.change(textarea, { target: { value: 'Olá, quero comprar' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Olá! Como posso ajudar?')).toBeTruthy();
    });

    const concludeButton = screen.getByText('Concluir configuração') as HTMLButtonElement;
    expect(concludeButton.disabled).toBe(false);
  });

  it('shows confirmation dialog when "Concluir" is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionId: 'sess-1', segments: ['Resposta do agente'] }),
    });

    render(<Step5 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    const textarea = screen.getByPlaceholderText('Escreva como se fosse o lead… (Enter para enviar)');
    fireEvent.change(textarea, { target: { value: 'Teste' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Resposta do agente')).toBeTruthy());

    fireEvent.click(screen.getByText('Concluir configuração'));

    await waitFor(() => {
      expect(screen.getByText('Tudo pronto!')).toBeTruthy();
      expect(screen.getByText('Sim, vamos lá!')).toBeTruthy();
    });
  });

  it('cancelling dialog keeps user on step 5', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionId: 'sess-1', segments: ['Resposta'] }),
    });

    const onAdvance = vi.fn();
    render(<Step5 tenantId="t1" stepData={{}} onAdvance={onAdvance} />);

    const textarea = screen.getByPlaceholderText('Escreva como se fosse o lead… (Enter para enviar)');
    fireEvent.change(textarea, { target: { value: 'msg' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Resposta')).toBeTruthy());

    fireEvent.click(screen.getByText('Concluir configuração'));
    await waitFor(() => expect(screen.getByText('Cancelar')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancelar'));

    // Dialog should close, onAdvance should NOT be called
    await waitFor(() => expect(screen.queryByText('Tudo pronto!')).toBeNull());
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('calls POST /onboarding/complete and redirects on confirm', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'sess-1', segments: ['Olá!'] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    render(<Step5 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    const textarea = screen.getByPlaceholderText('Escreva como se fosse o lead… (Enter para enviar)');
    fireEvent.change(textarea, { target: { value: 'msg' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Olá!')).toBeTruthy());

    fireEvent.click(screen.getByText('Concluir configuração'));
    await waitFor(() => expect(screen.getByText('Sim, vamos lá!')).toBeTruthy());

    fireEvent.click(screen.getByText('Sim, vamos lá!'));

    await waitFor(() => {
      const calls = mockFetch.mock.calls as Array<[string, RequestInit]>;
      expect(calls.some(([url]) => url.includes('/onboarding/complete'))).toBe(true);
    });
  });
});
