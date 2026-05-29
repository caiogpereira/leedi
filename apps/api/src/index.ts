// Config must be imported first — validates env vars and exits if invalid
import { env } from '@leedi/config';
import { flushLogger, initSentry, logger } from '@leedi/observability';
import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { app } from './app.js';

initSentry();

const server = serve({
  fetch: app.fetch,
  port: env.API_PORT,
});

logger.info('boot', { request_id: randomUUID() });
console.log(`API running on http://localhost:${env.API_PORT.toString()}`);

async function shutdown(): Promise<void> {
  await flushLogger();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
