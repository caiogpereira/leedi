import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface ObservabilityContext {
  request_id: string;
  tenant_id?: string;
  user_id?: string;
}

const storage = new AsyncLocalStorage<ObservabilityContext>();

export function getContext(): ObservabilityContext {
  return storage.getStore() ?? { request_id: 'no-context' };
}

export function runWithContext<T>(
  ctx: Partial<ObservabilityContext>,
  fn: () => T,
): T {
  const context: ObservabilityContext = {
    request_id: ctx.request_id ?? randomUUID(),
    ...(ctx.tenant_id !== undefined && { tenant_id: ctx.tenant_id }),
    ...(ctx.user_id !== undefined && { user_id: ctx.user_id }),
  };
  return storage.run(context, fn);
}
