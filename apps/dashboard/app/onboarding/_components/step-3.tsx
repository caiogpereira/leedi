'use client';

import { useState, useEffect, useRef } from 'react';
import { Button, Input, Label } from '@leedi/ui';
import { CheckCircle, Clock, Copy } from 'lucide-react';

interface Props {
  tenantId: string;
  stepData: Record<number, Record<string, unknown>>;
  onAdvance: (step: number, completedStep?: number) => void;
}

export function Step3({ tenantId, onAdvance }: Props) {
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hottok, setHottok] = useState('');
  const [hottokSet, setHottokSet] = useState(false);
  const [savingHottok, setSavingHottok] = useState(false);
  const [hottokMsg, setHottokMsg] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/onboarding/gateway-webhook-url`)
      .then((r) => r.json() as Promise<{ url: string | null }>)
      .then((data) => setWebhookUrl(data.url))
      .catch(() => null);
  }, [tenantId]);

  // Load any HOTTOK already saved (e.g. returning to onboarding). The webhook
  // URL only exists once a gateway row does, so prefer this URL when present.
  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/gateway/hottok`)
      .then((r) => r.json() as Promise<{ hottokSet?: boolean; webhookUrl?: string | null }>)
      .then((data) => {
        if (data.hottokSet) setHottokSet(true);
        if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      })
      .catch(() => null);
  }, [tenantId]);

  async function handleSaveHottok() {
    if (!hottok.trim()) return;
    setSavingHottok(true);
    setHottokMsg(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/gateway/hottok`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hottok: hottok.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { webhookUrl?: string };
        setHottokSet(true);
        // Saving the HOTTOK creates the gateway row, so the webhook URL is now
        // available — surface it so the user can paste it into Hotmart.
        if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
        setHottokMsg('Hottok salvo. Agora configure a URL do webhook no Hotmart.');
      } else {
        setHottokMsg('Erro ao salvar o hottok.');
      }
    } finally {
      setSavingHottok(false);
    }
  }

  useEffect(() => {
    if (confirmed) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}/onboarding/gateway-confirmed`);
        const data = await res.json() as { confirmed: boolean };
        if (data.confirmed) {
          setConfirmed(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tenantId, confirmed]);

  async function handleCopy() {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSkip() {
    setSubmitting(true);
    try {
      await fetch(`/api/tenants/${tenantId}/onboarding/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 3, data: { skipped: true } }),
      });
      onAdvance(4, 3);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await fetch(`/api/tenants/${tenantId}/onboarding/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 3, data: { confirmed: true } }),
      });
      onAdvance(4, 3);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Conectar gateway de pagamento</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Conecte o Hotmart para sincronizar seus leads e compras automaticamente.
      </p>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">Gateway selecionado: <span className="text-primary">Hotmart</span></p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hottok">Hottok do Hotmart</Label>
          <p className="text-xs text-muted-foreground">
            No painel do Hotmart (Ferramentas &gt; Webhook), copie o seu hottok e cole aqui — é o que
            autentica as entregas do Hotmart na Leedi.
          </p>
          <div className="flex gap-2">
            <Input
              id="hottok"
              type="password"
              value={hottok}
              onChange={(e) => setHottok(e.target.value)}
              placeholder={hottokSet ? 'Hottok configurado — cole para atualizar' : 'Cole o hottok do Hotmart'}
            />
            <Button variant="outline" onClick={handleSaveHottok} disabled={savingHottok || !hottok.trim()}>
              {savingHottok ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
          {hottokSet && !hottokMsg && (
            <p className="text-sm text-green-600">Hottok configurado.</p>
          )}
          {hottokMsg && <p className="text-sm text-muted-foreground">{hottokMsg}</p>}
        </div>

        {webhookUrl ? (
          <div>
            <p className="text-sm mb-2">
              Copie este URL e cole nas configurações de webhooks do Hotmart:
            </p>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copied && <p className="text-sm text-green-600 mt-1">URL copiado!</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Salve seu hottok acima para gerar a URL do webhook.
          </p>
        )}

        <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${
          confirmed
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-muted/50 border-muted text-muted-foreground'
        }`}>
          {confirmed ? (
            <><CheckCircle className="w-4 h-4 shrink-0" /><span>Webhook confirmado!</span></>
          ) : (
            <><Clock className="w-4 h-4 shrink-0" /><span>Aguardando webhook do Hotmart...</span></>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          className="text-sm text-muted-foreground hover:text-foreground underline"
          onClick={handleSkip}
          disabled={submitting}
        >
          Pular por enquanto
        </button>

        <Button onClick={handleNext} disabled={!confirmed || submitting}>
          Próximo
        </Button>
      </div>
    </div>
  );
}
