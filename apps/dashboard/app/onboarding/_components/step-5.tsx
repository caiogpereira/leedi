'use client';

import { useState, useRef, useEffect } from 'react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@leedi/ui';
import { Send } from 'lucide-react';

interface Props {
  tenantId: string;
  stepData: Record<number, Record<string, unknown>>;
  onAdvance: (step: number, completedStep?: number) => void;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export function Step5({ tenantId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentResponded, setAgentResponded] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [completing, setCompleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completionError, setCompletionError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/playground/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, scenario: 'novo_lead', sessionId }),
      });

      if (!res.ok) return;

      const data = await res.json() as {
        sessionId: string;
        segments: string[];
      };

      setSessionId(data.sessionId);
      const fullResponse = data.segments.join('\n');
      setMessages((prev) => [...prev, { role: 'agent', content: fullResponse }]);
      setAgentResponded(true);
    } catch {
      // ignore errors in wizard sandbox mode
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

  async function handleComplete() {
    setCompleting(true);
    setCompletionError('');
    try {
      const res = await fetch(`/api/tenants/${tenantId}/onboarding/complete`, {
        method: 'POST',
      });

      if (!res.ok) {
        setCompletionError('Erro ao concluir. Tente novamente.');
        setConfirmOpen(false);
        return;
      }

      setConfirmOpen(false);
      // Full reload so shell layout re-reads the now-active tenant status (AC#3)
      window.location.href = '/';
    } catch {
      setCompletionError('Erro de rede. Tente novamente.');
      setConfirmOpen(false);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Teste o seu agente</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Envie uma mensagem como se fosse um lead. Quando o agente responder, você poderá concluir a configuração.
      </p>

      <div className="flex flex-col h-80 border rounded-lg bg-muted/10 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm text-center mt-8">
              Envie uma mensagem para iniciar a conversa.
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
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
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-background border shadow-sm rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground">
                <span className="animate-pulse">Agente processando…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t p-3 flex gap-2">
          <textarea
            className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            rows={2}
            placeholder="Escreva como se fosse o lead… (Enter para enviar)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <Button
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
            size="sm"
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {completionError && (
        <p className="text-destructive text-sm mt-3">{completionError}</p>
      )}

      <div className="mt-8 flex justify-end">
        <Button
          disabled={!agentResponded || completing}
          onClick={() => setConfirmOpen(true)}
        >
          Concluir configuração
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tudo pronto!</DialogTitle>
            <DialogDescription>
              Ao concluir, seu agente começará a receber leads. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleComplete()} disabled={completing}>
              {completing ? 'Concluindo...' : 'Sim, vamos lá!'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
