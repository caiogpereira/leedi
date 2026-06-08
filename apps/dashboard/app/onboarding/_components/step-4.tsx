'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Label, AIAssistedTextarea } from '@leedi/ui';
import { CheckCircle } from 'lucide-react';

interface Props {
  tenantId: string;
  stepData: Record<number, Record<string, unknown>>;
  onAdvance: (step: number, completedStep?: number) => void;
}

interface SalesMethod {
  id: string;
  titulo: string;
}

interface AgentConfig {
  nomeAgente?: string;
  persona?: string;
  salesMethodId?: string | null;
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function Step4({ tenantId, stepData, onAdvance }: Props) {
  const saved = stepData[4] ?? {};
  const [nomeAgente, setNomeAgente] = useState((saved['agente_nome'] as string) ?? '');
  const [persona, setPersona] = useState('');
  const [salesMethodId, setSalesMethodId] = useState((saved['sales_method_id'] as string) ?? '');
  const [salesMethods, setSalesMethods] = useState<SalesMethod[]>([]);
  const [saved2, setSaved2] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/sales-methods`)
      .then((r) => r.json() as Promise<SalesMethod[]>)
      .then(setSalesMethods)
      .catch(() => null);

    fetch(`/api/tenants/${tenantId}/agent-config`)
      .then((r) => r.json() as Promise<AgentConfig>)
      .then((cfg) => {
        if (cfg.nomeAgente) setNomeAgente(cfg.nomeAgente);
        if (cfg.persona) setPersona(cfg.persona);
        if (cfg.salesMethodId) setSalesMethodId(cfg.salesMethodId);
      })
      .catch(() => null);
  }, [tenantId]);

  async function handleSave() {
    if (!nomeAgente.trim()) {
      setError('Nome do agente é obrigatório');
      return;
    }
    if (!salesMethodId) {
      setError('Selecione um método de vendas');
      return;
    }
    setError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/agent-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeAgente: nomeAgente.trim(),
          persona,
          salesMethodId,
        }),
      });

      if (!res.ok) {
        setError('Erro ao salvar configuração. Tente novamente.');
        return;
      }

      setSaved2(true);
    } catch {
      setError('Erro de rede. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    if (!saved2) return;
    setSubmitting(true);

    const selectedMethod = salesMethods.find((m) => m.id === salesMethodId);

    try {
      await fetch(`/api/tenants/${tenantId}/onboarding/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 4,
          data: {
            agente_nome: nomeAgente.trim(),
            sales_method_id: salesMethodId,
            sales_method: selectedMethod?.titulo ?? salesMethodId,
          },
        }),
      });
      onAdvance(5, 4);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedMethod = salesMethods.find((m) => m.id === salesMethodId);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Configurar agente</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Defina como seu agente de IA vai se apresentar e vender.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="nome_agente">Nome do agente *</Label>
          <Input
            id="nome_agente"
            value={nomeAgente}
            onChange={(e) => setNomeAgente(e.target.value)}
            placeholder="Ex: Mari, Sofia, Carlos"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Persona (opcional)</Label>
          <div className="mt-1">
            <AIAssistedTextarea
              value={persona}
              onChange={(v) => setPersona(v)}
              context="agent persona for sales conversations"
              placeholder="Descreva como o agente deve se comportar..."
              rows={3}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="metodo_venda">Método de vendas *</Label>
          <select
            id="metodo_venda"
            value={salesMethodId}
            onChange={(e) => setSalesMethodId(e.target.value)}
            className={`${SELECT_CLASS} mt-1`}
          >
            <option value="">Selecione o método</option>
            {salesMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mt-3">{error}</p>}

      {saved2 && selectedMethod && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>
            Seu agente <strong>{nomeAgente}</strong> está pronto para usar o método{' '}
            <strong>{selectedMethod.titulo}</strong>.
          </span>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </Button>
        <Button onClick={handleNext} disabled={!saved2 || submitting}>
          {submitting ? 'Salvando...' : 'Próximo'}
        </Button>
      </div>
    </div>
  );
}
