/**
 * Mapping helpers for WhatsApp connection health display.
 * All labels are in pt-BR per UX-DR1 and AC#1.
 */

export type ConnectionStatus = 'conectado' | 'erro' | 'desconectado';
export type QualityRating = 'verde' | 'amarelo' | 'vermelho' | string | null;
export type MessagingTier = '1k' | '10k' | '100k' | 'unlimited' | string | null;

export interface StatusBadge {
  label: string;
  /** Tailwind classes for the badge color (semantic tokens, NOT WhatsApp green) */
  className: string;
  ariaLabel: string;
}

export interface QualityBadge {
  label: string;
  className: string;
}

/** Maps connection status to semantic badge — WhatsApp green NEVER used here (UX-DR1) */
export function getStatusBadge(status: ConnectionStatus | string | null): StatusBadge {
  switch (status) {
    case 'conectado':
      return {
        label: 'Conectado',
        className: 'bg-green-100 text-green-800 border-green-200',
        ariaLabel: 'Conexão ativa',
      };
    case 'erro':
      return {
        label: 'Erro',
        className: 'bg-red-100 text-red-800 border-red-200',
        ariaLabel: 'Erro na conexão',
      };
    default:
      return {
        label: 'Desconectado',
        className: 'bg-gray-100 text-gray-600 border-gray-200',
        ariaLabel: 'Desconectado',
      };
  }
}

/** Maps quality_rating to semantic badge */
export function getQualityBadge(rating: QualityRating): QualityBadge | null {
  if (!rating) return null;
  switch (rating.toLowerCase()) {
    case 'verde':
    case 'green':
      return { label: 'Qualidade Alta', className: 'bg-green-100 text-green-800' };
    case 'amarelo':
    case 'yellow':
      return { label: 'Qualidade Média', className: 'bg-yellow-100 text-yellow-800' };
    case 'vermelho':
    case 'red':
      return { label: 'Qualidade Baixa', className: 'bg-red-100 text-red-800' };
    default:
      return { label: rating, className: 'bg-gray-100 text-gray-600' };
  }
}

/** Maps messaging_tier to human-readable pt-BR string */
export function getTierLabel(tier: MessagingTier): string | null {
  if (!tier) return null;
  switch (tier.toLowerCase()) {
    case '1k':
    case 'tier_1k':
      return '1.000 mensagens/dia';
    case '10k':
    case 'tier_10k':
      return '10.000 mensagens/dia';
    case '100k':
    case 'tier_100k':
      return '100.000 mensagens/dia';
    case 'unlimited':
    case 'tier_unlimited':
      return 'Ilimitado';
    default:
      return tier;
  }
}

/**
 * Returns the actionable error message shown when status is 'erro'.
 * Never hints at the current token value.
 */
export function getErrorExplanation(): string {
  return 'Seu token de acesso expirou. Gere um novo token no Meta Business Suite e atualize aqui.';
}

/** Formats a Date to a relative pt-BR label ("verificado há 3 min") */
export function formatRelativeTime(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'verificado agora';
  if (diffMin === 1) return 'verificado há 1 min';
  if (diffMin < 60) return `verificado há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return 'verificado há 1 hora';
  return `verificado há ${diffH} horas`;
}
