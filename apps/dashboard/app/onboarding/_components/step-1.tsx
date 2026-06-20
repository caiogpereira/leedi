'use client';

import { useState } from 'react';
import { Button, Input, Label } from '@leedi/ui';

interface Props {
  tenantId: string;
  stepData: Record<number, Record<string, unknown>>;
  onAdvance: (step: number, completedStep?: number) => void;
}

const SEGMENTOS = [
  { value: 'infoproduto', label: 'Infoproduto' },
  { value: 'educacao', label: 'Educação' },
  { value: 'saude', label: 'Saúde' },
  { value: 'consultoria', label: 'Consultoria' },
  { value: 'e-commerce', label: 'E-commerce' },
  { value: 'outros', label: 'Outros' },
];

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function Step1({ tenantId, stepData, onAdvance }: Props) {
  const saved = stepData[1] ?? {};
  const [nome, setNome] = useState((saved['nome'] as string) ?? '');
  const [logoUrl, setLogoUrl] = useState((saved['logo_url'] as string) ?? '');
  const [segmento, setSegmento] = useState((saved['segmento'] as string) ?? '');
  const [cnpj, setCnpj] = useState((saved['cnpj'] as string) ?? '');
  const [endereco, setEndereco] = useState((saved['endereco'] as string) ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleNext() {
    if (!nome.trim()) {
      setError('Nome da empresa é obrigatório');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const [profileRes, progressRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/onboarding/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nome.trim(), logo_url: logoUrl || undefined, segmento: segmento || undefined, cnpj: cnpj || undefined, endereco: endereco || undefined }),
        }),
        fetch(`/api/tenants/${tenantId}/onboarding/progress`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 1, data: { nome: nome.trim(), logo_url: logoUrl, segmento, cnpj, endereco } }),
        }),
      ]);

      if (!profileRes.ok || !progressRes.ok) {
        setError('Erro ao salvar. Tente novamente.');
        return;
      }

      onAdvance(2, 1);
    } catch {
      setError('Erro de rede. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Dados da empresa</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Vamos começar com as informações básicas da sua empresa.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="nome">Nome da empresa *</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Academia do Sucesso"
            className="mt-1"
          />
          {error && <p className="text-destructive text-sm mt-1">{error}</p>}
        </div>

        <div>
          <Label htmlFor="logo_url">URL do logo (opcional)</Label>
          <Input
            id="logo_url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://sua-empresa.com/logo.png"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="segmento">Segmento</Label>
          <select
            id="segmento"
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
            className={`${SELECT_CLASS} mt-1`}
          >
            <option value="">Selecione o segmento</option>
            {SEGMENTOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="cnpj">CNPJ (opcional)</Label>
          <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="endereco">Endereço (opcional)</Label>
          <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade - UF" className="mt-1" />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleNext} disabled={submitting}>
          {submitting ? 'Salvando...' : 'Próximo'}
        </Button>
      </div>
    </div>
  );
}
