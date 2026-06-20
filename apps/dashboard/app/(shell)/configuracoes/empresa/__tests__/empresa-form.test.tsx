import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmpresaForm } from '../empresa-form';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }) as Response));
});

describe('EmpresaForm (P2-2)', () => {
  it('PATCHes profile with cnpj and endereco', async () => {
    render(<EmpresaForm tenantId="t1" initial={{ nome: 'Acme', cnpj: '', endereco: '' }} />);
    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '12.345.678/0001-90' } });
    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua A, 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(call?.[0]).toContain('/api/tenants/t1/onboarding/profile');
      expect(JSON.parse(call![1]!.body as string)).toMatchObject({ cnpj: '12.345.678/0001-90', endereco: 'Rua A, 1' });
    });
  });
});
