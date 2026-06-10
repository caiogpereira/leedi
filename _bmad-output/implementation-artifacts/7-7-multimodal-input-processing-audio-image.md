---
baseline_commit: 992b842
---

# Story 7.7: Multimodal Input Processing (Audio + Image)

Status: done

## Story

As a lead using WhatsApp,
I want to be able to send voice messages and photos and have the agent understand them,
so that I can communicate naturally.

## Acceptance Criteria

1. **Given** a lead sends a voice message, **When** the Meta webhook delivers it with `type: 'audio'`, **Then** the audio file is downloaded from Meta's CDN, transcribed to text using a transcription API (Whisper via OpenAI or equivalent), the transcription is stored in `messages.transcricao`, **And** passed to the agent as the message content.
2. **Given** audio transcription succeeds, **When** the agent processes the transcription, **Then** it responds coherently to the audio content (regular text processing after transcription).
3. **Given** audio transcription fails (network error, unsupported format), **When** the failure occurs, **Then** the agent responds: "Recebi seu áudio mas não consegui entender. Pode me mandar como texto?", **And** the failure is logged with the error.
4. **Given** a lead sends an image, **When** the webhook delivers it with `type: 'image'`, **Then** the image is included in the Claude API call as a vision input, **And** the agent responds to the visual content.
5. **Given** the agent receives an image, **When** including it in the Claude call, **Then** the message `tipo` is set to `imagem` in the `messages` table and `midia_url` is stored.

## Tasks / Subtasks

- [x] Task 1: Transcription provider port + adapters + factory (AC: #1, #3)
  - [x] Create `packages/agent/src/ports/transcription-provider.ts` — interface `TranscriptionProvider { transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> }`
  - [x] Create `packages/agent/src/adapters/groq-whisper-adapter.ts` — implements `TranscriptionProvider`; calls Groq Whisper `POST https://api.groq.com/openai/v1/audio/transcriptions` with `model='whisper-large-v3-turbo'`, `language='pt'`; OGG/OPUS accepted natively — no transcode. (Media download moved to process-message, which owns the tenant token — keeps the port provider-agnostic.)
  - [x] Create `packages/agent/src/adapters/openai-whisper-adapter.ts` — fallback; calls OpenAI Whisper. Used only if `TRANSCRIPTION_PROVIDER=openai`
  - [x] Create stub `packages/agent/src/adapters/deepgram-adapter.ts` — implements interface; throws-loudly (not silent no-op) + V2 TODO
  - [x] Create `packages/agent/src/utils/transcribe-audio.ts` — factory `getTranscriptionProvider()` reads `TRANSCRIPTION_PROVIDER` (`'groq'` | `'openai'` | `'deepgram'`, default `'groq'`) + a `transcribeAudio()` convenience wrapper
  - [x] Add `GROQ_API_KEY` (optional, validated lazily at first audio use), `OPENAI_API_KEY` (optional), `TRANSCRIPTION_PROVIDER` (default `'groq'`) to `packages/config/src/schema.ts`
- [x] Task 2: Image processing in the message pipeline (AC: #4, #5)
  - [x] In `process-message.ts`, when message `tipo='imagem'`, resolve the Meta media ID → CDN URL and download the bytes with the tenant access token
  - [x] Build the user message for Claude as a multimodal content block: `[{ type: 'image', source: { type: 'base64', media_type, data } }, { type: 'text', text }]`, injected into the running `messages` for THIS call only (base64 never persisted to agent-memory)
  - [x] Store `midia_url` on the inbound `messages` row (`tipo='imagem'` already set by the webhook)
- [x] Task 3: Audio handling in `process-message` (AC: #1, #2, #3)
  - [x] Before the agent call, branch on message `tipo`
  - [x] If `tipo='audio'`: download + transcribe; on success → use the transcription as the message content and UPDATE `messages.transcricao`; on failure → send the fallback message and RETURN EARLY (no Claude call)
- [x] Task 4: Error handling + fallback (AC: #3)
  - [x] Wrap transcription in try/catch; on failure send EXACTLY "Recebi seu áudio mas não consegui entender. Pode me mandar como texto?" via the WhatsApp sender + persist it as an outbound agent message
  - [x] Log the error with context (`tenantId`, `leadId`, `messageId`) via an injectable `logError` (defaults to `console.error`; api wires `captureException`)
- [x] Task 5: Tests (AC: #1, #3, #4)
  - [x] Unit: `GroqWhisperAdapter.transcribe` returns the transcription string (mock global `fetch`); also covers the lazy `GROQ_API_KEY` throw (no fetch) and the non-ok-response throw
  - [x] Unit: audio success transcribes, feeds the transcription to Claude, and UPDATEs `messages.transcricao` (mock media provider + transcribe)
  - [x] Unit: audio failure triggers the EXACT fallback response, persists it, logs with context, and returns early (no Claude call)
  - [x] Unit: an image message builds the correct multimodal Claude content block (base64 image + text) and it reaches `anthropic.messages.create`; `midia_url` is stored

## Dev Notes

- Files to create: `packages/agent/src/utils/transcribe-audio.ts`.
- Files to modify: `packages/agent/src/use-cases/process-message.ts` (audio/image branching), `packages/config/src/schema.ts` (`OPENAI_API_KEY` optional, `TRANSCRIPTION_PROVIDER` default `'openai'`), `apps/api/src/routes/webhook/meta.ts` if media type extraction happens at the webhook (Story 4.4 stores `tipo`/`midia_url`).
- npm dependencies: plain authenticated `fetch` to the Groq transcriptions endpoint (same OpenAI-compatible API format) — no extra SDK needed since Groq exposes an OpenAI-compatible API. If preferred, `groq-sdk` is available as an alternative. Do NOT add `openai` SDK unless `TRANSCRIPTION_PROVIDER=openai` is configured.
- `messages.transcricao`, `messages.midia_url`, `messages.tipo` come from Epic 5's message schema — confirm those columns exist; if `transcricao` is absent, add it in a follow-up note (do NOT claim a migration number — Epic 7's only migration is `0008` in Story 7.1).
- @leedi/agent-memory isolation: the transcription/image utilities touch `messages` and external APIs only; agent-memory persistence still flows through `@leedi/agent-memory` in 7.2.

### Transcription provider — decision recorded

**V1: Groq Whisper.** `TRANSCRIPTION_PROVIDER=groq` is the default. Groq is ~18× cheaper than OpenAI Whisper at the same quality level for Portuguese. See Architecture §13 for the full decision record.

**Adapter pattern (swap without code changes):** Implement a `TranscriptionProvider` port interface in `packages/agent/src/ports/transcription-provider.ts` with a single method `transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>`. Concrete adapters:
- `packages/agent/src/adapters/groq-whisper-adapter.ts` (**V1, default**) — requires `GROQ_API_KEY`
- `packages/agent/src/adapters/openai-whisper-adapter.ts` — fallback, requires `OPENAI_API_KEY`
- `packages/agent/src/adapters/deepgram-adapter.ts` — stub only for V1

`transcribe-audio.ts` instantiates the adapter based on `TRANSCRIPTION_PROVIDER` env var (`groq` | `openai` | `deepgram`) via a factory function.

**Admin panel config for providers → V2 scope.** Changing the provider is a rare, platform-level operation (not per-tenant); env vars are the right mechanism for V1.

### Testing standards

- Unit tests mock the OpenAI client / fetch, `MetaCloudProvider`, and Sentry. Assert transcription success, the fallback path, and multimodal block construction.

### Pitfalls to avoid

- Do NOT pass a raw Meta CDN URL to Claude as a URL image source — those URLs require auth; fetch + base64 instead.
- Do NOT crash the agent on transcription failure — send the fallback and return early (AC #3).
- Do NOT make `GROQ_API_KEY` strictly required at boot if transcription is not expected — validate lazily at first use. The env schema should mark it as optional with a clear error at runtime if audio arrives and the key is absent.
- Whisper accepts OGG/OPUS — do NOT add an ffmpeg transcode step for V1.
- Keep `messages.tipo`/`midia_url`/`transcricao` consistent with Epic 5's schema — do not invent new columns silently.

### Project Structure Notes

- The transcription utility lives in `packages/agent/src/utils/`. Audio/image branching is a localized change in `process-message`. Config additions in `@leedi/config`.

### References

- [Source: docs/01-leedi-arquitetura.md#7.2 Fluxo de uma mensagem]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.7: Multimodal Input Processing (Audio + Image)]
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (webhook media handling)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (process-message pipeline)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

_none_

### Completion Notes List

- **Transcription provider default is `'groq'`** (Groq Whisper, `whisper-large-v3-turbo`, `language='pt'`), per the Architecture §13 decision record. The Dev Notes typo (`'openai'`) was NOT followed.
- **`GROQ_API_KEY`/`OPENAI_API_KEY` are OPTIONAL at boot** (validated lazily inside the adapter at first audio use). Tenants without audio never need them; an absent key throws a clear runtime error that is caught and converted to the AC#3 fallback.
- **Port stays provider-agnostic.** Per advisor review, the Meta CDN download lives in `process-message` (it owns the tenant's encrypted token via `ctxData.connection`), NOT in the Groq adapter. The port is `transcribe(buffer, mimeType)` only — keeps the openai/deepgram adapters coherent and the unit tests clean.
- **Data-flow gap fixed (was the crux).** The Story note "midia_url already stored by the webhook" was FALSE: the webhook stored `[audio]`/`[imagem]` as content and never captured the media `{id, mime_type}` object nor `midia_url`. Fixed end-to-end: `webhook-meta.ts` now extracts the media ref + the inserted inbound row id; both ride the debounce buffer to `internal.ts` (agent-flush), which threads `tipo`/`mediaId`/`mimeType`/`inboundMessageId` into `ProcessMessageInput`. `midia_url`/`transcricao` are UPDATEd on the inbound row by the agent loop after resolution.
- **`ProcessMessageInput` is the contract seam.** New optional fields `tipo`/`mediaId`/`mimeType`/`inboundMessageId`; new injectable deps `mediaProviderFactory`/`transcribe`/`logError` (all default to MetaCloudProvider / configured provider / `console.error`). The text path is byte-for-byte unchanged — existing 88 tests still pass.
- **Image base64 is injected into the in-memory `messages` array for the single Claude call only** — never persisted to agent-memory (avoids thread bloat + re-sending the image every turn). The text caption/transcription IS persisted.
- **`WhatsAppProvider` port: `getMediaUrl`/`downloadMedia` added as OPTIONAL** so outbound-only call sites (health checks, connect validation) and their mocks need not stub them. `MetaCloudProvider` implements both: `GET /{version}/{media-id}` → temporary URL → `GET` URL with Bearer.
- **`@leedi/observability` deliberately NOT imported into `@leedi/agent`** — it pulls in `@leedi/config` (env-validating, `process.exit` on missing vars), which would break the agent unit tests. Logging is injected as `logError`; api wires Sentry's `captureException`.
- Tests: 94 passed (16 files) in `@leedi/agent` (incl. a dedicated `GroqWhisperAdapter` fetch-mock test for the real adapter contract); 21 passed in `@leedi/connection`; 33 passed in `@leedi/api` (confirms the webhook/flush changes broke nothing). `@leedi/agent`/`@leedi/connection`/`@leedi/config` typecheck + lint clean. The 2 remaining `@leedi/api` typecheck errors (knowledge-base `tipo`, notification jsx) and 1 connection-test lint warning are PRE-EXISTING and unrelated to this story.
- No migration added — `tipo`/`midia_url`/`transcricao` columns already exist (confirmed in `packages/db/src/schema/message.ts`).

### File List

**Created**
- `packages/agent/src/ports/transcription-provider.ts`
- `packages/agent/src/adapters/groq-whisper-adapter.ts`
- `packages/agent/src/adapters/openai-whisper-adapter.ts`
- `packages/agent/src/adapters/deepgram-adapter.ts`
- `packages/agent/src/utils/transcribe-audio.ts`

**Modified**
- `packages/config/src/schema.ts` (TRANSCRIPTION_PROVIDER, GROQ_API_KEY, OPENAI_API_KEY)
- `packages/agent/src/use-cases/process-message.ts` (audio/image branching, media seam, fallback, transcricao/midia_url updates)
- `packages/agent/src/index.ts` (export transcription surface + MediaProvider type)
- `packages/agent/package.json` (add `@leedi/config` dependency)
- `packages/connection/src/ports/whatsapp-provider.ts` (optional getMediaUrl/downloadMedia)
- `packages/connection/src/adapters/meta-cloud-provider.ts` (getMediaUrl + downloadMedia)
- `apps/api/src/routes/webhook-meta.ts` (capture media id/mime + inbound row id, buffer payload)
- `apps/api/src/routes/internal.ts` (parse media from buffer, pass to processMessage, wire Sentry logError)
- `packages/agent/src/use-cases/__tests__/process-message.test.ts` (update-path fake tx, transcribe/config mocks, 3 new tests)

**Tests created**
- `packages/agent/src/adapters/__tests__/groq-whisper-adapter.test.ts` (real adapter, mock `fetch`: ok/lazy-key/non-ok)

### Change Log

- 2026-06-02: Implemented Story 7.7 (multimodal audio + image input). Status → review.
