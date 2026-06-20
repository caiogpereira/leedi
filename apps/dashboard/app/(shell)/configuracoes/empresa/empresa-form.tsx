'use client';
import { useState } from 'react';
import { Button, Input, Label } from '@leedi/ui';

interface Props {
  tenantId: string;
  initial: { nome: string; cnpj: string; endereco: string };
}

export function EmpresaForm({ tenantId, initial }: Props) {
  const [nome, setNome] = useState(initial.nome);
  const [cnpj, setCnpj] = useState(initial.cnpj);
  const [endereco, setEndereco] = useState(initial.endereco);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/onboarding/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome.trim() || undefined, cnpj, endereco }),
      });
      setMsg(res.ok ? 'Salvo com sucesso.' : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dados da empresa</h1>
        <p className="text-sm text-muted-foreground">Informações cadastrais da sua empresa.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome da empresa</Label>
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="endereco">Endereço</Label>
        <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade - UF" />
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
    </div>
  );
}
