'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { Button } from '@leedi/ui';
import { ToolCallPanel } from './_components/ToolCallPanel';

type Scenario = 'novo_lead' | 'lead_recorrente' | 'lead_com_objecao';

interface ToolCallLog {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs?: number;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  toolCalls?: ToolCallLog[];
}

interface Props {
  tenantId: string;
}

const SCENARIO_LABELS: Record<Scenario, string> = {
  novo_lead: 'Novo lead',
  lead_recorrente: 'Lead recorrente',
  lead_com_objecao: 'Lead com objeção',
};

export function PlaygroundClient({ tenantId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('novo_lead');
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const resetSession = useCallback(async () => {
    if (sessionId) {
      await fetch(`/api/tenants/${tenantId}/playground/session/${sessionId}`, {
        method: 'DELETE',
      }).catch(() => null);
    }
    setSessionId(undefined);
    setMessages([]);
    setError(null);
  }, [sessionId, tenantId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    setLoading(true);

    // Optimistic user bubble
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/playground/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, scenario, sessionId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erro desconhecido' })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        sessionId: string;
        segments: string[];
        toolCalls: ToolCallLog[];
        turn: number;
      };

      setSessionId(data.sessionId);

      // Multi-segment: each segment is a separate bubble; tool calls on last bubble.
      const agentBubbles: ChatMessage[] = data.segments.map((seg, i) => ({
        role: 'agent' as const,
        content: seg,
        toolCalls: i === data.segments.length - 1 ? data.toolCalls : [],
      }));

      setMessages((prev) => [...prev, ...agentBubbles]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar mensagem');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleScenarioChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setScenario(e.target.value as Scenario);
    void resetSession();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-3xl mx-auto">
      {/* Controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label htmlFor="scenario-select" className="text-sm font-medium whitespace-nowrap">
            Cenário:
          </label>
          <select
            id="scenario-select"
            className="text-sm border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            value={scenario}
            onChange={handleScenarioChange}
          >
            {(Object.entries(SCENARIO_LABELS) as [Scenario, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void resetSession()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reiniciar conversa
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto border rounded-lg bg-muted/10 p-4 flex flex-col gap-3">
        {messages.length === 0 && !loading && (
          <p className="text-muted-foreground text-sm text-center mt-12">
            Envie uma mensagem para iniciar a conversa com o agente.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={[
                'max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-background border shadow-sm rounded-bl-sm',
              ].join(' ')}
            >
              {msg.content}
            </div>
            {msg.role === 'agent' && msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="max-w-[75%] w-full mt-1">
                <ToolCallPanel toolCalls={msg.toolCalls} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-start">
            <div className="bg-background border shadow-sm rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Agente processando…</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 mt-3">
        <textarea
          className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          rows={2}
          placeholder="Escreva como se fosse o lead… (Enter para enviar, Shift+Enter para nova linha)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          aria-label="Mensagem do lead"
        />
        <Button
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim()}
          size="sm"
          className="h-[72px]"
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
