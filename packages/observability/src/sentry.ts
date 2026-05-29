import { env } from '@leedi/config';
import * as Sentry from '@sentry/node';
import { getContext } from './context.js';

export function initSentry(): void {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}

export function setObservabilityContext(ctx: {
  request_id: string;
  tenant_id?: string;
  user_id?: string;
}): void {
  Sentry.withScope((scope) => {
    scope.setContext('request', {
      request_id: ctx.request_id,
      tenant_id: ctx.tenant_id,
    });
    if (ctx.user_id) {
      scope.setUser({ id: ctx.user_id });
    }
  });
}

export function captureException(error: unknown): void {
  const ctx = getContext();
  Sentry.withScope((scope) => {
    scope.setContext('request', {
      request_id: ctx.request_id,
      tenant_id: ctx.tenant_id,
    });
    if (ctx.user_id) {
      scope.setUser({ id: ctx.user_id });
    }
    Sentry.captureException(error);
  });
}

export { Sentry };
