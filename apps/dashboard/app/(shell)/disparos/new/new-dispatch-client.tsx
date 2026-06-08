'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@leedi/ui';

interface Template {
  id: string;
  nome: string;
  status: string;
}
interface Segment {
  id: string;
  nome: string;
  filtros: Record<string, unknown>;
}

export function NewDispatchClient({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [agendadoPara, setAgendadoPara] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [tplRes, segRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/templates?status=aprovado`),
        fetch(`/api/tenants/${tenantId}/segments`),
      ]);
      if (tplRes.ok) setTemplates(await tplRes.json());
      if (segRes.ok) setSegments(await segRes.json());
    })();
  }, [tenantId]);

  const previewSegment = useCallback(
    async (id: string) => {
      setPreviewCount(null);
      const seg = segments.find((s) => s.id === id);
      if (!seg) return;
      const res = await fetch(`/api/tenants/${tenantId}/segments/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filtros: seg.filtros }),
      });
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setPreviewCount(data.count);
      }
    },
    [tenantId, segments]
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tenants/${tenantId}/dispatch-jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        templateId,
        segmentId,
        agendadoPara: new Date(agendadoPara).toISOString(),
      }),
    });
    if (res.ok) {
      router.push('/disparos');
      return;
    }
    const payload = await res.json().catch(() => ({}));
    setError(payload.error ?? 'Falha ao agendar o disparo.');
    setSaving(false);
  }, [tenantId, templateId, segmentId, agendadoPara, router]);

  const valid = templateId && segmentId && agendadoPara;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Novo disparo</h1>
        <p className="text-sm text-muted-foreground">
          Envie um template aprovado para um segmento de leads.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="template">Template (aprovado)</Label>
        <select
          id="template"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Selecione um template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum template aprovado disponível. Crie e aprove um template primeiro.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="segment">Segmento</Label>
        <select
          id="segment"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={segmentId}
          onChange={(e) => {
            setSegmentId(e.target.value);
            if (e.target.value) void previewSegment(e.target.value);
          }}
        >
          <option value="">Selecione um segmento…</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        {previewCount !== null && (
          <p className="text-xs text-muted-foreground">~{previewCount} leads neste segmento</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="agendado">Agendar para</Label>
        <Input
          id="agendado"
          type="datetime-local"
          value={agendadoPara}
          onChange={(e) => setAgendadoPara(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="button" onClick={save} disabled={!valid || saving}>
        {saving ? 'Agendando…' : 'Agendar disparo'}
      </Button>
    </div>
  );
}
