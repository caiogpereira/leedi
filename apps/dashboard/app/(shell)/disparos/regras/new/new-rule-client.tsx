'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@leedi/ui';

interface Template {
  id: string;
  nome: string;
}

const TRIGGERS: Array<{ value: string; label: string }> = [
  { value: 'carrinho_abandonado', label: 'Carrinho abandonado' },
  { value: 'boleto_gerado', label: 'Boleto gerado' },
  { value: 'pix_gerado', label: 'PIX gerado' },
  { value: 'sem_resposta_48h', label: 'Sem resposta 48h' },
  { value: 'fim_oferta_24h', label: 'Fim de oferta 24h' },
];

export function NewRuleClient({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [nome, setNome] = useState('');
  const [trigger, setTrigger] = useState('carrinho_abandonado');
  const [templateId, setTemplateId] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('60');
  const [ativo, setAtivo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/tenants/${tenantId}/templates?status=aprovado`);
      if (res.ok) setTemplates(await res.json());
    })();
  }, [tenantId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tenants/${tenantId}/dispatch-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nome,
        trigger,
        templateId,
        janelaTempo: { delay_minutes: Number(delayMinutes) || 60 },
        ativo,
      }),
    });
    if (res.ok) {
      router.push('/disparos/regras');
      return;
    }
    const payload = await res.json().catch(() => ({}));
    setError(payload.error ?? 'Falha ao criar a regra.');
    setSaving(false);
  }, [tenantId, nome, trigger, templateId, delayMinutes, ativo, router]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nova regra automática</h1>
        <p className="text-sm text-muted-foreground">
          Dispare um template aprovado quando um evento ocorrer.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Recuperar carrinho" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="trigger">Gatilho</Label>
        <select
          id="trigger"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="template">Template (aprovado)</Label>
        <select
          id="template"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Selecione um template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="delay">Atraso (minutos após o evento)</Label>
        <Input
          id="delay"
          type="number"
          min={0}
          value={delayMinutes}
          onChange={(e) => setDelayMinutes(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Ativar imediatamente (requer template aprovado)
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="button" onClick={save} disabled={!nome.trim() || !templateId || saving}>
        {saving ? 'Salvando…' : 'Criar regra'}
      </Button>
    </div>
  );
}
