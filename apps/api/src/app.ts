import { Hono } from 'hono';
import { healthRouter } from './routes/health.js';

// Import config first so env validation runs before routes register
import '@leedi/config';

export const app = new Hono();

app.route('/health', healthRouter);
