'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { Button } from '@leedi/ui';
import { MessageBubble, type MessageBubbleProps } from './message-bubble';
import { HandoffSummaryPanel } from './handoff-summary-panel';
import { StatusBadge, type InboxStatus } from '../../components/status-badge';

const POLL_INTERVAL_MS = 8000;

interface ConversaMessage {
  id: string;
  content: string;
  autor: MessageBubbleProps['autor'];
  tipo: MessageBubbleProps['tipo'];
  transcricao: string | null;
  direction: 'inbound' | 'outbound';
  createdAt: string;
}

interface Assignment {
  id: string;
  status: InboxStatus;
  assignedTo: string | null;
  resumoHandoff: string | null;
  motivoHandoff: string | null;
}

interface Lead {
  id: string;
  nome: string | null;
  telefone: string;
  temperatura: 'frio' | 'morno' | 'quente' | null;
}

interface ConversaDetailData {
  window: { id: string; leadId: string; startedAt: string };
  assignment: Assignment | null;
  lead: Lead | null;
  messages: ConversaMessage[];
  nextCursor: string | null;
}

interface Props {
  tenantId: string;
  windowId: string;
  currentUserId: string;
}

export function ConversaDetailClient({ tenantId, windowId, currentUserId }: Props) {
  const [data, setData] = useState<ConversaDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Optimistic messages (prepend before API confirms)
  const [optimisticMsgs, setOptimisticMsgs] = useState<ConversaMessage[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  function scrollToBottomIfNeeded() {
    if (wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/inbox/${windowId}`, {
      credentials: 'include',
    });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) return;
    const detail = (await res.json()) as ConversaDetailData;
    setData(detail);
    setOlderCursor(detail.nextCursor);
    setOptimisticMsgs([]); // clear optimistic on refresh
  }, [tenantId, windowId]);

  useEffect(() => {
    setLoading(true);
    fetchDetail().finally(() => setLoading(false));
  }, [fetchDetail]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDetail().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDetail]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [data?.messages.length, optimisticMsgs.length]);

  async function loadOlderMessages() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/inbox/${windowId}?cursor=${olderCursor}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const older = (await res.json()) as ConversaDetailData;
      setData((prev) =>
        prev
          ? {
              ...prev,
              messages: [...older.messages, ...prev.messages],
            }
          : prev
      );
      setOlderCursor(older.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleAssign(action: 'takeover' | 'return_to_bot' | 'resolve') {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/inbox/${windowId}/assign`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setActionError(err.error ?? 'Erro ao executar ação.');
        return;
      }
      const { status } = (await res.json()) as { status: InboxStatus };
      setData((prev) =>
        prev
          ? {
              ...prev,
              assignment: prev.assignment
                ? {
                    ...prev.assignment,
                    status,
                    assignedTo: action === 'takeover' ? currentUserId : action === 'return_to_bot' ? null : prev.assignment.assignedTo,
                  }
                : null,
            }
          : prev
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || sending) return;

    setSending(true);
    setSendError(null);

    // Optimistic update
    const optimistic: ConversaMessage = {
      id: `opt-${Date.now()}`,
      content: replyText.trim(),
      autor: 'humano',
      tipo: 'texto',
      transcricao: null,
      direction: 'outbound',
      createdAt: new Date().toISOString(),
    };
    wasAtBottom.current = true;
    setOptimisticMsgs((prev) => [...prev, optimistic]);
    const sentText = replyText;
    setReplyText('');

    try {
      const res = await fetch(`/api/tenants/${tenantId}/inbox/${windowId}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: sentText }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setSendError(err.error ?? 'Falha ao enviar mensagem.');
        // Revert optimistic
        setOptimisticMsgs((prev) => prev.filter((m) => m.id !== optimistic.id));
        setReplyText(sentText);
      } else {
        // Refresh to get persisted message
        fetchDetail().catch(() => undefined);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }

  if (notFound) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Conversa não encontrada.</p>
        <Link href="/conversas" className="mt-2 text-sm text-primary hover:underline">
          Voltar para conversas
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { assignment, lead } = data;
  const status = assignment?.status ?? 'bot';
  const canTakeover = status !== 'resolvido';
  const isInProgress = status === 'em_atendimento';
  const isAssignedToMe = assignment?.assignedTo === currentUserId;
  const canReply = isInProgress && isAssignedToMe;
  const allMessages = [...(data.messages ?? []), ...optimisticMsgs];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Main conversation area */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/conversas" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="font-medium text-sm">{lead?.nome ?? lead?.telefone ?? 'Lead'}</p>
              {lead?.telefone && lead.nome && (
                <p className="text-xs text-muted-foreground">{lead.telefone}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />

            {/* Action buttons */}
            {canTakeover && status !== 'em_atendimento' && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading}
                onClick={() => {
                  if (status === 'bot') {
                    if (confirm('O agente está ativo. Ao assumir, o atendimento será pausado até você devolver ao bot.')) {
                      handleAssign('takeover');
                    }
                  } else {
                    handleAssign('takeover');
                  }
                }}
              >
                Assumir atendimento
              </Button>
            )}

            {isInProgress && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading}
                onClick={() => handleAssign('return_to_bot')}
              >
                Devolver ao bot
              </Button>
            )}

            {(isInProgress || status === 'aguardando_humano') && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading}
                onClick={() => handleAssign('resolve')}
              >
                Marcar como resolvido
              </Button>
            )}
          </div>
        </div>

        {actionError && (
          <div className="px-4 py-2 text-sm text-destructive bg-destructive/10">{actionError}</div>
        )}

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
          onScroll={(e) => {
            const el = e.currentTarget;
            wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
          }}
        >
          {olderCursor && (
            <button
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="self-center rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
            </button>
          )}

          {allMessages.map((msg) => (
            <MessageBubble key={msg.id} {...msg} />
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Reply composer */}
        {canReply && (
          <form onSubmit={handleReply} className="border-t p-3 flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleReply(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Digite sua mensagem..."
              rows={2}
              className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm"
              disabled={sending}
            />
            <Button type="submit" size="sm" disabled={sending || !replyText.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}

        {sendError && (
          <div className="px-4 py-2 text-sm text-destructive bg-destructive/10">{sendError}</div>
        )}
      </div>

      {/* Handoff summary panel */}
      <HandoffSummaryPanel
        resumoHandoff={assignment?.resumoHandoff ?? null}
        motivoHandoff={assignment?.motivoHandoff ?? null}
      />
    </div>
  );
}
