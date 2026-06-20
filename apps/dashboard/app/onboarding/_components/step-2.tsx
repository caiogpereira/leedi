'use client';

import { useState } from 'react';
import { Button, Input, Label } from '@leedi/ui';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  tenantId: string;
  stepData: Record<number, Record<string, unknown>>;
  onAdvance: (step: number, completedStep?: number) => void;
}

interface ConnectResult {
  status: string;
  displayName: string;
  phoneNumberId: string;
}

export function Step2({ tenantId, stepData, onAdvance }: Props) {
  const saved = stepData[2] ?? {};
  const [phoneNumberId, setPhoneNumberId] = useState((saved['phone_number_id'] as string) ?? '');
  const [wabaId, setWabaId] = useState((saved['waba_id'] as string) ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null);
  const [validationError, setValidationError] = useState('');
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleValidate() {
    setValidating(true);
    setValidationError('');
    setConnectResult(null);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/whatsapp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          access_token: accessToken,
        }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        setValidationError(
          (data['error'] as string) ?? 'Credenciais inválidas. Verifique e tente novamente.'
        );
        return;
      }

      setConnectResult(data as unknown as ConnectResult);
    } catch {
      setValidationError('Erro de rede. Tente novamente.');
    } finally {
      setValidating(false);
    }
  }

  async function handleSkip() {
    // F-34: WhatsApp connection requires Meta credentials the user may not have
    // ready. Mirror the Gateway step's skip so onboarding is never hard-blocked —
    // the number can be connected later in /configuracoes/whatsapp.
    setSubmitting(true);
    try {
      await fetch(`/api/tenants/${tenantId}/onboarding/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 2, data: { skipped: true } }),
      });
      onAdvance(3, 2);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    if (!connectResult) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/onboarding/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 2,
          data: {
            phone_number_id: phoneNumberId,
            waba_id: wabaId,
            // access_token is NOT stored in stepData (security — already encrypted in connections table)
          },
        }),
      });

      if (!res.ok) return;
      onAdvance(3, 2);
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Conectar WhatsApp</h2>
      <p className="text-muted-foreground text-sm mb-4">
        Conecte seu número de WhatsApp Business à Leedi.
      </p>

      <div className="bg-muted/50 rounded-lg p-4 mb-6 text-sm space-y-1">
        <p className="font-medium mb-2">O que você vai precisar:</p>
        <p>✅ Conta Meta Business</p>
        <p>✅ Phone Number ID</p>
        <p>✅ WABA ID (WhatsApp Business Account ID)</p>
        <p>✅ Token de acesso permanente</p>
        <div className="mt-3 p-3 border rounded text-center text-muted-foreground">
          Veja o tutorial em vídeo
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="phone_number_id">Phone Number ID *</Label>
          <Input
            id="phone_number_id"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="waba_id">WABA ID *</Label>
          <Input
            id="waba_id"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="123456789012345"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="access_token">Token de acesso *</Label>
          <Input
            id="access_token"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="EAAxxxxx..."
            className="mt-1"
          />
        </div>
      </div>

      {connectResult && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Número conectado: {connectResult.displayName}</span>
        </div>
      )}

      {validationError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={validating || !phoneNumberId || !wabaId || !accessToken}
          >
            {validating ? 'Validando...' : 'Validar conexão'}
          </Button>
          <button
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={handleSkip}
            disabled={submitting}
          >
            Pular por enquanto
          </button>
        </div>

        <Button onClick={handleNext} disabled={!connectResult || submitting}>
          {submitting ? 'Salvando...' : 'Próximo'}
        </Button>
      </div>
    </div>
  );
}
