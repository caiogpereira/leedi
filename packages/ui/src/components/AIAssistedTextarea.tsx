'use client';

import * as React from 'react';
import { Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Textarea } from './ui/textarea.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';

export interface AIAssistedTextareaProps {
  value: string;
  onChange: (v: string) => void;
  /** What the field is — used as context for the AI prompt */
  context: string;
  placeholder?: string;
  rows?: number;
  /** API endpoint that accepts POST { text, context } and streams the suggestion */
  endpoint?: string;
  className?: string;
}

type ModalState = 'idle' | 'loading' | 'suggestion' | 'editing' | 'error';

export function AIAssistedTextarea({
  value,
  onChange,
  context,
  placeholder,
  rows = 4,
  endpoint = '/api/ai/improve-text',
  className,
}: AIAssistedTextareaProps) {
  const [open, setOpen] = React.useState(false);
  const [modalState, setModalState] = React.useState<ModalState>('idle');
  const [suggestion, setSuggestion] = React.useState('');
  const [editedSuggestion, setEditedSuggestion] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      // Escape / overlay click — preserve original value (AC#5)
      setOpen(false);
      setModalState('idle');
      setSuggestion('');
      setEditedSuggestion('');
      setErrorMessage('');
    } else {
      setOpen(true);
    }
  }

  async function requestImprovement() {
    setModalState('loading');
    setSuggestion('');
    setErrorMessage('');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, context }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Erro desconhecido');
      }

      if (!response.body) {
        throw new Error('Resposta vazia do servidor');
      }

      // Stream tokens progressively
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      setModalState('suggestion');

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(chunk, { stream: true });
        setSuggestion(accumulated);
      }
    } catch (err) {
      setModalState('error');
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível gerar a sugestão. Verifique sua conexão e tente novamente.'
      );
    }
  }

  function handleOpen() {
    if (!value.trim()) return;
    setOpen(true);
    void requestImprovement();
  }

  function handleAccept() {
    const textToApply = modalState === 'editing' ? editedSuggestion : suggestion;
    onChange(textToApply);
    handleOpenChange(false);
  }

  function handleEditBeforeAccept() {
    setEditedSuggestion(suggestion);
    setModalState('editing');
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpen}
          disabled={!value.trim()}
          className="gap-1.5 text-xs"
        >
          <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--accent-ai))]" aria-hidden="true" />
          Melhorar com IA
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Sugestão de melhoria</DialogTitle>
            <DialogDescription>
              Compare o texto original com a sugestão gerada pela IA.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {/* Original — always read-only */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Original</span>
              <div className="min-h-[120px] rounded-md border border-input bg-muted p-3 text-sm leading-relaxed">
                {value}
              </div>
            </div>

            {/* Suggestion pane */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {modalState === 'loading' ? 'Gerando sugestão...' : 'Sugestão da IA'}
              </span>

              <div aria-live="polite" aria-atomic="false">
                {modalState === 'loading' && (
                  <div className="flex min-h-[120px] items-center justify-center rounded-md border border-input bg-muted p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2
                        className="h-4 w-4 animate-spin text-[hsl(var(--accent-ai))]"
                        aria-hidden="true"
                      />
                      <span>Gerando sugestão…</span>
                    </div>
                  </div>
                )}

                {(modalState === 'suggestion' || modalState === 'loading') && suggestion && (
                  <div className="min-h-[120px] rounded-md border border-[hsl(var(--accent-ai))] bg-muted p-3 text-sm leading-relaxed">
                    {suggestion}
                    {modalState === 'loading' && (
                      <span
                        className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[hsl(var(--accent-ai))]"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}

                {modalState === 'editing' && (
                  <Textarea
                    value={editedSuggestion}
                    onChange={(e) => setEditedSuggestion(e.target.value)}
                    rows={6}
                    className="min-h-[120px] border-[hsl(var(--accent-ai))]"
                    aria-label="Editar sugestão antes de aceitar"
                  />
                )}

                {modalState === 'error' && (
                  <div className="flex min-h-[120px] flex-col gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Não foi possível gerar a sugestão
                    </div>
                    <p className="text-sm text-muted-foreground">{errorMessage}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void requestImprovement()}
                      className="mt-1 self-start"
                    >
                      Tentar novamente
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {(modalState === 'suggestion' || modalState === 'editing') && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              {modalState === 'suggestion' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEditBeforeAccept}
                >
                  Editar antes de aceitar
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleAccept}>
                Aceitar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
