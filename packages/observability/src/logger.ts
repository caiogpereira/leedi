import { env } from '@leedi/config';
import { Logtail } from '@logtail/node';
import { getContext } from './context.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  request_id?: string;
  tenant_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

let logtail: Logtail | null = null;

function getLogtail(): Logtail {
  if (!logtail) {
    logtail = new Logtail(env.BETTER_STACK_TOKEN);
  }
  return logtail;
}

function buildPayload(message: string, extra?: LogContext): LogContext {
  const ctx = getContext();
  return {
    request_id: ctx.request_id,
    ...(ctx.tenant_id !== undefined && { tenant_id: ctx.tenant_id }),
    ...(ctx.user_id !== undefined && { user_id: ctx.user_id }),
    ...extra,
    message,
  };
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const payload = buildPayload(message, context);

  // Always log to stdout in development
  if (env.NODE_ENV === 'development') {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `[${level.toUpperCase()}] ${message}`,
      payload,
    );
  }

  // Send to Better Stack asynchronously (non-blocking)
  if (env.NODE_ENV === 'production') {
    const lt = getLogtail();
    void lt[level](message, payload);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};

export async function flushLogger(): Promise<void> {
  if (logtail) {
    await logtail.flush();
  }
}
