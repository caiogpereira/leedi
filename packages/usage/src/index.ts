export { incrementUsage, currentPeriod } from './use-cases/increment-usage.js';
export type { IncrementUsageInput, IncrementUsageResult, AlertDue } from './use-cases/increment-usage.js';

export { getUsageCounter, getUsageHistory, getCustoIaUsd } from './use-cases/get-usage-counter.js';
export type { UsageCounter, GetUsageCounterInput } from './use-cases/get-usage-counter.js';

export { checkUsageBlock } from './use-cases/check-usage-block.js';
export type { UsageBlockResult } from './use-cases/check-usage-block.js';

export { updateCurrentPeriodLimit } from './use-cases/update-current-period-limit.js';

export {
  PLAN_LIMITS,
  OVERAGE_PRICE_BRL,
  MIN_OVERAGE_CHARGE_BRL,
  USAGE_ALERT_THRESHOLDS,
} from './constants.js';
