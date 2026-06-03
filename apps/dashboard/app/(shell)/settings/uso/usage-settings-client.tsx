'use client';

import { useEffect, useState } from 'react';

interface UsageSettings {
  bloquear_ao_atingir_limite: boolean;
  notificar_overage_a_cada: number;
}

interface UsageSettingsClientProps {
  tenantId: string;
}

export function UsageSettingsClient({ tenantId }: UsageSettingsClientProps) {
  const [settings, setSettings] = useState<UsageSettings>({
    bloquear_ao_atingir_limite: false,
    notificar_overage_a_cada: 100,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current config from /usage/current (includes bloquearAoAtingirLimite + notificarOverageA).
  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/usage/current`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { bloquearAoAtingirLimite?: boolean; notificarOverageA?: number } | null) => {
        if (data) {
          setSettings({
            bloquear_ao_atingir_limite: data.bloquearAoAtingirLimite ?? false,
            notificar_overage_a_cada: data.notificarOverageA ?? 100,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function patchSetting(patch: Partial<UsageSettings>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/usage/settings`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as { config: Record<string, unknown> };
        setSettings((prev) => ({
          bloquear_ao_atingir_limite:
            typeof data.config['bloquear_ao_atingir_limite'] === 'boolean'
              ? data.config['bloquear_ao_atingir_limite']
              : prev.bloquear_ao_atingir_limite,
          notificar_overage_a_cada:
            typeof data.config['notificar_overage_a_cada'] === 'number'
              ? data.config['notificar_overage_a_cada']
              : prev.notificar_overage_a_cada,
        }));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold">Configurações de Uso</h1>

      <div className="max-w-lg space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        {/* Toggle: Bloquear ao atingir limite */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Bloquear ao atingir limite</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Quando ativo, novas conversas são bloqueadas ao atingir o limite do plano.
              Por padrão, o sistema continua funcionando com overage (R$0,30/conversa).
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings.bloquear_ao_atingir_limite}
            disabled={saving}
            onClick={() =>
              patchSetting({
                bloquear_ao_atingir_limite: !settings.bloquear_ao_atingir_limite,
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
              settings.bloquear_ao_atingir_limite ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.bloquear_ao_atingir_limite ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <hr />

        {/* Toggle: Notificar a cada R$100 em overage */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Notificar a cada R$100 em excedente</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Receba uma notificação a cada R$100,00 acumulado em conversas excedentes.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings.notificar_overage_a_cada > 0}
            disabled={saving}
            onClick={() =>
              patchSetting({
                notificar_overage_a_cada:
                  settings.notificar_overage_a_cada > 0 ? 0 : 100,
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
              settings.notificar_overage_a_cada > 0 ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.notificar_overage_a_cada > 0 ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
