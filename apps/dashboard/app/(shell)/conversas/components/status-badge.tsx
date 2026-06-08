'use client';

export type InboxStatus = 'bot' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';

const STATUS_LABEL: Record<InboxStatus, string> = {
  bot: 'Bot',
  aguardando_humano: 'Aguardando',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
};

const STATUS_CLASS: Record<InboxStatus, string> = {
  bot: 'bg-gray-100 text-gray-700',
  aguardando_humano: 'bg-amber-100 text-amber-800',
  em_atendimento: 'bg-blue-100 text-blue-800',
  resolvido: 'bg-green-100 text-green-700',
};

export function StatusBadge({ status }: { status: InboxStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
