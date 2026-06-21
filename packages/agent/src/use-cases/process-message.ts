import Anthropic from '@anthropic-ai/sdk';
import { withTenant, schema, eq, and, sql } from '@leedi/db';
import { MetaCloudProvider } from '@leedi/connection';
import { transcribeAudio } from '../utils/transcribe-audio.js';
import {
  saveThread,
  saveMessage,
  getThreadHistory,
  saveToolCall,
} from '@leedi/agent-memory';
import type { AnthropicHistoryMessage } from '@leedi/agent-memory';
import {
  buildSystemPrompt,
  type SalesMethodInput,
  type ActiveProductInput,
} from '../utils/build-system-prompt.js';
import { getDispatchOrigin } from './get-dispatch-origin.js';
import { buildDispatchContextBlock } from '../utils/build-dispatch-context-block.js';
import { buildToolList, routeToolCall } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import { splitResponse } from '../utils/split-response.js';
import { SALES_MODELS } from '../config/model-routing.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERS = 8;
const MAX_TOKENS = 2048;
const LOCK_TTL_MS = 300_000; // 5 min (AC#3)
const SEGMENT_DELAY_MIN_MS = 300;
const SEGMENT_DELAY_MAX_MS = 500;
const LOCK_RETRY_DELAY_MS = 1_500;

/** AC#3: exact fallback sent when audio transcription fails. */
const AUDIO_FALLBACK_MESSAGE =
  'Recebi seu áudio mas não consegui entender. Pode me mandar como texto?';

/** Anthropic vision accepts only these image media types as base64 input. */
const SUPPORTED_IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

/**
 * Stub for the tenant-plan check that gates Opus to Enterprise tenants (AC#5).
 * Until billing is wired (a later epic), this returns `false` so a tenant with
 * `modelo_ia='opus'` falls back to Sonnet — we MUST NOT silently grant Opus to
 * non-Enterprise tenants. Flip this to a real plan lookup and AC#5 lights up with
 * no other change.
 */
function tenantHasOpusAccess(_tenantId: string): boolean {
  // TODO(billing): real tenant-plan lookup. Deny Opus until then.
  return false;
}

/**
 * Resolves the exact Claude model id for the sales conversation from the tenant's
 * configured `modelo_ia`, applying the Enterprise guard: Opus is downgraded to
 * Sonnet for tenants without Opus access (AC#4, AC#5).
 */
function resolveSalesModel(
  modeloIa: 'sonnet' | 'haiku' | 'opus' | undefined,
  tenantId: string
): string {
  const bucket = modeloIa ?? 'sonnet';
  if (bucket === 'opus' && !tenantHasOpusAccess(tenantId)) {
    return SALES_MODELS.sonnet;
  }
  return SALES_MODELS[bucket];
}

// ─── Injectable dependencies (for tests) ──────────────────────────────────────

export interface RedisLock {
  set: (
    key: string,
    value: string,
    opts: { nx: true; px: number }
  ) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

export interface WhatsAppSender {
  sendText: (to: string, body: string) => Promise<{ messageId: string }>;
}

interface ConnectionRecord {
  phoneNumberId: string;
  wabaId: string;
  accessTokenEncrypted: string;
  accessTokenIv: string;
}

/**
 * Resolves + downloads inbound media (audio/image) from Meta's CDN (Story 7.7).
 * Inbound webhooks carry a media ID, not a URL: getMediaUrl performs the
 * ID→temporary-URL lookup, downloadMedia fetches the bytes (both with the
 * tenant's Bearer token). Defaults to MetaCloudProvider.
 */
export interface MediaProvider {
  getMediaUrl: (mediaId: string) => Promise<{ url: string; mimeType: string }>;
  downloadMedia: (mediaUrl: string) => Promise<{ buffer: Buffer; mimeType: string }>;
}

export interface ProcessMessageDeps {
  redis: RedisLock;
  anthropic: Pick<Anthropic, 'messages'>;
  /** Builds a WhatsApp sender from a connection record (defaults to MetaCloudProvider). */
  senderFactory?: (record: ConnectionRecord) => WhatsAppSender;
  /** Builds a media downloader from a connection record (defaults to MetaCloudProvider). */
  mediaProviderFactory?: (record: ConnectionRecord) => MediaProvider;
  /** Transcribes an audio buffer to text (defaults to the configured provider). */
  transcribe?: (audioBuffer: Buffer, mimeType: string) => Promise<string>;
  /** Structured error logger (defaults to console.error; wire Sentry at the call site). */
  logError?: (error: unknown, context: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProcessMessageInput {
  tenantId: string;
  connectionId: string;
  leadId: string;
  leadPhone: string;
  conversationWindowId: string;
  /**
   * The (debounced) inbound text from the lead. For audio this is the
   * transcription placeholder ('[audio]') until transcription replaces it; for
   * image it's the caption (or '[imagem]').
   */
  userText: string;
  /** Inbound message kind. Absent/`'texto'` runs the unchanged text path. */
  tipo?: 'texto' | 'audio' | 'imagem' | 'documento' | 'template' | 'sticker';
  /** Meta media ID for audio/image messages (resolved → CDN URL → bytes). */
  mediaId?: string;
  /** Media MIME type reported by Meta (e.g. 'audio/ogg', 'image/jpeg'). */
  mimeType?: string;
  /**
   * DB id of the already-persisted inbound `messages` row (set by the webhook).
   * Used to UPDATE `transcricao`/`midia_url` on the correct row (AC#1, AC#5).
   */
  inboundMessageId?: string;
  /**
   * When true: skip the distributed lock, skip WhatsApp sending, skip DB
   * persistence for agent_threads/messages/tool_calls, and return
   * `{ status: 'sandbox', segments, toolCalls }` instead of `{ status: 'sent' }`.
   * Caller is responsible for never incrementing usage_counters (Story 8.1).
   */
  sandboxMode?: boolean;
  /**
   * Pre-built conversation history for scenario simulation (Story 8.2).
   * Injected as the starting messages array; bypasses getThreadHistory.
   * Only used when sandboxMode is true.
   */
  seedHistory?: AnthropicHistoryMessage[];
  /**
   * Explicit campaign ID for playground simulation (Story 10.3). When set,
   * `consultar_ofertas_ativas` uses this campaign instead of the globally active one.
   * Only meaningful when sandboxMode is true.
   */
  campaignId?: string;
}

export interface ToolCallLog {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs?: number;
}

export type ProcessMessageResult =
  | { status: 'sent'; segments: string[] }
  | { status: 'locked' }
  | { status: 'aborted'; reason: string }
  | { status: 'no_response' }
  | { status: 'sandbox'; segments: string[]; toolCalls: ToolCallLog[] };

// ─── Anthropic content block typing (narrow, local) ───────────────────────────

interface TextBlock {
  type: 'text';
  text: string;
}
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
type ContentBlock = TextBlock | ToolUseBlock | { type: string };

/** Anthropic base64 image vision block (Story 7.7, AC#4). */
interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: SupportedImageMediaType;
    data: string;
  };
}

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Core agent loop: locks the lead, runs should-abort checks, loads context,
 * builds the (cacheable) system prompt, runs the Claude tool_use loop, then
 * splits + sends the response over WhatsApp and persists everything.
 *
 * Caller (the QStash-triggered agent-flush handler) already acked Meta 200 and
 * resolved the lead/window, so this never blocks the webhook and never
 * re-resolves the conversation window (avoids double-bumping message_count).
 */
export async function processMessage(
  input: ProcessMessageInput,
  deps: ProcessMessageDeps
): Promise<ProcessMessageResult> {
  const { tenantId, connectionId, leadId, leadPhone, conversationWindowId, userText } = input;
  const { redis, anthropic } = deps;
  const sleep = deps.sleep ?? defaultSleep;
  const senderFactory = deps.senderFactory ?? defaultSenderFactory;
  const mediaProviderFactory = deps.mediaProviderFactory ?? defaultMediaProviderFactory;
  const transcribe = deps.transcribe ?? transcribeAudio;
  const logError = deps.logError ?? defaultLogError;

  // ── Sandbox path (Story 8.1): skip lock, skip send, skip DB writes ────────────
  if (input.sandboxMode) {
    return runSandboxMessage(input, { anthropic });
  }

  // ── Distributed lock (AC#3): SET NX PX, one retry, then drop ────────────────
  const lockKey = `agent_lock:${tenantId}:${leadPhone}`;
  const lockToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let acquired = await acquireLock(redis, lockKey, lockToken);
  if (!acquired) {
    await sleep(LOCK_RETRY_DELAY_MS);
    acquired = await acquireLock(redis, lockKey, lockToken);
    if (!acquired) return { status: 'locked' };
  }

  try {
    // ── should_abort checks ───────────────────────────────────────────────────
    const ctxData = await loadAgentContext(tenantId, leadId);
    if (!ctxData.agentConfig || ctxData.agentConfig.ativo !== true) {
      return { status: 'aborted', reason: 'agent_inactive' };
    }
    if (ctxData.tenantStatus === 'blocked') {
      console.warn(`[billing] tenant ${tenantId} blocked — message suppressed`);
      return { status: 'aborted', reason: 'tenant_blocked' };
    }
    if (ctxData.lead.status === 'optout' || ctxData.lead.status === 'bloqueado') {
      return { status: 'aborted', reason: `lead_${ctxData.lead.status}` };
    }
    if (ctxData.lead.comprou === true && ctxData.activeProduct === null) {
      return { status: 'aborted', reason: 'already_bought' };
    }

    // Inbox-pause check (Story 7.6, AC#4): if a human has taken over this
    // conversation (status aguardando_humano | em_atendimento), SKIP the agent —
    // no Claude call. The inbound message is ALREADY persisted to `messages`
    // (autor='lead') upstream by the webhook before the agent loop runs, so we do
    // NOT re-insert it here (that would duplicate the row); we just return early.
    const inboxStatus = await loadInboxStatus(tenantId, conversationWindowId);
    if (inboxStatus === 'aguardando_humano' || inboxStatus === 'em_atendimento') {
      return { status: 'aborted', reason: 'inbox_paused' };
    }

    // ── Multimodal input resolution (Story 7.7) ─────────────────────────────────
    // Audio: download + transcribe BEFORE any Claude call; on failure send the
    // fallback and return early (no agent run). Image: download + base64, injected
    // into the user turn for Claude vision (the running `messages` array, not
    // agent-memory — base64 must not bloat the persisted thread).
    let effectiveUserText = userText;
    let imageBlock: ImageContentBlock | null = null;

    if (input.tipo === 'audio') {
      const transcription = await tryTranscribeAudio({
        input,
        connection: ctxData.connection,
        mediaProviderFactory,
        transcribe,
        logError,
      });
      if (transcription === null) {
        // AC#3: transcription failed — send the fallback, persist it, return early.
        const sender = senderFactory(ctxData.connection);
        let metaMessageId: string | null = null;
        let sendStatus: 'enviado' | 'falhou' = 'enviado';
        try {
          const res = await sender.sendText(leadPhone, AUDIO_FALLBACK_MESSAGE);
          metaMessageId = res.messageId;
        } catch {
          sendStatus = 'falhou';
        }
        await persistOutboundMessage({
          tenantId,
          conversationWindowId,
          leadId,
          content: AUDIO_FALLBACK_MESSAGE,
          metaMessageId,
          status: sendStatus,
        });
        return { status: 'sent', segments: [AUDIO_FALLBACK_MESSAGE] };
      }
      // AC#1: transcription succeeded — persist it on the inbound row and feed it
      // to the agent as the message content.
      effectiveUserText = transcription;
      if (input.inboundMessageId) {
        await updateInboundTranscription(tenantId, input.inboundMessageId, transcription);
      }
    } else if (input.tipo === 'imagem') {
      // AC#4/#5: fetch the image with auth, pass to Claude as a base64 vision
      // block, and store midia_url on the inbound row. A download failure must not
      // crash the agent — fall back to processing the caption text alone.
      imageBlock = await tryDownloadImage({
        input,
        connection: ctxData.connection,
        mediaProviderFactory,
        tenantId,
        logError,
      });
    }

    // ── Thread + system prompt ──────────────────────────────────────────────────
    const thread = await saveThread({ tenantId, leadId, conversationWindowId });

    // Build the tool list FIRST — it's the single source of truth for which tools
    // are offered this request, and buildSystemPrompt's objection nudge (Story 7.5)
    // must reflect exactly that set.
    const tools = buildToolList(ctxData.agentConfig.toolsHabilitadas);
    const enabledToolIds = tools.map((t) => t.name);

    const systemPromptText = buildSystemPrompt(
      {
        nomeAgente: ctxData.agentConfig.nomeAgente,
        persona: ctxData.agentConfig.persona,
        estiloMensagem: ctxData.agentConfig.estiloMensagem,
        limites: ctxData.agentConfig.limites,
      },
      ctxData.salesMethod,
      ctxData.activeProduct,
      enabledToolIds
    );

    // AC#2: block 1 (persona/method/product) is per-message-stable and cached —
    // one cache breakpoint at its end. Block 2 (P1-5) carries the per-lead dispatch
    // origin: it varies per lead and is INTENTIONALLY uncached. Appending an
    // uncached block AFTER the breakpoint does not affect block 1's cache hit.
    // The variable user message stays in `messages`, never in `system`.
    const dispatchOrigin = await getDispatchOrigin(tenantId, leadId);
    const dispatchBlock = buildDispatchContextBlock(dispatchOrigin);
    const system = [
      { type: 'text' as const, text: systemPromptText, cache_control: { type: 'ephemeral' as const } },
      ...(dispatchBlock
        ? [{ type: 'text' as const, text: dispatchBlock }]
        : []),
    ];

    const model = resolveSalesModel(ctxData.agentConfig.modeloIa, tenantId);

    // ── Persist + seed the conversation ─────────────────────────────────────────
    // Persist the TEXT form of the user turn (transcription for audio, caption for
    // image). Base64 image data is NEVER persisted — it would bloat the thread and
    // be re-sent on every subsequent turn; it's injected into `messages` below for
    // this request only.
    await saveMessage({ tenantId, threadId: thread.id, role: 'system', content: systemPromptText });
    await saveMessage({ tenantId, threadId: thread.id, role: 'user', content: effectiveUserText });

    const history = await getThreadHistory(tenantId, thread.id);
    const messages: AnthropicHistoryMessage[] = [...history];

    // AC#4: inject the image as a vision block on the LAST user turn for this call.
    if (imageBlock) {
      const lastUser = findLastUserMessage(messages);
      if (lastUser) {
        const raw = typeof lastUser.content === 'string' ? lastUser.content : effectiveUserText;
        // The webhook stores '[imagem]' when there's no caption — don't feed that
        // literal token to Claude; use a neutral prompt so it reacts to the image.
        const caption =
          raw && raw !== '[imagem]' ? raw : 'O lead enviou esta imagem.';
        lastUser.content = [imageBlock, { type: 'text', text: caption }] as unknown[];
      }
    }

    const toolCtx: ToolContext = {
      tenantId,
      leadId,
      leadPhone,
      connectionId,
      threadId: thread.id,
      conversationWindowId,
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    };

    // ── Claude tool_use loop (AC#1) ─────────────────────────────────────────────
    const { text: finalText } = await runToolLoop({
      anthropic,
      model,
      system,
      tools,
      messages,
      tenantId,
      threadId: thread.id,
      toolCtx,
    });

    if (!finalText.trim()) return { status: 'no_response' };

    // ── Split + send (AC#4, AC#6) ───────────────────────────────────────────────
    const segments = splitResponse(finalText);
    const sender = senderFactory(ctxData.connection);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      let metaMessageId: string | null = null;
      let status: 'enviado' | 'falhou' = 'enviado';
      try {
        const res = await sender.sendText(leadPhone, segment);
        metaMessageId = res.messageId;
      } catch {
        status = 'falhou';
      }
      await persistOutboundMessage({
        tenantId,
        conversationWindowId,
        leadId,
        content: segment,
        metaMessageId,
        status,
      });
      if (i < segments.length - 1) {
        await sleep(randomDelay());
      }
    }

    return { status: 'sent', segments };
  } finally {
    // AC#3: only release the lock we own (token match), inside finally.
    await releaseLock(redis, lockKey, lockToken);
  }
}

// ─── Tool loop ────────────────────────────────────────────────────────────────

interface RunToolLoopArgs {
  anthropic: Pick<Anthropic, 'messages'>;
  model: string;
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  tools: ReturnType<typeof buildToolList>;
  messages: AnthropicHistoryMessage[];
  tenantId: string;
  threadId: string;
  toolCtx: ToolContext;
  sandboxMode?: boolean;
}

async function runToolLoop(
  args: RunToolLoopArgs
): Promise<{ text: string; toolCalls: ToolCallLog[] }> {
  const { anthropic, model, system, tools, messages, tenantId, threadId, toolCtx, sandboxMode = false } = args;
  const collectedToolCalls: ToolCallLog[] = [];

  for (let i = 0; i < MAX_ITERS; i++) {
    const res = (await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: system as unknown as Anthropic.TextBlockParam[],
      tools: tools as unknown as Anthropic.Tool[],
      messages: messages as unknown as Anthropic.MessageParam[],
    })) as unknown as AnthropicResponse;

    if (!sandboxMode) {
      // Persist the assistant turn with token accounting (AC#5).
      await saveMessage({
        tenantId,
        threadId,
        role: 'assistant',
        content: res.content as unknown[],
        tokensInput: res.usage?.input_tokens,
        tokensOutput: res.usage?.output_tokens,
        modelo: model,
      });
    }

    if (res.stop_reason !== 'tool_use') {
      return { text: extractText(res.content), toolCalls: collectedToolCalls };
    }

    // Append the assistant turn (with tool_use blocks) to the running messages.
    messages.push({ role: 'assistant', content: res.content as unknown[] });

    const toolUseBlocks = res.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const started = Date.now();
        let output: unknown;
        let erro: string | undefined;
        try {
          output = await routeToolCall(block.name, block.input, toolCtx);
        } catch (err) {
          erro = err instanceof Error ? err.message : String(err);
          output = { ok: false, error: 'tool_execution_failed' };
        }
        const durationMs = Date.now() - started;

        if (sandboxMode) {
          collectedToolCalls.push({
            toolName: block.name,
            input: block.input,
            output: output as Record<string, unknown>,
            durationMs,
          });
        } else {
          await saveToolCall({
            tenantId,
            threadId,
            toolName: block.name,
            input: block.input,
            output,
            duracaoMs: durationMs,
            erro,
          });
        }

        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(output),
        };
      })
    );

    if (!sandboxMode) {
      // Persist the tool results turn (AC#5), then feed it back to Claude.
      await saveMessage({ tenantId, threadId, role: 'tool', content: toolResults as unknown[] });
    }
    messages.push({ role: 'user', content: toolResults as unknown[] });
  }

  // Hit the iteration cap — return whatever text the last turn produced (if any).
  return { text: '', toolCalls: collectedToolCalls };
}

// ─── Sandbox path (Story 8.1) ────────────────────────────────────────────────

/**
 * Runs the agent loop in sandbox mode: no lock, no WhatsApp send, no DB writes.
 * Uses seedHistory as the pre-built thread and collects toolCalls in memory.
 * Returns { status: 'sandbox', segments, toolCalls } on success.
 */
async function runSandboxMessage(
  input: ProcessMessageInput,
  deps: Pick<ProcessMessageDeps, 'anthropic'>
): Promise<ProcessMessageResult> {
  const { tenantId, leadId, leadPhone, connectionId, conversationWindowId, userText } = input;
  const { anthropic } = deps;

  const ctxData = await loadAgentContext(tenantId, leadId);
  if (!ctxData.agentConfig || ctxData.agentConfig.ativo !== true) {
    return { status: 'aborted', reason: 'agent_inactive' };
  }

  const tools = buildToolList(ctxData.agentConfig.toolsHabilitadas);
  const enabledToolIds = tools.map((t) => t.name);

  const systemPromptText = buildSystemPrompt(
    {
      nomeAgente: ctxData.agentConfig.nomeAgente,
      persona: ctxData.agentConfig.persona,
      estiloMensagem: ctxData.agentConfig.estiloMensagem,
      limites: ctxData.agentConfig.limites,
    },
    ctxData.salesMethod,
    ctxData.activeProduct,
    enabledToolIds
  );

  const system = [
    { type: 'text' as const, text: systemPromptText, cache_control: { type: 'ephemeral' as const } },
  ];

  const model = resolveSalesModel(ctxData.agentConfig.modeloIa, tenantId);

  // Seed history + new user message (no DB reads/writes for thread).
  const messages: AnthropicHistoryMessage[] = [
    ...(input.seedHistory ?? []),
    { role: 'user', content: userText },
  ];

  const toolCtx: ToolContext = {
    tenantId,
    leadId,
    leadPhone,
    connectionId,
    threadId: 'sandbox',
    conversationWindowId,
    sandboxMode: true,
  };

  const { text: finalText, toolCalls } = await runToolLoop({
    anthropic,
    model,
    system,
    tools,
    messages,
    tenantId,
    threadId: 'sandbox',
    toolCtx,
    sandboxMode: true,
  });

  if (!finalText.trim()) return { status: 'no_response' };

  const segments = splitResponse(finalText);
  return { status: 'sandbox', segments, toolCalls };
}

// ─── Context loading ──────────────────────────────────────────────────────────

interface AgentContextData {
  agentConfig: {
    nomeAgente: string;
    persona: string;
    estiloMensagem: { tamanho: 'curto' | 'medio' | 'longo'; formalidade: 'formal' | 'informal'; emoji: boolean };
    limites: string;
    modeloIa: 'sonnet' | 'haiku' | 'opus';
    toolsHabilitadas: {
      consultar_base_conhecimento: boolean;
      agendar_followup: boolean;
      transferir_humano: boolean;
      adicionar_tag: boolean;
      solicitar_reengajamento: boolean;
    };
    ativo: boolean;
    salesMethodId: string | null;
  } | null;
  lead: { status: 'ativo' | 'optout' | 'bloqueado'; comprou: boolean };
  tenantStatus: string;
  salesMethod: SalesMethodInput | null;
  activeProduct: ActiveProductInput | null;
  connection: {
    phoneNumberId: string;
    wabaId: string;
    accessTokenEncrypted: string;
    accessTokenIv: string;
  };
}

/**
 * Reads the current inbox status for a conversation window (Story 7.6, AC#4).
 * Returns null when no assignment exists yet (the evergreen bot path).
 */
async function loadInboxStatus(
  tenantId: string,
  conversationWindowId: string
): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ status: schema.inboxAssignments.status })
      .from(schema.inboxAssignments)
      .where(eq(schema.inboxAssignments.conversationWindowId, conversationWindowId))
      .limit(1);
    return row?.status ?? null;
  });
}

async function loadAgentContext(tenantId: string, leadId: string): Promise<AgentContextData> {
  return withTenant(tenantId, async (tx) => {
    const [agentConfig] = await tx
      .select()
      .from(schema.agentConfigs)
      .where(eq(schema.agentConfigs.tenantId, tenantId))
      .limit(1);

    const [lead] = await tx
      .select({ status: schema.leads.status, comprou: schema.leads.comprou })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)))
      .limit(1);

    const [tenant] = await tx
      .select({ status: schema.tenants.status })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    const [connection] = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    // Sales method (optional)
    let salesMethod: SalesMethodInput | null = null;
    if (agentConfig?.salesMethodId) {
      const [method] = await tx
        .select({
          titulo: schema.salesMethods.titulo,
          descricao: schema.salesMethods.descricao,
          systemPromptTemplate: schema.salesMethods.systemPromptTemplate,
          phases: schema.salesMethods.phases,
        })
        .from(schema.salesMethods)
        .where(eq(schema.salesMethods.id, agentConfig.salesMethodId))
        .limit(1);
      if (method) {
        salesMethod = {
          titulo: method.titulo,
          descricao: method.descricao,
          systemPromptTemplate: method.systemPromptTemplate,
          phases: method.phases ?? [],
        };
      }
    }

    // Active product: the principal active offer (placeholder selection; campaign
    // scoping lands in a later epic). Cheapest-to-reason: the first active 'principal'.
    const [product] = await tx
      .select({
        nome: schema.products.nome,
        descricao: schema.products.descricao,
        preco: schema.products.preco,
        linkCheckout: schema.products.linkCheckout,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, tenantId),
          eq(schema.products.ativo, true),
          eq(schema.products.tipo, 'principal')
        )
      )
      .orderBy(sql`${schema.products.createdAt} ASC`)
      .limit(1);

    const activeProduct: ActiveProductInput | null = product
      ? {
          nome: product.nome,
          descricao: product.descricao,
          preco: product.preco,
          linkCheckout: product.linkCheckout,
        }
      : null;

    return {
      agentConfig: agentConfig
        ? {
            nomeAgente: agentConfig.nomeAgente,
            persona: agentConfig.persona,
            estiloMensagem: agentConfig.estiloMensagem,
            limites: agentConfig.limites,
            modeloIa: agentConfig.modeloIa,
            toolsHabilitadas: agentConfig.toolsHabilitadas,
            ativo: agentConfig.ativo,
            salesMethodId: agentConfig.salesMethodId,
          }
        : null,
      lead: lead ?? { status: 'ativo', comprou: false },
      tenantStatus: tenant?.status ?? 'active',
      salesMethod,
      activeProduct,
      connection: connection ?? {
        phoneNumberId: '',
        wabaId: '',
        accessTokenEncrypted: '',
        accessTokenIv: '',
      },
    };
  });
}

// ─── Persistence (messages table — autor='agente', AC#6) ──────────────────────

interface PersistOutboundArgs {
  tenantId: string;
  conversationWindowId: string;
  leadId: string;
  content: string;
  metaMessageId: string | null;
  status: 'enviado' | 'falhou';
}

async function persistOutboundMessage(args: PersistOutboundArgs): Promise<void> {
  const { tenantId, conversationWindowId, leadId, content, metaMessageId, status } = args;
  await withTenant(tenantId, async (tx) =>
    tx.insert(schema.messages).values({
      tenantId,
      conversationWindowId,
      leadId,
      direction: 'outbound',
      autor: 'agente',
      tipo: 'texto',
      content,
      metaMessageId: metaMessageId ?? null,
      status,
    })
  );
}

// ─── Multimodal input (Story 7.7) ─────────────────────────────────────────────

interface MediaHandlingArgs {
  input: ProcessMessageInput;
  connection: ConnectionRecord;
  mediaProviderFactory: (record: ConnectionRecord) => MediaProvider;
  logError: (error: unknown, context: Record<string, unknown>) => void;
}

/**
 * Downloads + transcribes the inbound audio (AC#1). Returns the transcription on
 * success, or `null` on ANY failure (the caller sends the AC#3 fallback). Never
 * throws — a transcription failure must not crash the agent.
 */
async function tryTranscribeAudio(
  args: MediaHandlingArgs & { transcribe: (b: Buffer, m: string) => Promise<string> }
): Promise<string | null> {
  const { input, connection, mediaProviderFactory, transcribe, logError } = args;
  if (!input.mediaId) {
    logError(new Error('audio message missing mediaId'), {
      tenantId: input.tenantId,
      leadId: input.leadId,
      messageId: input.inboundMessageId,
    });
    return null;
  }
  try {
    const provider = mediaProviderFactory(connection);
    const { url, mimeType: lookupMime } = await provider.getMediaUrl(input.mediaId);
    const { buffer, mimeType: dlMime } = await provider.downloadMedia(url);
    const mimeType = input.mimeType ?? lookupMime ?? dlMime ?? 'audio/ogg';
    const text = await transcribe(buffer, mimeType);
    if (!text.trim()) {
      logError(new Error('transcription returned empty text'), {
        tenantId: input.tenantId,
        leadId: input.leadId,
        messageId: input.inboundMessageId,
      });
      return null;
    }
    return text;
  } catch (err) {
    // AC#3: log with context, return null so the caller sends the fallback.
    logError(err, {
      tenantId: input.tenantId,
      leadId: input.leadId,
      messageId: input.inboundMessageId,
      stage: 'audio_transcription',
    });
    return null;
  }
}

/**
 * Downloads the inbound image and builds a base64 Claude vision block (AC#4), and
 * stores `midia_url` on the inbound row (AC#5). Returns `null` on failure (the
 * agent still runs on the caption text alone — a download error is non-fatal).
 */
async function tryDownloadImage(
  args: MediaHandlingArgs & { tenantId: string }
): Promise<ImageContentBlock | null> {
  const { input, connection, mediaProviderFactory, logError } = args;
  if (!input.mediaId) return null;
  try {
    const provider = mediaProviderFactory(connection);
    const { url, mimeType: lookupMime } = await provider.getMediaUrl(input.mediaId);
    const { buffer, mimeType: dlMime } = await provider.downloadMedia(url);

    // AC#5: persist the resolved CDN URL on the inbound row.
    if (input.inboundMessageId) {
      await updateInboundMediaUrl(input.tenantId, input.inboundMessageId, url);
    }

    const rawMime = (input.mimeType ?? lookupMime ?? dlMime ?? 'image/jpeg')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    const mediaType = normalizeImageMediaType(rawMime);
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
    };
  } catch (err) {
    logError(err, {
      tenantId: input.tenantId,
      leadId: input.leadId,
      messageId: input.inboundMessageId,
      stage: 'image_download',
    });
    return null;
  }
}

/** Coerces a Meta-reported image MIME type to one Anthropic vision accepts. */
function normalizeImageMediaType(mime: string): SupportedImageMediaType {
  return (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mime)
    ? (mime as SupportedImageMediaType)
    : 'image/jpeg';
}

/** Returns the last `role: 'user'` entry in the running messages array. */
function findLastUserMessage(
  messages: AnthropicHistoryMessage[]
): AnthropicHistoryMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i];
  }
  return undefined;
}

/** AC#1: store the transcription on the already-inserted inbound `messages` row. */
async function updateInboundTranscription(
  tenantId: string,
  inboundMessageId: string,
  transcricao: string
): Promise<void> {
  await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.messages)
      .set({ transcricao })
      .where(eq(schema.messages.id, inboundMessageId))
  );
}

/** AC#5: store the resolved media URL on the already-inserted inbound row. */
async function updateInboundMediaUrl(
  tenantId: string,
  inboundMessageId: string,
  midiaUrl: string
): Promise<void> {
  await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.messages)
      .set({ midiaUrl })
      .where(eq(schema.messages.id, inboundMessageId))
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

async function acquireLock(redis: RedisLock, key: string, token: string): Promise<boolean> {
  const res = await redis.set(key, token, { nx: true, px: LOCK_TTL_MS });
  return res === 'OK' || res === true;
}

async function releaseLock(redis: RedisLock, key: string, token: string): Promise<void> {
  const current = await redis.get(key);
  if (current === token) {
    await redis.del(key);
  }
}

function randomDelay(): number {
  return (
    SEGMENT_DELAY_MIN_MS +
    Math.floor(Math.random() * (SEGMENT_DELAY_MAX_MS - SEGMENT_DELAY_MIN_MS + 1))
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultSenderFactory(record: ConnectionRecord): WhatsAppSender {
  return new MetaCloudProvider(record);
}

function defaultMediaProviderFactory(record: ConnectionRecord): MediaProvider {
  return new MetaCloudProvider(record);
}

function defaultLogError(error: unknown, context: Record<string, unknown>): void {
  // Sentry is wired at the call site (apps/api) via deps.logError; the default
  // keeps @leedi/agent free of a @leedi/config (env-validating) import.
  console.error('[process-message]', error, context);
}
