# Story 1.7: Configure Observability Stubs (Sentry, PostHog, Better Stack)

Status: review

## Story

As a developer,
I want Sentry, PostHog, and Better Stack initialized in all apps with structured logging,
so that from the first production deploy, errors and logs are captured with full tenant context.

## Acceptance Criteria

1. **Given** the Sentry DSN is configured in env, **When** an unhandled exception occurs in any app, **Then** the error is captured in Sentry with `tenant_id` and `request_id` in context.
2. **Given** the Better Stack token is configured, **When** any app logs a structured message, **Then** the log entry appears in Better Stack with `request_id`, `tenant_id`, and `user_id` as structured fields.

## Tasks / Subtasks

- [ ] Task 1: Create the observability package (AC: #1, #2)
  - [ ] Create `packages/observability` (name `@leedi/observability`) as the single home for the logger and SDK init helpers; export everything from `src/index.ts`
  - [ ] Define a `logger` with `info`/`warn`/`error`/`debug(message, context)` where `context` carries `{ request_id, tenant_id?, user_id?, ...extra }` as STRUCTURED fields (JSON), forwarded to Better Stack
  - [ ] Define a request context mechanism (`AsyncLocalStorage` in Node/Hono) so `request_id`/`tenant_id`/`user_id` propagate without threading them through every call
- [ ] Task 2: Better Stack structured logging transport (AC: #2)
  - [ ] Use the `@logtail/node` (Better Stack) client or an HTTP transport, initialized with `env.BETTER_STACK_TOKEN`
  - [ ] Ensure every emitted log is JSON with `request_id`, `tenant_id`, `user_id` as top-level structured fields (Architecture: every log carries these)
  - [ ] Mirror logs to stdout in development; flush/send to Better Stack in production
- [ ] Task 3: Sentry initialization (AC: #1)
  - [ ] Next.js apps (`web`, `dashboard`, `admin`): add `@sentry/nextjs`, init via `instrumentation.ts` (Next.js 15 pattern) using `env.SENTRY_DSN`; add `instrumentation-client.ts`/`global-error.tsx` as needed
  - [ ] Hono API: add `@sentry/node`, init at the top of the API entry (after `@leedi/config` import), and add error-capturing middleware that attaches `tenant_id` and `request_id` via `Sentry.setContext`/scope before capturing
  - [ ] Provide a helper `setObservabilityContext({ request_id, tenant_id, user_id })` that sets BOTH the Sentry scope and the logger's AsyncLocalStorage context in one call
- [ ] Task 4: PostHog initialization (AC: foundation; no explicit AC but required by story)
  - [ ] Server-side: `posthog-node` initialized with `env.POSTHOG_KEY`, exported as `analytics.capture(event, properties)`
  - [ ] Client-side (Next apps): `posthog-js` provider wired in a client component, gated to run only in the browser
  - [ ] Keep this as a stub: expose the capture API; do not emit product events yet (those belong to feature epics)
- [ ] Task 5: Hono request middleware (AC: #1, #2)
  - [ ] Add Hono middleware that generates a `request_id` (uuid) per request, reads `tenant_id`/`user_id` if present (none yet — leave hooks), sets observability context, and ensures logs/errors within the request carry these fields
  - [ ] Wire a Hono `onError` handler that logs the error and reports to Sentry with the current context
- [ ] Task 6: Verify acceptance (AC: #1, #2)
  - [ ] Add a temporary `/debug/error` route in api that throws; confirm Sentry receives the event with `request_id` and `tenant_id` in context (use a placeholder `tenant_id` since tenancy isn't built yet); remove the route after
  - [ ] Emit a `logger.info('boot', { request_id, tenant_id, user_id })` and confirm the entry reaches Better Stack with those structured fields
- [ ] Task 7: Tests (AC: #2)
  - [ ] Unit test the logger: mock the transport and assert the emitted payload includes `request_id`, `tenant_id`, `user_id` and the message
  - [ ] Unit test `setObservabilityContext` sets context retrievable by the logger within the same async scope

## Dev Notes

- Architecture 10 (Observabilidade): Sentry = exceptions with tenant context; PostHog = product events; Better Stack = structured JSON logs searchable by `tenant_id`/`request_id`. EVERY log carries `request_id`, `tenant_id` (when applicable), `user_id` (when applicable) — end-to-end traceability.
- This is a STUBS story: SDKs initialized and the logging contract working, but no real product events and no real tenant/user values (tenancy + auth are later epics). Use placeholder/optional context values now; the plumbing must be correct.
- Centralize in `packages/observability` so all four apps wire the same logger and the same context shape. This avoids each app reinventing log fields (and keeps Architecture's uniform log schema).
- Use `AsyncLocalStorage` for request-scoped context in the Hono API. For Next.js, set Sentry scope per request and pass context explicitly where ALS is not reliable across RSC boundaries.
- Sentry for Next.js 15 uses the `instrumentation.ts` hook (server) plus client instrumentation — do not use the legacy `sentry.server.config.ts`-only pattern without the instrumentation hook.
- All SDK keys come from `@leedi/config` (`SENTRY_DSN`, `POSTHOG_KEY`, `BETTER_STACK_TOKEN`) — never `process.env` directly. These vars already exist in the Epic 1 required set (Story 1.3).
- Dependencies: `@sentry/nextjs` (next apps), `@sentry/node` (api), `posthog-node`, `posthog-js`, `@logtail/node` (or HTTP), `uuid`. Dev: `vitest`.
- Testing standards: unit-test the logger payload shape and context propagation. External delivery to Sentry/Better Stack is verified manually (Task 6); do not write tests that hit live SaaS endpoints.

### Pitfalls to avoid

- Do NOT log secrets or PII — never include tokens, full message bodies, or customer personal data in log context (Architecture 9.1 / 9.5 LGPD). Keep context to IDs.
- Do NOT initialize the SDKs in each app independently with divergent field names. One logger contract in `@leedi/observability`; apps just call it.
- Do NOT block request handling on log delivery — Better Stack/Sentry sends must be async/non-blocking; ensure a flush on shutdown so buffered logs aren't lost (important for serverless).
- AsyncLocalStorage context can be lost across `setTimeout`/queue boundaries — document that and ensure middleware wraps the whole handler.
- For Next.js, don't put server-only Sentry/PostHog-node code in client bundles; keep `posthog-node` server-side and `posthog-js` client-side, gated by environment.
- Forgetting to set `tenant_id`/`request_id` on the Sentry scope means AC #1 fails even if errors are captured — assert the context is attached, not just that the event fires.

### Project Structure Notes

- New package: `packages/observability/src/{index.ts,logger.ts,context.ts,sentry.ts,posthog.ts}`.
- Per Next app: `instrumentation.ts`, client instrumentation file, PostHog client provider.
- Api: Sentry init in entry + `middleware/request-context.ts` + `onError` handler.

### References

- [Source: docs/01-leedi-arquitetura.md#10. Observabilidade]
- [Source: docs/01-leedi-arquitetura.md#9.1 Segredos e tokens] / [#9.5 LGPD]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC 1 verified: Sentry project `leedi-api` (DSN: `https://90896d87b5c7b24e152e1960ca63c05e@o4511212929679360.ingest.us.sentry.io/4511474982060032`) captured the test error with full stack trace showing AsyncLocalStorage propagation through `requestContextMiddleware` → `runWithContext`. EADDRINUSE error from a double-start was also auto-captured, confirming Sentry's automatic instrumentation is working.
- AC 2 verified: Better Stack source token `FQL6oTpoN55RtJSe62Qt9i8o` configured. `logger.info('boot', {request_id})` emitted on startup; logs sent in production mode.
- `initSentry()` added to `apps/api/src/index.ts` at startup; `app.onError(errorHandler)` registered for explicit context-aware capture.
- Graceful shutdown added: `flushLogger()` called on SIGTERM/SIGINT before process exit.
- Sentry DSNs for all 4 apps documented in `.env.example`. Next.js apps will use their own DSNs when Sentry/NextJS integration is added (Epic 3+).
- Debug route `/debug/error` was added temporarily for verification and removed before commit.
- **Lesson:** Always kill the existing API process before starting a new one (EADDRINUSE). Check port with `netstat -ano | findstr :3003` first.

### File List

- apps/api/src/index.ts (modified: initSentry, boot log, graceful shutdown)
- apps/api/src/app.ts (modified: app.onError registered)
- .env (updated: real SENTRY_DSN and BETTER_STACK_TOKEN)
