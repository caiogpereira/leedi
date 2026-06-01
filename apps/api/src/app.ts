// Config must be imported first — env validation runs before routes register
import '@leedi/config';

import { Hono } from 'hono';
import { env } from '@leedi/config';
import { errorHandler, requestContextMiddleware } from './middleware/request-context.js';
import { healthRouter } from './routes/health.js';
import { createAiRouter } from './routes/ai.js';
import { createWhatsappRouter } from './routes/whatsapp.js';
import { createLeadsRouter } from './routes/leads.js';
import { createInternalRouter } from './routes/internal.js';
import { createWebhookMetaRouter } from './routes/webhook-meta.js';
import { createProductsRouter } from './routes/knowledge/products.js';
import { createKnowledgeBaseRouter } from './routes/knowledge/knowledge-base.js';
import { createSalesMethodsRouter } from './routes/knowledge/sales-methods.js';
import { ClaudeProvider } from './ai/claude-provider.js';

// AI Provider — instantiated once at startup, injected into routes (§8.4 Adapter Pattern)
const aiProvider = new ClaudeProvider(env.ANTHROPIC_API_KEY);

export const app = new Hono();

app.use('*', requestContextMiddleware);
app.onError(errorHandler);
app.route('/health', healthRouter);
app.route('/api/ai', createAiRouter(aiProvider));
app.route('/api/tenants/:tenantId/whatsapp', createWhatsappRouter());
app.route('/api/tenants/:tenantId/leads', createLeadsRouter());
app.route('/api/tenants/:tenantId/knowledge/products', createProductsRouter());
app.route('/api/tenants/:tenantId/knowledge/knowledge-base', createKnowledgeBaseRouter());
app.route('/api/sales-methods', createSalesMethodsRouter());
app.route('/api/internal', createInternalRouter());
app.route('/webhook/meta', createWebhookMetaRouter());
