// Config must be imported first — env validation runs before routes register
import '@leedi/config';

import { Hono } from 'hono';
import { requestContextMiddleware } from './middleware/request-context.js';
import { healthRouter } from './routes/health.js';

export const app = new Hono();

app.use('*', requestContextMiddleware);
app.route('/health', healthRouter);
