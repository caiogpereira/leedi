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
  unlimited: 50,
};

/** Per-message interval in ms for a tier. Unknown/null tiers fall back to the safest (1k) pace. */
export function tierIntervalMs(tier: MessagingTier | null | undefined): number {
  if (!tier) return TIER_INTERVAL_MS['1k'];
  return TIER_INTERVAL_MS[tier] ?? TIER_INTERVAL_MS['1k'];
}

/**
 * Delay (seconds) before the NEXT batch is scheduled, given the per-message
 * interval. For sub-second intervals we don't add a QStash delay (>= than the
 * send loop itself); for the 1k tier (1000ms) we space batches by batchSize seconds.
 */
export function tierDelaySeconds(intervalMs: number, batchSize: number = BATCH_SIZE): number {
  if (intervalMs >= 1000) {
    return batchSize * Math.ceil(intervalMs / 1000);
  }
  return 0;
}
