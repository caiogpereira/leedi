import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { withServiceRole, withTenant, schema, eq } from '@leedi/db';
import { resolveConversationWindow, saveMessage } from '@leedi/messaging';
import { findOrCreateLeadByPhone } from '@leedi/lead';
import { captureException } from '@leedi/observability';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'audio' | 'image' | string;
  text?: { body: string };
}

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        metadata: { phone_number_id: string; display_phone_number: string };
        messages?: MetaWebhookMessage[];
        statuses?: Array<{ id: string; status: string; recipient_id: string }>;
      };
      field: string;
    }>;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(`sha256=${expected}`, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function extractTextContent(msg: MetaWebhookMessage): string | null {
  if (msg.type === 'text' && msg.text?.body) return msg.text.body;
  if (msg.type === 'audio') return '[audio]';
  if (msg.type === 'image') return '[imagem]';
  return null;
}

function mapMessageType(
  metaType: string
): 'texto' | 'audio' | 'imagem' | 'documento' | 'template' | 'sticker' {
  const map: Record<
    string,
    'texto' | 'audio' | 'imagem' | 'documento' | 'template' | 'sticker'
  > = {
    text: 'texto',
    audio: 'audio',
    image: 'imagem',
    document: 'documento',
    sticker: 'sticker',
  };
  return map[metaType] ?? 'texto';
}

// ─── Router ───────────────────────────────────────────────────────────────────

export interface WebhookDeps {
  redis: Pick<Redis, 'set' | 'rpush' | 'expire' | 'lrange' | 'del'>;
  qstash: Pick<Client, 'publishJSON'>;
}

function defaultDeps(): WebhookDeps {
  return {
    redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
    qstash: new Client({ token: env.QSTASH_TOKEN }),
  };
}

export function createWebhookMetaRouter(deps: WebhookDeps = defaultDeps()) {
  const router = new Hono();
  const { redis, qstash } = deps;

  // GET /webhook/meta — Meta subscription verification handshake (AC#5)
  router.get('/', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return c.text(challenge ?? '', 200);
    }
    return c.json({ error: 'Forbidden' }, 403);
  });

  // POST /webhook/meta — inbound messages (AC#1–#4)
  router.post('/', async (c) => {
    // Read raw body BEFORE any parsing (AC#2 — signature on raw bytes)
    const rawBody = await c.req.text();
    const signature = c.req.header('x-hub-signature-256');

    // Signature validation FIRST (AC#2)
    if (!verifySignature(rawBody, signature)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Acknowledge immediately — async processing below (AC#1)
    // We kick off a promise but don't await it so the response goes out fast
    const payload = JSON.parse(rawBody) as MetaWebhookPayload;
    processWebhookAsync(payload, deps).catch(captureException);

    return c.text('OK', 200);
  });

  return router;
}

// ─── Async processing (after 200 is sent) ─────────────────────────────────────

async function processWebhookAsync(
  payload: MetaWebhookPayload,
  deps: WebhookDeps
): Promise<void> {
  const { redis, qstash } = deps;
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const { metadata, messages, statuses } = change.value;

      // Handle delivery/read status updates (stub — full wiring in 4.4 follow-up)
      if (statuses) {
        for (const status of statuses) {
          await handleStatusUpdate(status, redis).catch(captureException);
        }
      }

      if (!messages) continue;

      // Tenant routing: resolve tenantId + connectionId by phone_number_id
      const resolved = await resolveTenantId(metadata.phone_number_id);
      if (!resolved) {
        // log warning — non-sensitive phone_number_id is OK to log
        console.warn(`[webhook] No tenant found for phone_number_id: ${metadata.phone_number_id}`);
        continue;
      }

      for (const msg of messages) {
        await processMessage(msg, resolved.tenantId, resolved.connectionId, deps).catch(
          captureException
        );
      }
    }
  }
}

async function resolveTenantId(
  phoneNumberId: string
): Promise<{ tenantId: string; connectionId: string } | null> {
  const rows = await withServiceRole(async (tx) =>
    tx
      .select({
        tenantId: schema.whatsappConnections.tenantId,
        connectionId: schema.whatsappConnections.id,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.phoneNumberId, phoneNumberId))
      .limit(1)
  );
  const row = rows[0];
  if (!row) return null;
  return { tenantId: row.tenantId, connectionId: row.connectionId };
}

async function processMessage(
  msg: MetaWebhookMessage,
  tenantId: string,
  connectionId: string,
  deps: WebhookDeps
): Promise<void> {
  const { redis, qstash } = deps;
  // Deduplication via SET NX (AC#4)
  const dedupKey = `leedi:msg_seen:${msg.id}`;
  const isNew = await redis.set(dedupKey, '1', { ex: 86400, nx: true });
  if (!isNew) return; // already processed

  const content = extractTextContent(msg);
  if (!content) return; // unsupported type — log-and-ignore

  const leadPhone = msg.from;

  // Find or create the lead by phone, then resolve its 24h conversation window.
  const { id: leadId } = await findOrCreateLeadByPhone({ tenantId, telefone: leadPhone });

  const window = await resolveConversationWindow({
    tenantId,
    leadId,
    connectionId,
    billable: true,
  });

  // Persist to messages table immediately, linked to the lead + window.
  await saveMessage({
    tenantId,
    conversationWindowId: window.id,
    leadId,
    direction: 'inbound',
    content,
    metaMessageId: msg.id,
    autor: 'lead',
    tipo: mapMessageType(msg.type),
    status: 'recebido',
  });

  // Debounce buffer: push to lead-specific list, set 6s TTL (AC#3)
  const bufferKey = `leedi:msg_buffer:${tenantId}:${leadPhone}`;
  const messageJson = JSON.stringify({ content, metaMessageId: msg.id, timestamp: msg.timestamp });
  await redis.rpush(bufferKey, messageJson);
  await redis.expire(bufferKey, 6);

  // Schedule a QStash flush job with 6s delay (AC#3)
  // The flush endpoint is idempotent — multiple flush attempts on the same buffer are safe
  const apiBaseUrl = env.BETTER_AUTH_URL.replace(':3000', ':3003');
  await qstash.publishJSON({
    url: `${apiBaseUrl}/api/internal/agent-flush`,
    delay: 6,
    body: { tenantId, leadPhone, bufferKey },
  });
}

async function handleStatusUpdate(
  status: { id: string; status: string; recipient_id: string },
  _redis: WebhookDeps['redis']
): Promise<void> {
  // Map Meta status to our enum
  const statusMap: Record<string, 'entregue' | 'lido'> = {
    delivered: 'entregue',
    read: 'lido',
  };
  const newStatus = statusMap[status.status];
  if (!newStatus) return;

  // Find the message by meta_message_id and update status
  // Using service role since we don't know tenant at this point
  await withServiceRole(async (tx) =>
    tx
      .update(schema.messages)
      .set({ status: newStatus })
      .where(eq(schema.messages.metaMessageId, status.id))
  );
}
