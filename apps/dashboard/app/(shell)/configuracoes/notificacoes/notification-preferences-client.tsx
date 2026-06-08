'use client';

import { useEffect, useState, useCallback } from 'react';

type EventType =
  | 'venda_aprovada'
  | 'lead_pediu_humano'
  | 'template_rejeitado'
  | 'quality_caindo'
  | 'conta_bloqueada'
  | 'disparo_concluido'
  | 'alerta_uso';

interface EventPreference {
  push: boolean;
  email: boolean;
}

interface Preferences {
  canais: { push: boolean; email: boolean };
  eventos: Partial<Record<EventType, EventPreference>>;
}

const EVENT_LABELS: Record<EventType, string> = {
  venda_aprovada: 'Nova venda aprovada',
  lead_pediu_humano: 'Lead pediu atendimento humano',
  template_rejeitado: 'Template rejeitado pela Meta',
  quality_caindo: 'Qualidade do número caindo',
  conta_bloqueada: 'Conta bloqueada por inadimplência',
  disparo_concluido: 'Disparo de mensagens concluído',
  alerta_uso: 'Alerta de uso de conversas',
};

const EVENT_TYPES = Object.keys(EVENT_LABELS) as EventType[];

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function NotificationPreferencesClient({ tenantId }: { tenantId: string }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // tracks which key is saving

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/notification-preferences`)
      .then((r) => r.json())
      .then((data: Preferences) => setPreferences(data))
      .catch(() => setError('Não foi possível carregar as preferências.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleToggle = useCallback(
    async (tipo: EventType, canal: 'push' | 'email', enabled: boolean) => {
      if (!preferences) return;
      const key = `${tipo}-${canal}`;
      setSaving(key);

      // Optimistic update
      setPreferences((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          eventos: {
            ...prev.eventos,
            [tipo]: {
              ...(prev.eventos[tipo] ?? { push: true, email: true }),
              [canal]: enabled,
            },
          },
        };
      });

      try {
        await fetch(`/api/tenants/${tenantId}/notification-preferences`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tipo, canal, enabled }),
        });
      } catch {
        // Revert optimistic update on failure
        setPreferences((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            eventos: {
              ...prev.eventos,
              [tipo]: {
                ...(prev.eventos[tipo] ?? { push: true, email: true }),
                [canal]: !enabled,
              },
            },
          };
        });
        setError('Falha ao salvar preferência.');
      } finally {
        setSaving(null);
      }
    },
    [preferences, tenantId]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (error && !preferences) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!preferences) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notificações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha quais eventos você quer receber e por qual canal.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Evento</th>
              <th className="px-4 py-3 text-center font-medium">Push</th>
              <th className="px-4 py-3 text-center font-medium">E-mail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {EVENT_TYPES.map((tipo) => {
              const pref = preferences.eventos[tipo] ?? { push: true, email: true };
              return (
                <tr key={tipo} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{EVENT_LABELS[tipo]}</td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      checked={pref.push}
                      onChange={(val) => handleToggle(tipo, 'push', val)}
                      disabled={saving === `${tipo}-push`}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      checked={pref.email}
                      onChange={(val) => handleToggle(tipo, 'email', val)}
                      disabled={saving === `${tipo}-email`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
