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
import { createAgentConfigRouter } from './routes/agent/config.js';
import { createPlaygroundRouter } from './routes/playground/index.js';
import { createCampaignsRouter } from './routes/campaigns/index.js';
import { createHotmartWebhookRouter } from './routes/webhooks/hotmart.js';
import { createAsaasWebhookRouter } from './routes/webhooks/asaas.js';
import { createTemplatesRouter } from './routes/templates/index.js';
import { createSegmentsRouter } from './routes/segments/index.js';
import { createDispatchJobsRouter } from './routes/dispatch-jobs/index.js';
import { createDispatchRulesRouter } from './routes/dispatch-rules/index.js';
import { createInboxRouter } from './routes/inbox/index.js';
import { createInboxActionsRouter } from './routes/inbox/actions.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createUsageRouter } from './routes/usage.js';
import { createBillingRouter } from './routes/billing.js';
import { createPushSubscriptionsRouter } from './routes/push-subscriptions.js';
import { createNotificationPreferencesRouter } from './routes/notification-preferences.js';
import { createOnboardingRouter } from './routes/onboarding.js';
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
app.route('/api/tenants/:tenantId/agent-config', createAgentConfigRouter());
app.route('/api/tenants/:tenantId/playground', createPlaygroundRouter());
app.route('/api/tenants/:tenantId/campaigns', createCampaignsRouter());
app.route('/api/internal', createInternalRouter());
app.route('/webhook/meta', createWebhookMetaRouter());
app.route('/api/tenants/:tenantId/templates', createTemplatesRouter());
app.route('/api/tenants/:tenantId/segments', createSegmentsRouter());
app.route('/api/tenants/:tenantId/dispatch-jobs', createDispatchJobsRouter());
app.route('/api/tenants/:tenantId/dispatch-rules', createDispatchRulesRouter());
app.route('/api/tenants/:tenantId/inbox', createInboxRouter());
app.route('/api/tenants/:tenantId/inbox', createInboxActionsRouter());
app.route('/api/tenants/:tenantId/analytics', createAnalyticsRouter());
app.route('/api/tenants/:tenantId/usage', createUsageRouter());
app.route('/api/tenants/:tenantId/billing', createBillingRouter());
app.route('/api/tenants/:tenantId/push', createPushSubscriptionsRouter());
app.route('/api/tenants/:tenantId/notification-preferences', createNotificationPreferencesRouter());
app.route('/api/tenants/:tenantId/onboarding', createOnboardingRouter());
// Public gateway webhooks — validated by hottok, no tenant auth middleware
app.route('/webhooks/hotmart', createHotmartWebhookRouter());
// Asaas billing webhook — validated by accessToken, no tenant auth middleware
app.route('/webhooks/asaas', createAsaasWebhookRouter());
