export {
  getTenantSalesMetrics,
  computeSalesMetrics,
  ESTIMATED_COST_PER_CONVERSATION_BRL,
} from './use-cases/get-tenant-sales-metrics.js';
export type { TenantSalesMetrics } from './use-cases/get-tenant-sales-metrics.js';

export { getTopObjections } from './use-cases/get-top-objections.js';
export type { TopObjectionsResult, ObjectionItem, ObjectionInstance } from './use-cases/get-top-objections.js';
