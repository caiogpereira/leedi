'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Save } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@leedi/ui';

interface PhaseConfig {
  urgencia?: string;
  mensagens_chave?: string[];
  transicao?: { tipo: 'manual' | 'data'; data?: string };
}

interface CampaignConfig {
  aquecimento?: PhaseConfig;
  carrinho_aberto?: PhaseConfig;
  downsell?: PhaseConfig & { produto_id?: string };
}

interface ProductOption {
  id: string;
  nome: string;
}

interface Campaign {
  id: string;
  nome: string;
  tipo: 'lancamento' | 'downsell' | 'perpetuo';
  fase: 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';
  status: 'rascunho' | 'ativa' | 'pausada' | 'encerrada';
  produtoNome: string | null;
  config: CampaignConfig;
}

const STATUS_BADGE: Record<Campaign['status'], string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  ativa: 'bg-green-100 text-green-700',
  pausada: 'bg-yellow-100 text-yellow-800',
  encerrada: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<Campaign['status'], string> = {
  rascunho: 'Rascunho',
  ativa: 'Ativa',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};

const FASE_LABEL: Record<Campaign['fase'], string> = {
  aquecimento: 'Aquecimento',
  carrinho_aberto: 'Carrinho Aberto',
  downsell: 'Downsell',
  encerrada: 'Encerrada',
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

type PhaseKey = 'aquecimento' | 'carrinho_aberto' | 'downsell';

const PHASE_TABS: { key: PhaseKey; label: string }[] = [
  { key: 'aquecimento', label: 'Aquecimento' },
  { key: 'carrinho_aberto', label: 'Carrinho Aberto' },
  { key: 'downsell', label: 'Downsell' },
];

function PhaseConfigEditor({
  phaseKey,
  config,
  onSave,
  saving,
  products,
}: {
  phaseKey: PhaseKey;
  config: PhaseConfig;
  onSave: (key: PhaseKey, cfg: PhaseConfig) => Promise<void>;
  saving: boolean;
  products?: ProductOption[];
}) {
  const [urgencia, setUrgencia] = useState(config.urgencia ?? '');
  const [mensagens, setMensagens] = useState((config.mensagens_chave ?? []).join('\n'));
  const [transicaoTipo, setTransicaoTipo] = useState<'manual' | 'data'>(
    config.transicao?.tipo ?? 'manual'
  );
  const [transicaoData, setTransicaoData] = useState(config.transicao?.data ?? '');
  const [produtoId, setProdutoId] = useState((config as { produto_id?: string }).produto_id ?? '');

  async function handleSave() {
    const cfg: PhaseConfig & { produto_id?: string } = { transicao: { tipo: transicaoTipo } };
    if (urgencia) cfg.urgencia = urgencia;
    const lines = mensagens ? mensagens.split('\n').filter(Boolean) : [];
    if (lines.length > 0) cfg.mensagens_chave = lines;
    if (transicaoTipo === 'data' && transicaoData) {
      cfg.transicao = { tipo: 'data', data: transicaoData };
    }
    if (phaseKey === 'downsell' && produtoId) cfg.produto_id = produtoId;
    await onSave(phaseKey, cfg);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Mensagem de urgência</Label>
        <Input
          value={urgencia}
          onChange={(e) => setUrgencia(e.target.value)}
          placeholder="Ex: Últimas vagas! Oferta encerra amanhã."
        />
      </div>
      {phaseKey === 'downsell' && products && (
        <div className="space-y-1">
          <Label htmlFor="downsell-produto">Produto de downsell</Label>
          <select
            id="downsell-produto"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Usar o produto principal da campanha</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label>Mensagens-chave (uma por linha)</Label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
          value={mensagens}
          onChange={(e) => setMensagens(e.target.value)}
          placeholder={'Bônus exclusivo\nGarantia de 7 dias'}
        />
      </div>
      <div className="space-y-2">
        <Label>Transição de fase</Label>
        <div className="flex gap-2">
          {(['manual', 'data'] as const).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setTransicaoTipo(tipo)}
              className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                transicaoTipo === tipo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-input text-muted-foreground hover:bg-muted'
              }`}
            >
              {tipo === 'manual' ? 'Manual' : 'Por data'}
            </button>
          ))}
        </div>
        {transicaoTipo === 'data' && (
          <Input
            type="datetime-local"
            value={transicaoData}
            onChange={(e) => setTransicaoData(e.target.value)}
          />
        )}
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        <Save className="mr-2 h-3.5 w-3.5" />
        {saving ? 'Salvando...' : 'Salvar fase'}
      </Button>
    </div>
  );
}

export function CampaignDetailClient({
  tenantId,
  campaignId,
  products,
}: {
  tenantId: string;
  campaignId: string;
  products: ProductOption[];
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPhase, setSavingPhase] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<PhaseKey>('aquecimento');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const baseUrl = `/api/tenants/${tenantId}/campaigns/${campaignId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(baseUrl);
      if (res.ok) setCampaign(await res.json() as Campaign);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is a stable useCallback, not a render cascade
  useEffect(() => { load(); }, [load]);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  async function handlePhaseConfigSave(phaseKey: PhaseKey, cfg: PhaseConfig) {
    if (!campaign) return;
    setSavingPhase(true);
    try {
      const newConfig = { ...campaign.config, [phaseKey]: cfg };
      const res = await fetch(baseUrl, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: newConfig }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        showToast('error', data.error ?? 'Erro ao salvar.');
        return;
      }
      const updated = await res.json() as Campaign;
      setCampaign(updated);
      showToast('success', 'Fase salva com sucesso.');
    } finally {
      setSavingPhase(false);
    }
  }

  async function handleAction(action: string) {
    setActionLoading(true);
    try {
      const isTransition = action === 'transition';
      const targetPhase =
        campaign?.fase === 'aquecimento' ? 'carrinho_aberto' : 'downsell';
      const res = await fetch(`${baseUrl}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(isTransition ? { body: JSON.stringify({ targetPhase }) } : {}),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        showToast('error', data.error ?? 'Erro ao executar ação.');
        return;
      }
      setCampaign(data as unknown as Campaign);
      showToast('success', 'Ação executada com sucesso.');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-muted-foreground text-sm">Carregando...</div>;
  }

  if (!campaign) {
    return <div className="p-8 text-muted-foreground text-sm">Campanha não encontrada.</div>;
  }

  const isPerpetuo = campaign.tipo === 'perpetuo';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-md px-4 py-2 text-sm text-white shadow-md ${toast.type === 'success' ? 'bg-green-600' : 'bg-destructive'}`}>
          {toast.message}
        </div>
      )}

      <div className="mb-6">
        <Link href="/campanhas" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4" /> Campanhas
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">{campaign.nome}</h1>
            <div className="flex gap-2 mt-2">
              <Badge className={STATUS_BADGE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
              <Badge className="bg-slate-100 text-slate-700">{FASE_LABEL[campaign.fase]}</Badge>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {campaign.status === 'rascunho' && (
              <Button size="sm" onClick={() => setConfirmAction('activate')}>Ativar campanha</Button>
            )}
            {campaign.status === 'pausada' && (
              <>
                <Button size="sm" onClick={() => setConfirmAction('activate')}>Reativar campanha</Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmAction('end')}>Encerrar campanha</Button>
              </>
            )}
            {campaign.status === 'ativa' && (
              <>
                {!isPerpetuo && campaign.fase === 'aquecimento' && (
                  <Button size="sm" variant="outline" onClick={() => setConfirmAction('transition')}>Abrir carrinho</Button>
                )}
                {!isPerpetuo && campaign.fase === 'carrinho_aberto' && (
                  <Button size="sm" variant="outline" onClick={() => setConfirmAction('transition')}>Iniciar downsell</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setConfirmAction('pause')}>Pausar campanha</Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmAction('end')}>Encerrar campanha</Button>
              </>
            )}
          </div>
        </div>
      </div>

      {campaign.status !== 'encerrada' && (
        <div>
          <h2 className="text-base font-semibold mb-3">Configuração por fase</h2>
          {isPerpetuo ? (
            <PhaseConfigEditor
              phaseKey="carrinho_aberto"
              config={campaign.config.carrinho_aberto ?? {}}
              onSave={handlePhaseConfigSave}
              saving={savingPhase}
            />
          ) : (
            <div>
              <div className="flex border-b mb-4">
                {PHASE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <PhaseConfigEditor
                key={activeTab}
                phaseKey={activeTab}
                config={campaign.config[activeTab] ?? {}}
                onSave={handlePhaseConfigSave}
                saving={savingPhase}
                products={products}
              />
            </div>
          )}
        </div>
      )}

      <Dialog open={!!confirmAction} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Você tem certeza?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">Esta ação será aplicada imediatamente à campanha.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
            <Button
              disabled={actionLoading}
              onClick={() => { if (confirmAction) handleAction(confirmAction); }}
            >
              {actionLoading ? 'Executando...' : 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
