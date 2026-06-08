import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { withServiceRole, schema, eq } from '@leedi/db';
import { resolveConversationWindow, saveMessage } from '@leedi/messaging';
import { findOrCreateLeadByPhone } from '@leedi/lead';
import { captureException } from '@leedi/observability';
import { webhookLimit } from '../middleware/rate-limit.js';
import { checkUsageBlock, incrementUsage } from '@leedi/usage';
import { sendNotificationToTenantRole } from '@leedi/notification';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'audio' | 'image' | string;
  text?: { body: string };
  // Inbound media (Story 7.7): Meta delivers a media ID + MIME type, NOT a URL.
  // The binary is resolved/downloaded later in the agent loop with the tenant's
  // access token. Images may carry an optional caption.
  audio?: { id: string; mime_type?: string };
  image?: { id: string; mime_type?: string; caption?: string };
}

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value:
        | {
            metadata: { phone_number_id: string; display_phone_number: string };
            messages?: MetaWebhookMessage[];
            statuses?: Array<{ id: string; status: string; recipient_id: string }>;
          }
        | MetaTemplateStatusUpdate;
      field: string;
    }>;
  }>;
}

// Meta sends message_template_status_update events with a numeric template id
interface MetaTemplateStatusUpdate {
  event: string; // 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
  message_template_id: number;
  message_template_name?: string;
  reason?: string;
  waba_id?: string;
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
  // Audio has no text yet (transcribed in the agent loop); image may have a caption.
  if (msg.type === 'audio') return '[audio]';
  if (msg.type === 'image') return msg.image?.caption?.trim() || '[imagem]';
  return null;
}

/** Extracts the inbound media ref (id + MIME) for audio/image messages (Story 7.7). */
function extractMedia(
  msg: MetaWebhookMessage
): { mediaId: string; mimeType: string | undefined } | null {
  if (msg.type === 'audio' && msg.audio?.id) {
    return { mediaId: msg.audio.id, mimeType: msg.audio.mime_type };
  }
  if (msg.type === 'image' && msg.image?.id) {
    return { mediaId: msg.image.id, mimeType: msg.image.mime_type };
  }
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

    const payload = JSON.parse(rawBody) as MetaWebhookPayload;

    // NFR8: webhook rate limit (1000/min) keyed by phone_number_id (≈ connection).
    // Higher than the tenant limit — bursts from Meta are normal. The key isn't
    // known until the (signed) body is parsed, so the check runs here rather than
    // as router-level middleware (the raw body can only be read once).
    const firstValue = payload.entry?.[0]?.changes?.[0]?.value as
      | { metadata?: { phone_number_id: string } }
      | undefined;
    const phoneNumberId = firstValue?.metadata?.phone_number_id ?? 'unknown';
    const { success } = await webhookLimit(phoneNumberId);
    if (!success) {
      return c.json({ error: 'Rate limit exceeded.' }, 429);
    }

    // Acknowledge immediately — async processing below (AC#1)
    // We kick off a promise but don't await it so the response goes out fast.
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
  const { redis } = deps;
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      // Handle template approval/rejection status updates (Story 12.2)
      if (change.field === 'message_template_status_update') {
        const update = change.value as MetaTemplateStatusUpdate;
        await handleTemplateStatusUpdateEvent(update).catch(captureException);
        continue;
      }

      // Handle number quality updates (Story 13.5) — RED pauses dispatches.
      if (change.field === 'phone_number_quality_update') {
        const value = change.value as unknown as {
          phone_number_id: string;
          current_limit?: string;
          event?: string;
        };
        const { handleQualityUpdate } = await import(
          '../use-cases/connection/handle-quality-update.js'
        );
        await handleQualityUpdate({
          phoneNumberId: value.phone_number_id,
          ...(value.current_limit === undefined ? {} : { currentLimit: value.current_limit }),
          ...(value.event === undefined ? {} : { event: value.event }),
        }).catch(captureException);
        continue;
      }

      if (change.field !== 'messages') continue;
      const { metadata, messages, statuses } = change.value as {
        metadata: { phone_number_id: string; display_phone_number: string };
        messages?: MetaWebhookMessage[];
        statuses?: Array<{ id: string; status: string; recipient_id: string }>;
      };

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

  const media = extractMedia(msg);
  const leadPhone = msg.from;

  // Find or create the lead by phone, then resolve its 24h conversation window.
  const { id: leadId } = await findOrCreateLeadByPhone({ tenantId, telefone: leadPhone });

  // 16.3 AC#2: check if tenant opted in to blocking and has reached the limit.
  const usageBlock = await checkUsageBlock(tenantId);
  if (usageBlock.blocked) {
    console.info('[usage] tenant', tenantId, 'at limit, blocking new conversation');
    return; // lead receives no response — correct per FR107
  }

  const window = await resolveConversationWindow({
    tenantId,
    leadId,
    connectionId,
    billable: true,
  });

  // 16.1 AC#2: increment usage counter only when a NEW window is opened (messageCount === 1).
  if (window.messageCount === 1 && window.billable) {
    try {
      const result = await incrementUsage({ tenantId, billable: true });
      for (const alert of result.alertsDue) {
        sendNotificationToTenantRole({
          tenantId,
          roles: ['owner', 'admin', 'operator'],
          tipo: alert.tipo,
          titulo: alert.titulo,
          corpo: alert.corpo,
        }).catch(() => {});
      }
    } catch (err) {
      // Usage increment failure must NOT block message delivery.
      captureException(err);
    }
  }

  // Persist to messages table immediately, linked to the lead + window.
  // The returned row id lets the agent loop (Story 7.7) UPDATE transcricao/midia_url
  // on THIS row after resolving media.
  const tipo = mapMessageType(msg.type);
  const inboundMessageId = await saveMessage({
    tenantId,
    conversationWindowId: window.id,
    leadId,
    direction: 'inbound',
    content,
    metaMessageId: msg.id,
    autor: 'lead',
    tipo,
    status: 'recebido',
  });

  // Debounce buffer: push to lead-specific list, set 6s TTL (AC#3)
  // Media refs (id/mime) + the inbound row id ride along so the flush can pass
  // them to the agent loop (Story 7.7) without re-querying.
  const bufferKey = `leedi:msg_buffer:${tenantId}:${leadPhone}`;
  const messageJson = JSON.stringify({
    content,
    metaMessageId: msg.id,
    timestamp: msg.timestamp,
    tipo,
    mediaId: media?.mediaId,
    mimeType: media?.mimeType,
    inboundMessageId,
  });
  await redis.rpush(bufferKey, messageJson);
  await redis.expire(bufferKey, 6);

  // Schedule a QStash flush job with 6s delay (AC#3)
  // The flush endpoint is idempotent — multiple flush attempts on the same buffer are safe.
  // We pass leadId/connectionId/conversationWindowId so the agent loop (Epic 7) does NOT
  // re-resolve the conversation window — re-calling resolveConversationWindow would
  // double-bump message_count.
  const apiBaseUrl = env.BETTER_AUTH_URL.replace(':3000', ':3003');
  await qstash.publishJSON({
    url: `${apiBaseUrl}/api/internal/agent-flush`,
    delay: 6,
    body: {
      tenantId,
      leadPhone,
      bufferKey,
      leadId,
      connectionId,
      conversationWindowId: window.id,
    },
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

async function handleTemplateStatusUpdateEvent(
  update: MetaTemplateStatusUpdate
): Promise<void> {
  const { handleTemplateStatusUpdate } = await import(
    '../use-cases/templates/handle-template-status-update.js'
  );
  // Meta sends message_template_id as a number — convert to string for DB lookup
  await handleTemplateStatusUpdate({
    metaTemplateId: String(update.message_template_id),
    newStatus: update.event,
    reason: update.reason,
    wabaId: update.waba_id ?? '',
  });
}
