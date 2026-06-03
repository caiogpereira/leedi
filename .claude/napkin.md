# Napkin Runbook

## Curation Rules

- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)

1. **[2026-05-28] Backend framework is Hono (confirmed)**
   Do instead: Use Hono for `apps/api`. Do not switch to Fastify. Edge-ready, Vercel-compatible.

2. **[2026-05-28] Validate docs before generating epics/stories**
   Do instead: Always run validation pass (PRD + Architecture + Execution) before invoking `bmad-create-epics-and-stories`. Check cross-document coherence, NFRs, and open decisions.

## Architecture Guardrails

1. **[2026-05-28] Never import domain internals — only public interface**
   Do instead: All inter-domain imports must go through `@leedi/<domain>` (the `index.ts` barrel). Never import from `packages/<domain>/src/use-cases/...` directly.

2. **[2026-05-28] Every tenant table needs RLS**
   Do instead: Every table with `tenant_id` must have a RLS policy. Add to Definition of Done checklist on every module.

3. **[2026-05-28] Access tokens/secrets are always encrypted at rest**
   Do instead: `access_token_encrypted` and gateway secrets use envelope encryption. Never store plaintext. Never log or expose in API responses.

4. **[2026-05-28] Prompt caching is mandatory, not optional**
   Do instead: Structure agent calls so the stable system prompt (persona + method + product) is the cacheable prefix. Variable content (new message) always comes last.

5. **[2026-05-30] Better-Auth UUID: usar advanced.database.generateId, não advanced.generateId**
   Do instead: `advanced: { database: { generateId: 'uuid' } }`. O `advanced.generateId` existe mas só é usado no contexto de `ctx.context.generateId` — o adapter layer usa `advanced.database.generateId` para gerar o ID real no INSERT.

6. **[2026-05-30] Better-Auth Server Actions require nextCookies() plugin**
   Do instead: Always include `nextCookies()` as the LAST plugin in the betterAuth plugins array. Without it, login/logout in Server Actions sets no cookie and the user bounces back to /login immediately.

6. **[2026-05-30] Edge runtime cannot hit the DB — use Edge-safe session cookie check**
   Do instead: In Next.js middleware (Edge), use `getSessionCookie()` from `better-auth/cookies` (synchronous). Never call `auth.api.getSession()` in middleware — it hits the DB and crashes.
   [2026-06-02] CRITICAL refinement: the function being Edge-safe is NOT enough — what matters is the ENTIRE import graph. Importing from a barrel (`@leedi/auth` index) drags in `auth.ts` → `@leedi/db`/`@leedi/config`, and `config/index.ts` runs `node:path`/`node:url` at module load → "Native module not found: node:path" in middleware. Fix: keep Edge-only helpers in a dedicated module (`packages/auth/src/edge.ts`) that imports ONLY `better-auth/cookies` + pure `rbac.ts`, expose it via a package subpath export (`"./edge"` in package.json `exports`), and import middleware from `@leedi/auth/edge`. Rule: middleware imports must never transitively reach db/config.

7. **[2026-05-30] withTenant RLS: listUserTenants must be two-phase**
   Do instead: To list a user's tenants at login, read memberships under `withUser(userId)` first, then read each tenant row under `withTenant(tenantId)`. A direct join fails because the tenants table RLS uses `app.tenant_id`, not `app.user_id`.

8. **[2026-05-30] auth→tenancy circular dependency risk**
   Do instead: packages/auth and packages/tenancy MUST NOT import each other. If auth needs an audit log write, use @leedi/db directly. If tenancy needs permission checks, import from @leedi/auth (tenancy can depend on auth, NOT the reverse).

9. **[2026-05-30] Better-Auth password reset API name**
   Do instead: Use `auth.api.requestPasswordReset` (NOT `forgetPassword` — that's the email-otp plugin only). Reset page reads `?token=` query param (not a `[token]` path segment) — Better-Auth redirects there after validating the link.

## Monorepo Dev Environment

1. **[2026-05-30] Pacotes workspace precisam estar em transpilePackages para hot-reload funcionar**
   Do instead: Todos os `@leedi/*` usados por apps Next.js devem estar em `transpilePackages` no `next.config.ts`. Sem isso, mudanças nos pacotes exigem limpar `.next` manualmente (`Remove-Item -Recurse -Force apps\*\.next`). Lista completa: `['@leedi/ui', '@leedi/auth', '@leedi/config', '@leedi/db', '@leedi/notification', '@leedi/tenancy', '@leedi/observability']`.

2. **[2026-05-30] tsx/Hono API não carrega .env da raiz automaticamente**
   Do instead: Adicionar `process.loadEnvFile(resolve(_dir, '../../../.env'))` em `packages/config/src/index.ts` ANTES de `validateEnv`. Usar `process.loadEnvFile()` nativo do Node.js 22+ — sem dependências extras. NÃO tentar passar `--env-file` via tsx CLI (conflita com o subcomando `watch`).

2. **[2026-05-30] Better-Auth anti-enumeração: 200 OK silencioso para email já cadastrado**
   Do instead: Com `requireEmailVerification: true` + `autoSignIn: false`, cadastro de email existente retorna 200 OK sem email e sem erro (proteção anti-enumeração). Para debugar: apagar o registro de `users` + `accounts` no Supabase e tentar novamente. Não confundir com bug de código.

3. **[2026-05-30] Portas 3000-3003 travadas após dev server crash**
   Do instead: Antes de subir o dev, rodar `@(3000,3001,3002,3003) | ForEach-Object { (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue).OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }` no PowerShell.

## Shell & Command Reliability

1. **[2026-05-29] Set-Content on Windows adds UTF-16 BOM — breaks JSON parsers and Next.js builds**
   Do instead: Always use `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))` to write files from PowerShell. Never use `Set-Content` for code/config files.

2. **[2026-05-29] Get-Content piped to Set-Content converts LF → CRLF AND adds BOM**
   Do instead: To replace text in files, use the Edit tool or write via `[System.IO.File]::WriteAllText`. Avoid PowerShell file content pipelines for source code.

3. **[2026-05-29] Always kill previous API process before starting a new one (EADDRINUSE)**
   Do instead: Before starting any dev/test server, run `Stop-Process -Id (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue`. Check with `netstat -ano | findstr :PORT` first.

## Agent / AI Architecture

1. **[2026-06-02] Partitioned tables require composite PKs — Drizzle Kit won't emit PARTITION BY**
   Do instead: Hand-write the migration SQL for `agent_threads`/`agent_messages`. PKs MUST be `(id, created_at)`. Cross-partition FKs are illegal — enforce at app layer. Document in migration.

2. **[2026-06-02] Model IDs live ONLY in `packages/agent/src/config/model-routing.ts`**
   Do instead: Never hardcode `claude-*` strings outside that file. Use `modelIdForTask()` for task models, `SALES_MODELS[config.modelo_ia]` for sales loop. Current IDs: sonnet=`claude-sonnet-4-6`, haiku=`claude-haiku-4-5-20251001`, opus=`claude-opus-4-8`.

3. **[2026-06-02] Tool schema vs ctx boundary — identity fields NEVER go in the Anthropic tool JSON schema**
   Do instead: Tool input_schema exposes ONLY model-supplied params (productId, categoria, motivo, etc). `tenantId`, `leadId`, `leadPhone`, `connectionId`, `threadId`, `conversationWindowId` are injected from `ToolContext` in `routeToolCall`, never shown to Claude.

4. **[2026-06-02] Meta CDN media requires auth — do NOT pass raw URL to Claude vision**
   Do instead: Always fetch the media with `Authorization: Bearer {accessToken}`, then pass as base64 `{ type: 'base64', media_type, data }` to Claude. Raw CDN URLs expire and require auth.

5. **[2026-06-02] Webhook ack must be immediate — never block it on agent processing**
   Do instead: Ack Meta 200 immediately. Agent loop runs via QStash job (`/api/internal/agent-flush`), not inline in the webhook handler. Blocking the ack causes Meta retries → duplicate processing.

6. **[2026-06-02] Sandbox guards must be in routeToolCall, not just in the send loop**
   Do instead: `enviar_link_checkout` calls `MetaCloudProvider.sendText()` internally — bypassing the send loop in `process-message` is NOT enough. Add `sandboxMode` to `ToolContext` and stub write-side tools in `routeToolCall`.

7. **[2026-06-02] Lazy-init Redis/Anthropic in Hono routers — never at module import time**
   Do instead: Use a lazy singleton getter (`let _redis: Redis; function getRedis() { _redis ??= new Redis(...); return _redis; }`). Instantiating at `createXxxRouter()` call time causes health test timeouts because app.ts is imported before vi.mock runs in some test setups.

8. **[2026-06-02] Health test dynamic `import('../app.js')` inside test body causes 5s timeout**
   Do instead: Move `await import('../app.js')` into `beforeAll(..., 30000)` so the slow import (Anthropic SDK, agent packages) happens before the 5s test clock starts. Health test mocks must cover `@anthropic-ai/sdk`, `@leedi/agent`, and `@leedi/gateway`.

## Gateway / Integration Patterns

1. **[2026-06-02] Story specs say BullMQ — project uses QStash. Always verify.**
   Do instead: Check `apps/api/package.json` for `bullmq` before writing job code. Project uses QStash + `/api/internal/<route>` pattern (see `campaign-phase-transition.ts`). Never add BullMQ.

2. **[2026-06-02] Drizzle `.set({ field: undefined })` silently omits the column — use `null` to clear FKs**
   Do instead: When nulling out a nullable FK (e.g., `produtoCompradoId` on cancellation), use `null` explicitly. `undefined` means "don't update this column" in Drizzle, not "set to NULL".

3. **[2026-06-02] Migration number must be confirmed at implementation time — story specs can be stale**
   Do instead: Always `cat packages/db/migrations/meta/_journal.json | grep idx` to find the last idx before writing migration SQL and journal entry. Story specs frequently say the wrong number.

4. **[2026-06-02] Hotmart webhook validation: `hottok` query param only — no HMAC**
   Do instead: Validate `req.query('hottok') === integration.webhook_secret`. No `X-Hub-Signature` equivalent. Webhook URL path must be a UUID (unguessable). Return 200 on unknown event types to prevent Hotmart retries.

5. **[2026-06-02] Dispatch throttling: QStash chained batch, NOT sleep loop**
   Do instead: `run-dispatch-job` creates all targets then enqueues first `process-dispatch-batch` via QStash. Each batch invocation processes BATCH_SIZE=10 targets, then schedules next batch with `delay = Math.ceil(BATCH_SIZE * tier_interval_ms / 1000)`. Never sleep-loop in serverless — Vercel times out.

6. **[2026-06-02] `dispatch_targets.dispatch_job_id` is nullable — recovery targets tie to rules, not jobs**
   Do instead: Recovery targets (13.3) have `dispatch_job_id = null` and `dispatch_rule_id` set. Always set `dispatch_rule_id` when creating recovery targets; use it for 24h deduplication.

7. **[2026-06-02] `dispatch_rule_trigger` enum includes boleto/pix — required by handle-recovery-event.ts**
   Do instead: enum values must include `'boleto_gerado'` and `'pix_gerado'` in addition to `'carrinho_abandonado'`. Without them, Postgres rejects the already-shipped recovery event handler query.

## Usage Metering (Epic 16)

1. **[2026-06-03] `incrementUsage` returns `alertsDue` — never statically imports `@leedi/notification`**
   Do instead: Keep `@leedi/usage` free of `@leedi/notification`. Return `AlertDue[]` from `incrementUsage` and let the apps/api caller (webhook-meta.ts) fire the notifications via `createNotificationStub()`. Same rule applies to any new domain package.

2. **[2026-06-03] Block check must be separate read-only function before window creation**
   Do instead: Use `checkUsageBlock(tenantId)` (read-only) at the apps/api layer BEFORE calling `resolveConversationWindow`. The `incrementUsage` function also checks internally but the two-step pattern avoids creating the window first.

3. **[2026-06-03] `require-role.ts` reads `tenantRole` not `role` from context**
   Do instead: `requirePermission` reads `ctx.get('tenantRole')` — `requireTenantSession` sets `tenantRole`, not `role`. This was a pre-existing bug fixed in Epic 16. Never read `ctx.get('role')` in this codebase.

4. **[2026-06-03] Settings pages live under `settings/` not `configuracoes/`**
   Do instead: All settings pages follow `app/(shell)/settings/<feature>/page.tsx` pattern. Block banner CTAs point to `/settings/billing`. See `settings/team`, `settings/whatsapp` for existing examples.

5. **[2026-06-03] `getUsageCounter` returns config fields for settings UI init**
   Do instead: `/usage/current` response includes `bloquearAoAtingirLimite` and `notificarOverageA` so the settings toggles can initialize from saved state. Never initialize toggles from hardcoded defaults.

## Analytics Dashboard (Epic 15)

1. **[2026-06-03] `whatsapp_connections` quality_rating enum is `verde|amarelo|vermelho` — not English**
   Do instead: Story specs may say `yellow`/`red`. Always check the actual schema enum. Use `verde|amarelo|vermelho` in all code. Same for messaging tier: `1k|10k|100k|unlimited` (no `tier_` prefix).

2. **[2026-06-03] `vi.mock` factory hoisting: shared state must use `vi.hoisted`**
   Do instead: Any variable referenced inside a `vi.mock` factory (e.g., `dbRows`, `mockState`) MUST be declared with `vi.hoisted(() => ...)`. Variables declared at module scope are NOT accessible inside mock factories due to hoisting.

3. **[2026-06-03] `withUser` mock needs a chainable tx for `requireTenantSession` tests**
   Do instead: Follow `inbox-actions.test.ts` Proxy pattern: `makeSelectChain()` returns a Proxy where every method returns itself, and `.limit()` returns `Promise.resolve(shiftRow())`. Preload `dbRows` with `[{ role: 'owner' }]` as first row for the membership check.

## Human Inbox (Epic 14)

1. **[2026-06-03] `inbox_assignments` auto-created in resolveConversationWindow (not a separate use-case)**
   Do instead: When creating a new conversation_window, insert inbox_assignments (status='bot') in the same withTenant transaction in `packages/messaging/src/use-cases/resolve-conversation-window.ts`. LEFT JOIN in inbox list query handles pre-existing windows with no assignment.

2. **[2026-06-03] `@leedi/notification` eager resend.ts breaks agent package**
   Do instead: Never import `@leedi/notification` from `packages/agent`. The resend adapter does `const resend = new Resend(env.RESEND_API_KEY)` at module scope — importing notification from agent causes `new Resend(undefined)` in any test that mocks `@leedi/config` without `RESEND_API_KEY`. Use inline `console.info('[notification:stub]', ...)` in agent tools until Epic 18 wires real delivery.

3. **[2026-06-03] COALESCE sort for inbox recency (AC#5 compliance)**
   Do instead: Order inbox list by `COALESCE(last_message_at_subquery, conversation_windows.created_at) DESC`. Conversations with new messages float to top. Cursor must encode this same COALESCE value for keyset pagination.

## Domain Guardrails

1. **[2026-05-30] Domínio do projeto é leedi.digital, não leedi.com.br**
   Do instead: Usar `leedi.digital` em todo código (emails, URLs, configs). Docs antigas mencionam `leedi.com.br` — ignorar. Email from address: `noreply@leedi.digital`. Arquivo: `packages/notification/src/adapters/resend.ts`.

## User Directives

1. **[2026-05-28] Chat always in Portuguese-BR**
   Do instead: All conversational replies to Caio in pt-BR. Switch to English only for documentation files, code comments, and docstrings.

2. **[2026-05-28] Documentation always in English**
   Do instead: README, ADRs, inline code comments, and spec files written in English even when chat is in pt-BR.
