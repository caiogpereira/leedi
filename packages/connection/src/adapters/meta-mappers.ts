/**
 * Maps raw Meta Graph API values to the domain enums persisted in the
 * `whatsapp_connections` table.
 *
 * Meta returns `quality_rating` as GREEN | YELLOW | RED | UNKNOWN and
 * `messaging_limit_tier` as TIER_50 | TIER_250 | TIER_1K | TIER_10K | TIER_100K |
 * TIER_UNLIMITED. The DB pgEnums, however, are the pt-BR / short domain forms
 * (`verde`/`amarelo`/`vermelho`, `1k`/`10k`/`100k`/`unlimited`). Writing a raw
 * Meta string straight into those columns throws `invalid input value for enum`
 * (Postgres 22P02), which previously broke the connect + health-check flows.
 *
 * Both columns are nullable, so any value Meta returns that has no domain
 * equivalent (UNKNOWN, TIER_50, TIER_250, or anything unexpected) maps to `null`.
 * The accepted value space is kept symmetric with `health-display.ts` so the
 * read (display) and write (persist) paths agree.
 */

export type QualityRatingValue = 'verde' | 'amarelo' | 'vermelho';
export type MessagingTierValue = '1k' | '10k' | '100k' | 'unlimited';

/** Maps Meta `quality_rating` to the domain enum, or `null` if unmappable. */
export function mapQualityRating(raw: string | null | undefined): QualityRatingValue | null {
  switch (raw?.toLowerCase()) {
    case 'verde':
    case 'green':
      return 'verde';
    case 'amarelo':
    case 'yellow':
      return 'amarelo';
    case 'vermelho':
    case 'red':
      return 'vermelho';
    default:
      // UNKNOWN and any unexpected value → null (column is nullable).
      return null;
  }
}

/** Maps Meta `messaging_limit_tier` to the domain enum, or `null` if unmappable. */
export function mapMessagingTier(raw: string | null | undefined): MessagingTierValue | null {
  switch (raw?.toLowerCase()) {
    case '1k':
    case 'tier_1k':
      return '1k';
    case '10k':
    case 'tier_10k':
      return '10k';
    case '100k':
    case 'tier_100k':
      return '100k';
    case 'unlimited':
    case 'tier_unlimited':
      return 'unlimited';
    default:
      // TIER_50, TIER_250 and any unexpected value → null (column is nullable).
      return null;
  }
}
