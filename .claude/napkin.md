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

5. **[2026-05-30] Better-Auth Server Actions require nextCookies() plugin**
   Do instead: Always include `nextCookies()` as the LAST plugin in the betterAuth plugins array. Without it, login/logout in Server Actions sets no cookie and the user bounces back to /login immediately.

6. **[2026-05-30] Edge runtime cannot hit the DB — use Edge-safe session cookie check**
   Do instead: In Next.js middleware (Edge), use `getSessionCookie()` from `better-auth/cookies` (synchronous). Never call `auth.api.getSession()` in middleware — it hits the DB and crashes.

7. **[2026-05-30] withTenant RLS: listUserTenants must be two-phase**
   Do instead: To list a user's tenants at login, read memberships under `withUser(userId)` first, then read each tenant row under `withTenant(tenantId)`. A direct join fails because the tenants table RLS uses `app.tenant_id`, not `app.user_id`.

8. **[2026-05-30] auth→tenancy circular dependency risk**
   Do instead: packages/auth and packages/tenancy MUST NOT import each other. If auth needs an audit log write, use @leedi/db directly. If tenancy needs permission checks, import from @leedi/auth (tenancy can depend on auth, NOT the reverse).

9. **[2026-05-30] Better-Auth password reset API name**
   Do instead: Use `auth.api.requestPasswordReset` (NOT `forgetPassword` — that's the email-otp plugin only). Reset page reads `?token=` query param (not a `[token]` path segment) — Better-Auth redirects there after validating the link.

## Shell & Command Reliability

1. **[2026-05-29] Set-Content on Windows adds UTF-16 BOM — breaks JSON parsers and Next.js builds**
   Do instead: Always use `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))` to write files from PowerShell. Never use `Set-Content` for code/config files.

2. **[2026-05-29] Get-Content piped to Set-Content converts LF → CRLF AND adds BOM**
   Do instead: To replace text in files, use the Edit tool or write via `[System.IO.File]::WriteAllText`. Avoid PowerShell file content pipelines for source code.

3. **[2026-05-29] Always kill previous API process before starting a new one (EADDRINUSE)**
   Do instead: Before starting any dev/test server, run `Stop-Process -Id (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue`. Check with `netstat -ano | findstr :PORT` first.

## User Directives

1. **[2026-05-28] Chat always in Portuguese-BR**
   Do instead: All conversational replies to Caio in pt-BR. Switch to English only for documentation files, code comments, and docstrings.

2. **[2026-05-28] Documentation always in English**
   Do instead: README, ADRs, inline code comments, and spec files written in English even when chat is in pt-BR.
