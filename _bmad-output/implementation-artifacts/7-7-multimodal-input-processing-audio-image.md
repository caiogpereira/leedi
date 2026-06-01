---
baseline_commit: 9ea8a05
---

# Story 7.7: Multimodal Input Processing (Audio + Image)

Status: ready-for-dev

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

- [ ] Task 1: Transcription provider port + adapters + factory (AC: #1, #3)
  - [ ] Create `packages/agent/src/ports/transcription-provider.ts` — interface `TranscriptionProvider { transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> }`
  - [ ] Create `packages/agent/src/adapters/groq-whisper-adapter.ts` — implements `TranscriptionProvider`; downloads audio from Meta CDN with auth header; calls Groq Whisper `POST https://api.groq.com/openai/v1/audio/transcriptions` with `model='whisper-large-v3-turbo'`, `language='pt'`; OGG/OPUS accepted natively — no transcode. Cost: ~$0.00033/min (~18× cheaper than OpenAI Whisper)
  - [ ] Create `packages/agent/src/adapters/openai-whisper-adapter.ts` — fallback; calls OpenAI Whisper at `$0.006/min`. Use only if `TRANSCRIPTION_PROVIDER=openai` explicitly set
  - [ ] Create stub `packages/agent/src/adapters/deepgram-adapter.ts` — implements interface with graceful no-op + TODO comment
  - [ ] Create `packages/agent/src/utils/transcribe-audio.ts` — factory function `getTranscriptionProvider(): TranscriptionProvider` that reads `TRANSCRIPTION_PROVIDER` env var (`'groq'` | `'openai'` | `'deepgram'`, default `'groq'`) and returns the matching adapter
  - [ ] Add `GROQ_API_KEY` (required when `TRANSCRIPTION_PROVIDER=groq`, i.e. the default), `OPENAI_API_KEY` (optional — only when `TRANSCRIPTION_PROVIDER=openai`), and `TRANSCRIPTION_PROVIDER` (default `'groq'`) to `packages/config/src/schema.ts`
- [ ] Task 2: Image processing in the message pipeline (AC: #4, #5)
  - [ ] In `process-message.ts`, when message `tipo='imagem'`, extract `midia_url`
  - [ ] Build the user message for Claude as a multimodal content block: `[{ type: 'image', source: {...} }, { type: 'text', text: '...' }]`
  - [ ] Meta CDN URLs require auth — for V1, FETCH the image with the access token and pass it to Claude as `{ type: 'base64', media_type, data }` (do not rely on URL fetch by Claude). Store `tipo='imagem'` and `midia_url` in `messages`
- [ ] Task 3: Audio handling in `process-message` (AC: #1, #2, #3)
  - [ ] In inbound processing (before the agent call), branch on message `tipo`
  - [ ] If `tipo='audio'`: call `transcribeAudio`; on success → use the transcription as the message content and store it in `messages.transcricao`; on failure → send the fallback message and RETURN EARLY
- [ ] Task 4: Error handling + fallback (AC: #3)
  - [ ] Wrap transcription in try/catch; on failure send "Recebi seu áudio mas não consegui entender. Pode me mandar como texto?" via `MetaCloudProvider`
  - [ ] Log the error to Sentry with context (`tenantId`, `leadId`, `messageId`)
- [ ] Task 5: Tests (AC: #1, #3, #4)
  - [ ] Unit: `transcribeAudio` returns the transcription string (mock OpenAI)
  - [ ] Unit: audio failure triggers the fallback response and early return
  - [ ] Unit: an image message builds the correct multimodal Claude content block (base64 image + text)

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
