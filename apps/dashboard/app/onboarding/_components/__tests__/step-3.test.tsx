import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step3 } from '../step-3.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Step3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).includes('gateway-webhook-url')) {
        return { ok: true, json: async () => ({ url: 'https://api.leedi.digital/webhooks/hotmart/abc123' }) };
      }
      if ((url as string).includes('gateway-confirmed')) {
        return { ok: true, json: async () => ({ confirmed: false }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it('renders webhook URL after loading', async () => {
    render(<Step3 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.leedi.digital/webhooks/hotmart/abc123')).toBeTruthy();
    });
  });

  it('"Próximo" is disabled when gateway is not yet confirmed', async () => {
    render(<Step3 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Aguardando webhook do Hotmart...')).toBeTruthy();
    });

    const nextButton = screen.getByText('Próximo') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);
  });

  it('"Pular por enquanto" advances wizard to step 4 without confirmation', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).includes('gateway-webhook-url')) {
        return { ok: true, json: async () => ({ url: 'https://api.leedi.digital/webhooks/hotmart/abc123' }) };
      }
      if ((url as string).includes('gateway-confirmed')) {
        return { ok: true, json: async () => ({ confirmed: false }) };
      }
      if ((url as string).includes('onboarding/progress')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const onAdvance = vi.fn();
    render(<Step3 tenantId="t1" stepData={{}} onAdvance={onAdvance} />);

    await waitFor(() => expect(screen.getByText('Pular por enquanto')).toBeTruthy());

    fireEvent.click(screen.getByText('Pular por enquanto'));

    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith(4, 3));
  });

  it('saves the HOTTOK and surfaces the returned webhook URL (PL-20)', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((url as string).includes('gateway-webhook-url')) {
        return { ok: true, json: async () => ({ url: null }) };
      }
      if ((url as string).includes('gateway-confirmed')) {
        return { ok: true, json: async () => ({ confirmed: false }) };
      }
      if ((url as string).includes('/gateway/hottok')) {
        if (init?.method === 'PUT') {
          return {
            ok: true,
            json: async () => ({ webhookUrl: 'https://api.leedi.digital/webhooks/hotmart/new-path' }),
          };
        }
        return { ok: true, json: async () => ({ hottokSet: false, webhookUrl: null }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<Step3 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    const input = await screen.findByPlaceholderText('Cole o hottok do Hotmart');
    fireEvent.change(input, { target: { value: 'my-real-hottok' } });
    fireEvent.click(screen.getByText('Salvar'));

    // The PUT body carries the pasted hottok.
    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        (call) =>
          (call[0] as string).includes('/gateway/hottok') &&
          (call[1] as RequestInit | undefined)?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({ hottok: 'my-real-hottok' });
    });

    // The webhook URL returned by the save is surfaced for copying.
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('https://api.leedi.digital/webhooks/hotmart/new-path')
      ).toBeTruthy();
    });
  });

  it('shows confirmed state when gateway-confirmed returns true', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).includes('gateway-webhook-url')) {
        return { ok: true, json: async () => ({ url: 'https://api.leedi.digital/webhooks/hotmart/abc123' }) };
      }
      if ((url as string).includes('gateway-confirmed')) {
        return { ok: true, json: async () => ({ confirmed: true }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<Step3 tenantId="t1" stepData={{}} onAdvance={() => {}} />);

    // Wait for polling to pick up the confirmed state
    await waitFor(
      () => {
        expect(screen.getByText('Webhook confirmado!')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    const nextButton = screen.getByText('Próximo') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(false);
  });
});
