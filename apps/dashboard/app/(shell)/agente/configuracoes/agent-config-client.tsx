'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Input, Button, AIAssistedTextarea, Label, cn } from '@leedi/ui';
import { Loader2, Check, ChevronRight } from 'lucide-react';

interface SalesMethodOption {
  id: string;
  titulo: string;
  descricao: string;
}

interface EstiloMensagem {
  tamanho: 'curto' | 'medio' | 'longo';
  formalidade: 'formal' | 'informal';
  emoji: boolean;
}

interface ToolsHabilitadas {
  consultar_base_conhecimento: boolean;
  agendar_followup: boolean;
  transferir_humano: boolean;
  adicionar_tag: boolean;
  solicitar_reengajamento: boolean;
}

interface AgentConfig {
  nomeAgente: string;
  persona: string;
  estiloMensagem: EstiloMensagem;
  limites: string;
  salesMethodId: string | null;
  modeloIa: 'sonnet' | 'haiku' | 'opus';
  toolsHabilitadas: ToolsHabilitadas;
  ativo: boolean;
}

interface Props {
  tenantId: string;
  salesMethods: SalesMethodOption[];
}

const TOOL_LABELS: Record<keyof ToolsHabilitadas, { titulo: string; descricao: string }> = {
  consultar_base_conhecimento: {
    titulo: 'Consultar base de conhecimento',
    descricao: 'Permite ao agente buscar respostas em FAQs e contornos de objeção.',
  },
  agendar_followup: {
    titulo: 'Agendar follow-up',
    descricao: 'Permite ao agente programar mensagens de acompanhamento.',
  },
  transferir_humano: {
    titulo: 'Transferir para humano',
    descricao: 'Permite ao agente encaminhar a conversa para um atendente.',
  },
  adicionar_tag: {
    titulo: 'Adicionar tag',
    descricao: 'Permite ao agente marcar o lead com tags durante a conversa.',
  },
  solicitar_reengajamento: {
    titulo: 'Solicitar reengajamento',
    descricao: 'Permite ao agente acionar o fluxo de reengajamento de leads frios.',
  },
};

const MODELO_OPTIONS: Array<{ value: AgentConfig['modeloIa']; label: string }> = [
  { value: 'sonnet', label: 'Sonnet (equilíbrio entre qualidade e custo)' },
  { value: 'haiku', label: 'Haiku (mais rápido e econômico)' },
  { value: 'opus', label: 'Opus (máxima qualidade)' },
];

const TAMANHO_OPTIONS: Array<{ value: EstiloMensagem['tamanho']; label: string }> = [
  { value: 'curto', label: 'Curto' },
  { value: 'medio', label: 'Médio' },
  { value: 'longo', label: 'Longo' },
];

const FORMALIDADE_OPTIONS: Array<{ value: EstiloMensagem['formalidade']; label: string }> = [
  { value: 'formal', label: 'Formal' },
  { value: 'informal', label: 'Informal' },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-input p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded px-3 py-1.5 text-sm font-medium transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export function AgentConfigClient({ tenantId, salesMethods }: Props) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // GET on mount triggers the default upsert (AC#2).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/tenants/${tenantId}/agent-config`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) setLoadError(data.error ?? 'Erro ao carregar configuração.');
          return;
        }
        const data = (await res.json()) as AgentConfig;
        if (!cancelled) setConfig(data);
      } catch {
        if (!cancelled) setLoadError('Erro de conexão. Tente novamente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function patch<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/agent-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error ?? 'Erro ao salvar.');
        return;
      }
      const updated = (await res.json()) as AgentConfig;
      setConfig(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setSaveError('Erro de conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando configuração…
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <div className="p-8">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError ?? 'Configuração indisponível.'}
        </div>
      </div>
    );
  }

  const selectedMethod = salesMethods.find((m) => m.id === config.salesMethodId);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações do agente</h1>
        <p className="text-sm text-muted-foreground">
          Defina como o agente se comporta em todas as conversas — sem escrever código.
        </p>
      </div>

      {/* Identidade */}
      <Section title="Identidade" description="Nome e personalidade do agente.">
        <div className="flex flex-col gap-2">
          <Label htmlFor="nome-agente">Nome do agente</Label>
          <Input
            id="nome-agente"
            value={config.nomeAgente}
            onChange={(e) => patch('nomeAgente', e.target.value)}
            placeholder="Ex.: Mari"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="persona">Persona</Label>
          <AIAssistedTextarea
            value={config.persona}
            onChange={(v) => patch('persona', v)}
            context="Persona de um agente de vendas no WhatsApp"
            placeholder="Descreva a personalidade, tom e papel do agente…"
            rows={5}
          />
        </div>
      </Section>

      {/* Estilo */}
      <Section title="Estilo" description="Como o agente escreve as mensagens.">
        <div className="flex flex-col gap-2">
          <Label>Tamanho das mensagens</Label>
          <SegmentedControl
            value={config.estiloMensagem.tamanho}
            options={TAMANHO_OPTIONS}
            onChange={(tamanho) =>
              patch('estiloMensagem', { ...config.estiloMensagem, tamanho })
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Formalidade</Label>
          <SegmentedControl
            value={config.estiloMensagem.formalidade}
            options={FORMALIDADE_OPTIONS}
            onChange={(formalidade) =>
              patch('estiloMensagem', { ...config.estiloMensagem, formalidade })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Usar emojis</Label>
            <p className="text-sm text-muted-foreground">
              Permite que o agente use emojis com moderação.
            </p>
          </div>
          <Toggle
            checked={config.estiloMensagem.emoji}
            onChange={(emoji) => patch('estiloMensagem', { ...config.estiloMensagem, emoji })}
            label="Usar emojis"
          />
        </div>
      </Section>

      {/* Limites */}
      <Section
        title="Limites"
        description="Regras e restrições que o agente nunca deve violar."
      >
        <AIAssistedTextarea
          value={config.limites}
          onChange={(v) => patch('limites', v)}
          context="Limites e restrições de um agente de vendas no WhatsApp"
          placeholder="Ex.: Nunca prometa garantia de resultados. Não fale de concorrentes…"
          rows={4}
        />
      </Section>

      {/* Método de venda */}
      <Section
        title="Método de venda"
        description="A metodologia que o agente usa para conduzir conversas."
      >
        <Link
          href="/agente/metodo"
          className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3 text-sm transition-colors hover:bg-muted/50"
        >
          <span>
            {selectedMethod ? (
              <span className="font-medium">{selectedMethod.titulo}</span>
            ) : (
              <span className="text-muted-foreground">Nenhum método selecionado</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            Alterar
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      </Section>

      {/* Ferramentas */}
      <Section
        title="Ferramentas"
        description="Habilite as ações que o agente pode executar durante a conversa."
      >
        <div className="flex flex-col divide-y divide-border">
          {(Object.keys(TOOL_LABELS) as Array<keyof ToolsHabilitadas>).map((tool) => (
            <div key={tool} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="pr-4">
                <p className="text-sm font-medium">{TOOL_LABELS[tool].titulo}</p>
                <p className="text-sm text-muted-foreground">{TOOL_LABELS[tool].descricao}</p>
              </div>
              <Toggle
                checked={config.toolsHabilitadas[tool]}
                onChange={(v) =>
                  patch('toolsHabilitadas', { ...config.toolsHabilitadas, [tool]: v })
                }
                label={TOOL_LABELS[tool].titulo}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Modelo de IA */}
      <Section
        title="Modelo de IA"
        description="O modelo que processa as conversas. Modelos avançados podem exigir planos superiores."
      >
        <select
          value={config.modeloIa}
          onChange={(e) => patch('modeloIa', e.target.value as AgentConfig['modeloIa'])}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {MODELO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Section>

      {/* Feedback + Save */}
      {saveError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <Check className="h-4 w-4" />
          Configuração salva com sucesso.
        </div>
      )}

      <div>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  );
}
