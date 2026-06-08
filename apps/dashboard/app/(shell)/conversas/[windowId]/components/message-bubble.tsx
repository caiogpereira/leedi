'use client';

type MessageAutor = 'lead' | 'agente' | 'humano' | 'sistema' | null;
type MessageTipo = 'texto' | 'audio' | 'imagem' | 'documento' | 'template' | 'sticker' | null;

export interface MessageBubbleProps {
  id: string;
  content: string;
  autor: MessageAutor;
  tipo: MessageTipo;
  transcricao: string | null;
  direction: 'inbound' | 'outbound';
  createdAt: string;
}

const BUBBLE_CLASS: Record<string, string> = {
  lead: 'self-start bg-neutral-100 text-neutral-900',
  agente: 'self-end bg-indigo-100 text-indigo-900',
  humano: 'self-end bg-green-100 text-green-900',
  sistema: 'self-center bg-transparent text-muted-foreground text-xs italic',
};

const AUTOR_LABEL: Record<string, string> = {
  lead: 'Lead',
  agente: 'Agente',
  humano: 'Humano',
  sistema: 'Sistema',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ content, autor, tipo, transcricao, createdAt }: MessageBubbleProps) {
  const key = autor ?? 'sistema';
  const bubbleClass = BUBBLE_CLASS[key] ?? BUBBLE_CLASS['sistema']!;
  const isSystem = key === 'sistema';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-muted-foreground italic px-2">{content}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col max-w-[70%] gap-0.5 ${key === 'lead' ? 'items-start' : 'items-end self-end'}`}>
      <span className="text-xs text-muted-foreground px-1">{AUTOR_LABEL[key] ?? key}</span>
      <div className={`rounded-xl px-3 py-2 text-sm ${bubbleClass}`}>
        {tipo === 'audio' ? (
          <div>
            <span className="text-xs font-medium">[Áudio]</span>
            {transcricao && (
              <p className="mt-1 text-sm">{transcricao}</p>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground px-1">{formatTime(createdAt)}</span>
    </div>
  );
}
