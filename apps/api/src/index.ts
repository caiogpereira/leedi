// Config must be imported first — validates env vars and exits if invalid
import { env } from '@leedi/config';
import { serve } from '@hono/node-server';
import { app } from './app.js';

serve({
  fetch: app.fetch,
  port: env.API_PORT,
});

console.log(`API running on http://localhost:${env.API_PORT.toString()}`);
