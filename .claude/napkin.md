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

## Domain Guardrails

1. **[2026-05-30] Domínio do projeto é leedi.digital, não leedi.com.br**
   Do instead: Usar `leedi.digital` em todo código (emails, URLs, configs). Docs antigas mencionam `leedi.com.br` — ignorar. Email from address: `noreply@leedi.digital`. Arquivo: `packages/notification/src/adapters/resend.ts`.

## User Directives

1. **[2026-05-28] Chat always in Portuguese-BR**
   Do instead: All conversational replies to Caio in pt-BR. Switch to English only for documentation files, code comments, and docstrings.

2. **[2026-05-28] Documentation always in English**
   Do instead: README, ADRs, inline code comments, and spec files written in English even when chat is in pt-BR.
