import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignListClient } from '../campaign-list-client';

const PRODUCTS = [
  { id: 'p1', nome: 'Libras A2 Club' },
  { id: 'p2', nome: 'Box de Êxodo' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'new-camp' }) } as Response;
    }
    return { ok: true, json: async () => [] } as Response; // GET list
  }));
  // jsdom não implementa navegação
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
});

describe('CampaignListClient — product selector (P0-2)', () => {
  it('lists products in the create dialog and posts produtoId', async () => {
    render(<CampaignListClient tenantId="t1" products={PRODUCTS} />);

    fireEvent.click(screen.getAllByText('Nova campanha')[0]!);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lançamento Junho' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'lancamento' } });
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByText('Criar campanha'));

    await waitFor(() => {
      const fetchMock = window.fetch as unknown as ReturnType<typeof vi.fn>;
      const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(postCall![1]!.body as string)).toMatchObject({
        nome: 'Lançamento Junho',
        tipo: 'lancamento',
        produtoId: 'p1',
      });
    });
  });
});
