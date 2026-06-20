import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HottokForm } from '../hottok-form';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ webhookUrl: 'https://api.example.com/webhooks/hotmart/abc' }) }) as Response)
  );
});

describe('HottokForm (P2-3)', () => {
  it('PUTs hottok to the gateway proxy on submit', async () => {
    render(<HottokForm tenantId="t1" initial={{ hottokSet: false, webhookUrl: null }} />);
    fireEvent.change(screen.getByLabelText(/Hottok/), { target: { value: 'real-hottok-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(call?.[0]).toContain('/api/tenants/t1/gateway/hottok');
      expect(JSON.parse(call![1]!.body as string)).toMatchObject({ hottok: 'real-hottok-123' });
    });
  });
});
