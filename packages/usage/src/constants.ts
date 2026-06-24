/** Monthly conversation limits by tenant plan. */
export const PLAN_LIMITS: Record<string, number> = {
  starter: 500,
  pro: 2000,
  enterprise: 10000,
};

/** Price per overage conversation in BRL. */
export const OVERAGE_PRICE_BRL = 0.65;

/**
 * Minimum accumulated overage (BRL) worth issuing a charge for. Asaas rejects
 * boletos below ~R$5. Periods below this are NOT forgiven — the overage job rolls
 * the amount into the next month's counter so it accumulates until it crosses the
 * threshold, then gets billed.
 */
export const MIN_OVERAGE_CHARGE_BRL = 5.0;

/** Threshold percentages that trigger usage alerts. */
export const USAGE_ALERT_THRESHOLDS = [80, 95, 100] as const;
