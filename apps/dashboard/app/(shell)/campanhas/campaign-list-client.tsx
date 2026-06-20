'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Megaphone } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@leedi/ui';

interface Campaign {
  id: string;
  nome: string;
  tipo: 'lancamento' | 'downsell' | 'perpetuo';
  fase: 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';
  status: 'rascunho' | 'ativa' | 'pausada' | 'encerrada';
  produtoNome: string | null;
  dataInicio: string | null;
  dataFim: string | null;
}

const TIPO_LABEL: Record<Campaign['tipo'], string> = {
  lancamento: 'Lançamento',
  downsell: 'Downsell',
  perpetuo: 'Perpétuo',
};

const TIPO_BADGE: Record<Campaign['tipo'], string> = {
  lancamento: 'bg-blue-100 text-blue-800',
  downsell: 'bg-purple-100 text-purple-800',
  perpetuo: 'bg-teal-100 text-teal-800',
};

const STATUS_LABEL: Record<Campaign['status'], string> = {
  rascunho: 'Rascunho',
  ativa: 'Ativa',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};

const STATUS_BADGE: Record<Campaign['status'], string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  ativa: 'bg-green-100 text-green-700',
  pausada: 'bg-yellow-100 text-yellow-800',
  encerrada: 'bg-red-100 text-red-700',
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

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface ProductOption {
  id: string;
  nome: string;
}

interface CreateFormState {
  nome: string;
  tipo: Campaign['tipo'] | '';
  produtoId: string;
  dataInicio: string;
  dataFim: string;
}

export function CampaignListClient({ tenantId, products }: { tenantId: string; products: ProductOption[] }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateFormState>({ nome: '', tipo: '', produtoId: '', dataInicio: '', dataFim: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/campaigns`);
      if (res.ok) setCampaigns(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.tipo) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/campaigns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          tipo: form.tipo,
          produtoId: form.produtoId || undefined,
          dataInicio: form.dataInicio || undefined,
          dataFim: form.dataFim || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Erro ao criar campanha.');
        return;
      }
      const created = await res.json() as Campaign;
      setDialogOpen(false);
      setForm({ nome: '', tipo: '', produtoId: '', dataInicio: '', dataFim: '' });
      window.location.href = `/campanhas/${created.id}`;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova campanha
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-12 text-center">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <Megaphone className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma campanha criada ainda. Crie sua primeira campanha de lançamento.</p>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova campanha
          </Button>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Tipo</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Fase</th>
                <th className="px-4 py-3 text-left font-medium">Produto</th>
                <th className="px-4 py-3 text-left font-medium">Período</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/campanhas/${c.id}`} className="font-medium text-primary hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={TIPO_BADGE[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{FASE_LABEL[c.fase]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.produtoNome ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(c.dataInicio)} – {formatDate(c.dataFim)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Lançamento Curso Digital"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as Campaign['tipo'] }))}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione o tipo</option>
                <option value="lancamento">Lançamento</option>
                <option value="downsell">Downsell</option>
                <option value="perpetuo">Perpétuo</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="produto">Produto</Label>
              <select
                id="produto"
                value={form.produtoId}
                onChange={(e) => setForm((f) => ({ ...f, produtoId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Sem produto vinculado</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dataInicio">Data início</Label>
                <Input
                  id="dataInicio"
                  type="datetime-local"
                  value={form.dataInicio}
                  onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dataFim">Data fim</Label>
                <Input
                  id="dataFim"
                  type="datetime-local"
                  value={form.dataFim}
                  onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating || !form.nome || !form.tipo}>
                {creating ? 'Criando...' : 'Criar campanha'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
