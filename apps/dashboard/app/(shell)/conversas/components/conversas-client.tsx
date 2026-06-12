'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@leedi/ui';
import { ConversationListItem, type ConversationListItemProps } from './conversation-list-item';
import type { InboxStatus } from './status-badge';

const POLL_INTERVAL_MS = 8000;

type LeadTemperatura = 'frio' | 'morno' | 'quente';

interface InboxItem {
  conversationWindowId: string;
  leadId: string;
  leadName: string | null;
  leadPhone: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  status: InboxStatus;
  temperatura: LeadTemperatura | null;
  assignedTo: string | null;
}

interface InboxResponse {
  items: InboxItem[];
  nextCursor: string | null;
}

const STATUS_OPTIONS: { value: InboxStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'bot', label: 'Bot' },
  { value: 'aguardando_humano', label: 'Aguardando' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'resolvido', label: 'Resolvido' },
];

const TEMP_OPTIONS: { value: LeadTemperatura | ''; label: string }[] = [
  { value: '', label: 'Todas temperaturas' },
  { value: 'frio', label: 'Frio' },
  { value: 'morno', label: 'Morno' },
  { value: 'quente', label: 'Quente' },
];

export function ConversasClient({ tenantId }: { tenantId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const statusFilter = (searchParams.get('status') as InboxStatus | null) ?? '';
  const tempFilter = (searchParams.get('temperatura') as LeadTemperatura | null) ?? '';

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Dedup set for browser notifications (one notification per windowId per session)
  const notifiedIds = useRef(new Set<string>());

  const fetchInbox = useCallback(
    async (cursor?: string, mode: 'replace' | 'append' | 'merge' = 'replace') => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (tempFilter) params.set('temperatura', tempFilter);
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(
        `/api/tenants/${tenantId}/inbox?${params}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;

      const data = (await res.json()) as InboxResponse;

      setItems((prev) => {
        if (mode === 'append') return [...prev, ...data.items];
        if (mode === 'merge') {
          // Poll refresh: fresh first page is authoritative; keep already-loaded older
          // pages ("Carregar mais") that aren't in the first page so polling doesn't wipe them.
          const freshIds = new Set(data.items.map((i) => i.conversationWindowId));
          const tail = prev.filter((i) => !freshIds.has(i.conversationWindowId));
          return [...data.items, ...tail];
        }
        return data.items;
      });
      // Don't overwrite the pagination cursor on a poll merge — keep the user's "load more"
      // position. Only initial/filter loads and explicit "load more" advance it.
      if (mode !== 'merge') setNextCursor(data.nextCursor);

      // Browser notification sound for new aguardando_humano conversations (AC#6).
      // Gate the ENTIRE block (including the dedup mark) on tab visibility — marking a
      // windowId notified while hidden would suppress the sound forever for that conversation.
      if (
        mode !== 'append' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.visibilityState === 'visible'
      ) {
        for (const item of data.items) {
          if (
            item.status === 'aguardando_humano' &&
            !notifiedIds.current.has(item.conversationWindowId)
          ) {
            notifiedIds.current.add(item.conversationWindowId);
            try {
              new Audio('/sounds/notification.mp3').play().catch(() => undefined);
            } catch {
              // Audio may not be available
            }
          }
        }
      }
    },
    [tenantId, statusFilter, tempFilter]
  );

  useEffect(() => {
    setLoading(true);
    fetchInbox().finally(() => setLoading(false));

    // Request notification permission on first load
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }, [fetchInbox]);

  // 8s polling — merge so loaded "Carregar mais" pages survive each tick
  useEffect(() => {
    const interval = setInterval(() => {
      fetchInbox(undefined, 'merge').catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchInbox]);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/conversas?${params}`);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchInbox(nextCursor, 'append').finally(() => setLoadingMore(false));
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Conversas</h1>
      </div>

      {/* Filter bar — synced with URL */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setFilter('status', e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          aria-label="Filtrar por status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={tempFilter}
          onChange={(e) => setFilter('temperatura', e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          aria-label="Filtrar por temperatura"
        >
          {TEMP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden="true" />}
          title="Nenhuma conversa ainda"
          description="Quando leads enviarem mensagens, elas aparecerão aqui."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <ConversationListItem
              key={item.conversationWindowId}
              {...(item as ConversationListItemProps)}
            />
          ))}

          {nextCursor && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
