'use client';

import Link from 'next/link';
import { StatusBadge, type InboxStatus } from './status-badge';

export interface ConversationListItemProps {
  conversationWindowId: string;
  leadName: string | null;
  leadPhone: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  status: InboxStatus;
  temperatura: 'frio' | 'morno' | 'quente' | null;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

const TEMP_CLASS: Record<string, string> = {
  frio: 'text-blue-600',
  morno: 'text-amber-600',
  quente: 'text-red-600',
};

function Initials({ name, phone }: { name: string | null; phone: string }) {
  const label = name ?? phone;
  const letters = label
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
      {letters}
    </div>
  );
}

export function ConversationListItem({
  conversationWindowId,
  leadName,
  leadPhone,
  lastMessagePreview,
  lastMessageAt,
  status,
  temperatura,
}: ConversationListItemProps) {
  return (
    <Link
      href={`/conversas/${conversationWindowId}`}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/50 transition-colors"
    >
      <Initials name={leadName} phone={leadPhone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-sm">
            {leadName ?? leadPhone}
            {temperatura && (
              <span className={`ml-2 text-xs ${TEMP_CLASS[temperatura] ?? ''}`}>
                ●
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="truncate text-xs text-muted-foreground">
            {lastMessagePreview ?? 'Sem mensagens'}
          </p>
          <StatusBadge status={status} />
        </div>
      </div>
    </Link>
  );
}
