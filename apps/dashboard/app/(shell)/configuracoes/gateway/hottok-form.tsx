'use client';
import { useState } from 'react';
import { Button, Input, Label } from '@leedi/ui';

interface Props {
  tenantId: string;
  initial: { hottokSet: boolean; webhookUrl: string | null };
}

export function HottokForm({ tenantId, initial }: Props) {
  const [hottok, setHottok] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hottokSet, setHottokSet] = useState(initial.hottokSet);
  const [webhookUrl, setWebhookUrl] = useState(initial.webhookUrl);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/gateway/hottok`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hottok }),
      });
      if (res.ok) {
        const data = (await res.json()) as { webhookUrl?: string };
        setHottokSet(true);
        if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
        setMsg('Salvo com sucesso.');
      } else {
        setMsg('Erro ao salvar.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gateway (Hottok)</h1>
        <p className="text-sm text-muted-foreground">
          Cole aqui o hottok gerado pelo Hotmart (Ferramentas &gt; Webhook, no painel do produtor) e
          configure a URL do webhook abaixo no painel do Hotmart.
        </p>
        <p className="text-sm font-medium">
          Status: {hottokSet ? 'configurado' : 'não configurado'}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hottok">Hottok</Label>
        <Input
          id="hottok"
          type="password"
          value={hottok}
          onChange={(e) => setHottok(e.target.value)}
          placeholder="Cole o hottok do Hotmart"
        />
      </div>
      {webhookUrl && (
        <div className="space-y-1.5">
          <Label htmlFor="webhookUrl">URL do webhook (configure no Hotmart)</Label>
          <Input id="webhookUrl" value={webhookUrl} readOnly onFocus={(e) => e.target.select()} />
        </div>
      )}
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <Button onClick={save} disabled={saving || !hottok.trim()}>
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
}
