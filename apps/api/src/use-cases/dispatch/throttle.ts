// Story 13.2 — tier-based throttle helpers for dispatch batching.
//
// The Meta messaging tier determines how fast we may send. We translate the tier
// into a per-message interval (ms) stored on the job, and into a per-batch delay
// (seconds) used to schedule the NEXT QStash batch.

export type MessagingTier = '1k' | '10k' | '100k' | 'unlimited';

export const BATCH_SIZE = 10;

const TIER_INTERVAL_MS: Record<MessagingTier, number> = {
  '1k': 1000,
  '10k': 500,
  '100k': 100,
  unlimited: 0, // no enforced delay (AC#4)
};

/** Per-message interval in ms for a tier. Unknown/null tiers fall back to the safest (1k) pace. */
export function tierIntervalMs(tier: MessagingTier | null | undefined): number {
  if (!tier) return TIER_INTERVAL_MS['1k'];
  return TIER_INTERVAL_MS[tier] ?? TIER_INTERVAL_MS['1k'];
}

/**
 * Delay (seconds) before the NEXT batch is scheduled, given the per-message
 * interval. The batch of `batchSize` messages must be spaced by at least
 * `batchSize * intervalMs`, so we translate that to whole seconds (QStash delay
 * granularity). Enforced for every throttled tier; an interval of 0 (unlimited)
 * means no delay (AC#4).
 */
export function tierDelaySeconds(intervalMs: number, batchSize: number = BATCH_SIZE): number {
  if (intervalMs <= 0) return 0;
  return Math.ceil((batchSize * intervalMs) / 1000);
}
