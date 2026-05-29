import { captureException, runWithContext } from '@leedi/observability';
import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';

export async function requestContextMiddleware(c: Context, next: Next): Promise<void> {
  const request_id = (c.req.header('x-request-id') ?? randomUUID()) as string;

  // tenant_id and user_id are populated by auth middleware in later epics
  await runWithContext({ request_id }, async () => {
    await next();
  });
}

export async function errorHandler(err: Error, c: Context): Promise<Response> {
  captureException(err);
  return c.json({ error: 'Internal Server Error' }, 500);
}
