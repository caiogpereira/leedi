import { Hono } from 'hono';
import { env } from '@leedi/config';

export const healthRouter = new Hono();

healthRouter.get('/', (c) => {
  return c.json({ status: 'ok', env: env.NODE_ENV });
});
