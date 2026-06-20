'use client';

import { useActionState, useEffect, useRef } from 'react';
import { connectWhatsapp, type ConnectState } from './actions';

interface ExistingConnection {
  phoneNumberId: string;
  wabaId: string;
  displayName: string | null;
  qualityRating: string | null;
  status: string;
}

interface ConnectFormProps {
  tenantId: string;
  existing: ExistingConnection | null;
}

const initialState: ConnectState = { status: 'idle' };

export function ConnectForm({ tenantId, existing }: ConnectFormProps) {
  const [state, formAction, isPending] = useActionState(connectWhatsapp, initialState);
  const tokenRef = useRef<HTMLInputElement>(null);

  // Clear token field on error per AC#2
  useEffect(() => {
    if (state.status === 'error' && tokenRef.current) {
      tokenRef.current.value = '';
    }
  }, [state]);

  const connected =
    state.status === 'success'
      ? state.result
      : existing?.status === 'conectado'
        ? {
            displayName: existing.displayName ?? '',
            qualityRating: existing.qualityRating ?? '',
            messagingTier: '',
            phoneNumberId: existing.phoneNumberId,
          }
        : null;

  return (
    <div className="space-y-6">
      {/* Success badge — green status indicator (AC#1) */}
      {connected && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3"
        >
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
          <span className="text-sm font-medium text-green-800">Conectado</span>
          <span className="text-sm text-green-700">
            — {connected.displayName || connected.phoneNumberId}
          </span>
        </div>
      )}

      {/* Error inline (AC#2) */}
      {state.status === 'error' && state.error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        {/* Hidden tenant ID */}
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div>
          <label htmlFor="phone_number_id" className="mb-1 block text-sm font-medium">
            Phone Number ID
          </label>
          <input
            id="phone_number_id"
            name="phone_number_id"
            type="text"
            required
            defaultValue={state.status === 'success' ? (state.result?.phoneNumberId ?? '') : (existing?.phoneNumberId ?? '')}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: 123456789012345"
          />
        </div>

        <div>
          <label htmlFor="waba_id" className="mb-1 block text-sm font-medium">
            WhatsApp Business Account ID
          </label>
          <input
            id="waba_id"
            name="waba_id"
            type="text"
            required
            defaultValue={state.status === 'success' ? '' : (existing?.wabaId ?? '')}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: 987654321098765"
          />
        </div>

        <div>
          <label htmlFor="access_token" className="mb-1 block text-sm font-medium">
            Token de Acesso
          </label>
          <input
            id="access_token"
            name="access_token"
            type="password"
            ref={tokenRef}
            required
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={existing ? '••••••••' : 'Cole seu token de acesso'}
          />
          {existing && (
            <p className="mt-1 text-xs text-muted-foreground">
              Token armazenado com segurança. Preencha apenas para atualizar.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Validando...' : 'Validar conexão'}
        </button>
      </form>
    </div>
  );
}
