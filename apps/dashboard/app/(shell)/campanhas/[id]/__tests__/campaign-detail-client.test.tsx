import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignDetailClient } from '../campaign-detail-client';

const CAMPAIGN = {
  id: 'c1', nome: 'Lançamento Club', tipo: 'lancamento', fase: 'aquecimento',
  status: 'rascunho', produtoNome: 'Libras A2 Club', config: {},
};
const PRODUCTS = [
  { id: 'p-club', nome: 'Libras A2 Club' },
  { id: 'p-box', nome: 'Box de Êxodo' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return { ok: true, json: async () => ({ ...CAMPAIGN, config: JSON.parse(init.body as string).config }) } as Response;
    }
    return { ok: true, json: async () => CAMPAIGN } as Response; // GET on mount
  }));
});

describe('CampaignDetailClient — downsell product (P0-2b)', () => {
  it('saves config.downsell.produto_id from the downsell tab selector', async () => {
    render(<CampaignDetailClient tenantId="t1" campaignId="c1" products={PRODUCTS} />);

    await screen.findByText('Lançamento Club');
    fireEvent.click(screen.getByRole('button', { name: 'Downsell' }));
    fireEvent.change(await screen.findByLabelText('Produto de downsell'), { target: { value: 'p-box' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar fase/ }));

    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch![1]!.body as string).config.downsell.produto_id).toBe('p-box');
    });
  });
});
