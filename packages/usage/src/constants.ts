/** Monthly conversation limits by tenant plan. */
export const PLAN_LIMITS: Record<string, number> = {
  starter: 500,
  pro: 2000,
  enterprise: 10000,
};

/** Price per overage conversation in BRL. */
export const OVERAGE_PRICE_BRL = 0.30;

/** Threshold percentages that trigger usage alerts. */
export const USAGE_ALERT_THRESHOLDS = [80, 95, 100] as const;
