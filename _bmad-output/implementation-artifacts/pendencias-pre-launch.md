# Pendências Pré-Launch — consolidated production checklist

> **Purpose.** Single curated checklist of everything that must be reviewed/resolved
> **before going to production with real, paying customers.** It consolidates the
> deferred ACs and known gaps from every epic.
>
> **Sources** (this doc is the *curated index*; the detail lives in these):
> `deferred-work.md` (canonical debt tracker), the per-epic code-review reports
> (`epic-{1,2,3}-code-review-report.md`), `epic-1-test-ci-backlog.md`, and the
> embedded deferral notes inside individual story files.
>
> **Living document.** **All 20 epics** have had a formal code review (each with a
> `project_epic{N}_code_review` memory record). Section D below carries each epic's findings,
> **reconciled against those review records on 2026-06-20**. Re-run the review per epic and fold
> any new findings in here.
>
> **Severity legend**
> - **P0 — Launch blocker.** Security, tenant-data isolation, money/billing, or data
>   integrity. Must be done (or consciously risk-accepted in writing) before real customers.
> - **P1 — Strongly recommended.** Correctness/quality/observability gaps that won't
>   necessarily break day 1 but carry real risk; close before launch if at all possible.
> - **P2 — V2 / post-launch.** Explicitly descoped from V1. Listed so nothing is forgotten,
>   not expected before launch.
>
> Last updated: 2026-06-21.

---

## 0. P0 decision pass — 2026-06-21 (Caio + Claude)

> A "pente-fino" review went through every P0 launch blocker and ruled each one
> **fechar agora** (close now) vs **aceitar o risco por escrito** (accept the risk in
> writing). The 404 dashboard sweep is folded in at the bottom. Author = Claude (Opus 4.8);
> the two *accept-risk* verdicts (PL-3, PL-4) are **recommendations pending Caio's written
> ratification** — sign on the line below each. Verdicts:

| Item | Owner | Verdict | One-line rationale |
|------|-------|---------|--------------------|
| **PL-1** rotate leaked secrets | Caio (provider) | **FECHAR AGORA — não aceitável** | Live credential leak in a *public* repo; risk-acceptance is not an option, rotate at Better Stack + Sentry. |
| **PL-2** real prod secrets | Caio (ops) | **FECHAR AGORA — pré-requisito** | Not a risk, a prerequisite: webhooks/billing/push simply don't function with placeholders. |
| **PL-3** DB-level RLS (Supabase Pro) | Caio (infra) | **✅ RISCO ACEITO 2026-06-21** | Compensating control in place (`withTenant` + no-inline-tenant guard test). Caio assina Supabase Pro ao fechar o 1º/2º pagante. |
| **PL-4** dedicated E2E Supabase | Caio (infra) | **✅ RESOLVIDO 2026-06-21** | Projeto "leedi E2E" (`gxucpaepwvaghinwerml`) provisionado; MCP `supabase-e2e` no `.mcp.json`. |
| **PL-5** CSRF defense-in-depth | Claude | **✅ FECHADO NESTE PASSE (código)** | Conservative same-origin assertion added to dashboard middleware (all `/api` mutations) + admin impersonate route + unit test. Verify in staging. |
| **PL-15** messages-partition maintenance | Claude (via MCP) | **✅ RESOLVIDO 2026-06-21** | `pg_cron` job (`create-message-partitions`, dia 20 às 03:00 UTC) + função `create_future_message_partitions` deployados em prod; partições agora cobrem até 2026-10-31. Migration `0022` versionada. |

**PL-3 risk-acceptance — ✅ RATIFICADO por Caio 2026-06-21:** "Aceito operar com isolamento de
tenant apenas na camada de aplicação (`withTenant` + teste-guarda contra resolução inline de
tenant) por enquanto. Ao fechar o primeiro ou segundo cliente pagante, assino o Supabase Pro
(Dedicated Pooler), que habilitará a RLS no nível do banco (migração 0018, já aplicada e
dormente)." — Caio, 2026-06-21.

**PL-4 — ✅ RESOLVIDO 2026-06-21 (não mais accept-risk):** Caio provisionou um projeto Supabase
dedicado para E2E — **"leedi E2E"** (`gxucpaepwvaghinwerml`, região `sa-east-1`). MCP adicionado
ao `.mcp.json` como `supabase-e2e`. Testes futuros (E2E/integração, e o nightly do PL-9) rodam
contra esse banco, nunca contra produção. *Resta:* apontar `E2E_DATABASE_URL` para ele ao ligar
o gate do PL-9.

**Net:** of the 6 P0s, **1 closed in code now (PL-5)**, **3 are non-negotiable must-dos that
only Caio can close (PL-1, PL-2, PL-15-by-Aug-31)**, and **2 are legitimate accept-risk
(PL-3, PL-4)** pending Caio's signature. No P0 is blocked on more engineering except PL-15's
deploy (code/spec already exists, owned by Epic 16).

**404 dashboard sweep (closed this pass).** Two dead links found + fixed; a full cross-reference
of every `<Link>`/`router.push`/`redirect` target against the real `app/(shell)` routes confirms
these were the **only two** remaining (the sidebar already has a `nav-routes.test.ts` guard):
- `app/403/page.tsx` "Voltar" → `/dashboard` (no such route; home is `/`) → **fixed to `/`**.
- `components/active-campaign-widget.tsx` "Criar campanha" → `/campanhas/nova` (collided with the
  `/campanhas/[id]` route → `id="nova"` → invalid-uuid error, not a real page) → **fixed to
  `/campanhas`** (the list page carries the create dialog).

---

## A. P0 — Launch blockers

- [ ] **PL-1 · [Epic 1] Rotate leaked secrets in git history.** Better Stack / Sentry
  tokens were committed and the repo is public; the history purge (`460a15c`) does not
  un-leak already-exposed values. **Rotate** every token that ever touched the repo
  (Better Stack source token, Sentry DSNs/auth tokens) and confirm the old ones are
  revoked. Source: `project_epic1_code_review` memory + `epic-1-code-review-report.md`.
  *Exit:* old tokens revoked at the provider; new tokens only in host/CI secret store.

- [ ] **PL-2 · [Config] Replace all placeholder secrets with real production values.**
  `.env.example` ships placeholders for `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  `QSTASH_TOKEN`/`QSTASH_*_SIGNING_KEY`, `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`,
  `VAPID_*`, `ENCRYPTION_MASTER_KEY`, Supabase `DATABASE_URL`. Production must use real,
  rotated values (and `ASAAS_SANDBOX=false`). **Added 2026-06-20 (J-23/F-44):** the dashboard
  also requires **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`** set **= `VAPID_PUBLIC_KEY`** in the *build/runtime*
  env of `apps/dashboard` — it is inlined into the client bundle at compile time; if unset, push
  subscription registration silently no-ops (no error). Also confirm `API_PUBLIC_URL` is set (PL-14a).
  See the `project_meta_whatsapp_setup` memory
  for the Meta Developer App + QStash manual steps. *Exit:* prod env has every required
  `@leedi/config` var set to a real value; no placeholder strings.

- [ ] **PL-3 · [Epic 2 / Story 2.4] Activate DB-level RLS (tenant isolation safety net).**
  Today isolation is enforced **only at the application layer** (`withTenant`); the
  non-BYPASSRLS `leedi_app` role + hardened policies (migration `0018`) are applied but
  **dormant** because the Supabase **shared pooler rejects custom roles**. Requires
  **Supabase Pro (Dedicated Pooler)** or a direct connection. Caio accepted app-layer-only
  for now (2026-06-09) — but DB-level RLS is the real safety net and should be on before
  real multi-tenant data. *Exit:* `APP_DATABASE_URL` points at `leedi_app` via a working
  pooled connection → `packages/db/src/__tests__/rls.test.ts` cross-tenant test passes →
  validated in staging. (No code changes needed — capability is shipped.) See
  `deferred-work.md` → "MILESTONE — Supabase Pro".

- [ ] **PL-4 · [Infra] Dedicated E2E/staging Supabase project.** The Phase-2 E2E harness
  seeds + signs in against whatever `DATABASE_URL` points at. Before the first real
  customer, move E2E (and the nightly job, PL-9) to a **separate Supabase project** so test
  seeding/cleanup can never touch production data. The seed is already scoped to a fixed
  `[E2E]` namespace, but a separate project is the correct isolation. *Exit:* E2E points at
  a non-prod Supabase; prod credentials never used by tests.

- [x] **PL-5 · [Cross-cutting / Epic 2] CSRF defense-in-depth on state-changing routes.**
  ✅ **FECHADO EM CÓDIGO 2026-06-21.** Custom state-changing JSON routes (impersonate /
  switch-tenant / stop-impersonation, and every `/api/tenants/[tenantId]/…` proxy) are Route
  Handlers, **not** Server Actions, so Next's built-in Server-Action Origin check never covered
  them — they relied solely on `SameSite=Lax`. **Fix:** a pure, unit-tested helper
  `isForbiddenCrossOrigin` (`apps/dashboard/lib/csrf-origin.ts`, 8 tests) wired into the
  **dashboard middleware** — whose `matcher` already covers `/api/*` — gated on mutating methods
  (POST/PUT/PATCH/DELETE) over `/api/`, plus an inlined twin guard in the **admin** app's
  `api/admin/impersonate/route.ts` (the admin app has no middleware; start-impersonation lives
  there). The check is **deliberately conservative**: it rejects only on *positive* cross-origin
  evidence — `Sec-Fetch-Site: cross-site` (a browser-set, script-unforgeable header) or an
  `Origin` host ≠ request host — and allows when no signal is present, so legitimate same-origin
  calls never break and `SameSite=Lax` stays the primary control. Page-route Server Action POSTs
  are untouched (scoped to `/api/`). **Note:** the `Origin`-host-vs-`request.nextUrl.host`
  comparison is a *fallback* that fires **only when `Sec-Fetch-Site` is absent** (old clients);
  modern browsers short-circuit via `Sec-Fetch-Site`. The admin guard is **inlined** (no admin
  middleware), so a *future* admin `/api` mutating route won't be auto-covered — add a guard test
  or an admin middleware when the next one lands. *Exit (met in code; verify in staging):* a forged
  cross-origin POST to a mutating `/api/*` route is refused (403) while the dashboard's own
  same-origin mutations and the admin impersonation flow keep working **in the proxied prod
  topology** (confirm `nextUrl.host` vs public `Origin` doesn't false-positive the fallback path).

- [x] **PL-15 · [Epic 5 / Story 5.5 → Epic 16] Rolling `messages` partition maintenance.**
  ✅ **RESOLVIDO 2026-06-21 (deployado em prod via MCP + verificado).** Em vez da Edge Function
  originalmente planejada, optou-se por **`pg_cron` + função plpgsql** (roda 100% no Postgres, sem
  hop HTTP que pudesse falhar em silêncio). Migration `0022_messages_partition_maintenance.sql`
  (versionada): cria `public.create_future_message_partitions(months_ahead)` (idempotente, `CREATE
  TABLE IF NOT EXISTS`) + agenda o job `create-message-partitions` (`0 3 20 * *` — dia 20, 03:00 UTC,
  cria os 2 meses seguintes) + seed imediato. **Verificado:** partições agora vão de `messages_2026_06`
  até `messages_2026_10` (cobrem até 2026-10-31); `cron.job` ativo. Novas partições herdam RLS +
  trigger `updated_at` do parent automaticamente. *Original:* 
  Migration `0006` created partitions for `2026_06`/`2026_07`/`2026_08` **only**. An inbound
  message with `created_at >= 2026-09-01` has no partition → the insert throws and
  `processMessage(...).catch(captureException)` swallows it = **silent message loss** after
  Aug 31, 2026. The fix is the scheduled rolling-partition maintenance (Supabase Edge Function,
  monthly — see `project_partition_maintenance` memory, owned by Epic 16). Deploy and verify it
  before launch (and unconditionally before 2026-08-31). Source: `epic-5-code-review-report.md`
  Finding F4. *Exit:* a scheduled job creates next-month partitions ahead of time; verified by
  inserting a row dated next month in staging without error.

---

## B. P1 — Strongly recommended before launch

- [x] **PL-6 · [Code health] `pnpm typecheck` is RED on `main`.** ✅ **RESOLVIDO 2026-06-21.**
  Full-monorepo `pnpm typecheck --continue` is now **green (25/25 packages)**. Re-measured this pass:
  every later-epic error listed below was already stale/fixed; the **only** remaining failure was
  `packages/db/src/__tests__/rls.test.ts` (5× TS18048 — `.returning()` destructure possibly-undefined
  on `ws`/`ta`/`tb`/`ua`/`ub`), fixed with non-null assertions (guaranteed single-row inserts in test
  setup). Historical detail below.
  Later-epic code carried
  typecheck errors caught during the Epic 2 review (all registered to their owning epic, to
  be fixed in that epic's review):
  - ~~Epic 6 — `@leedi/dashboard` `product-detail-client.tsx` (`@/` alias unconfigured, TS2307;
    `ArgumentList.tsx` TS2345)~~ ✅ STALE — `@leedi/dashboard` `tsc --noEmit` is now **green (exit 0)**,
    verified 2026-06-21 during the P0 pass. The `@leedi/api` `knowledge-base.ts:26` (TS2379) line stays
    until an `@leedi/api` typecheck reconfirms.
  - ~~Epic 7 — `@leedi/agent` `tools/transferir-humano.ts:216` missing `@leedi/notification` (TS2307).~~ ✅ STALE — `@leedi/agent` typecheck green (2026-06-21).
  - ~~Epic 10 — `@leedi/api` `campaign-phase-transition.test.ts:86` (TS2532).~~ ✅ STALE — `@leedi/api` typecheck green (2026-06-21).
  - ~~Epic 12 — `@leedi/dashboard` `templates/new/page.tsx:29` (TS2375).~~ ✅ STALE — `@leedi/dashboard`
    typecheck green (exit 0), verified 2026-06-21.
  - ~~Epic 17 — `@leedi/api` `jobs/daily-billing-check.ts:24` (TS2344).~~ ✅ STALE — verified during the Epic 18 review (2026-06-11): full `@leedi/api` `tsc --noEmit` is clean, so this was already fixed (Epic 17 review per memory). No longer RED.
  - ~~Epic 18 — `@leedi/dashboard` `src/lib/push-registration.ts:24` (TS2322).~~ ✅ FIXED in Epic 18 review (2026-06-11): `urlBase64ToUint8Array` now returns `Uint8Array<ArrayBuffer>` (BufferSource-assignable); `@leedi/dashboard` typecheck green. Also fixed in the same review: the "health VAPID" runtime/test crash (push-provider `setVapidDetails` made lazy).
  *Exit:* `pnpm typecheck` green across the monorepo.

- [x] **PL-7 · [Code health] `pnpm lint` is RED on `main`.** ✅ **RESOLVIDO 2026-06-21.**
  `pnpm lint` is now **green (28/28 packages, zero errors and zero warnings)**. Resolution by class:
  - **Test-file trivia** (api/usage/knowledge/connection) — removed unused vars (`sql`,
    `capturedConditions`, `TENANT_ID`, `makeSelectChain`, dead `buildTenantTx` + call-count trackers,
    `MS_PER_DAY`), converted self-referential `let proxy` → `const`, replaced a test `any` → `unknown`.
  - **The two substantive (⚠️) — actually fixed, not suppressed:** `template-builder-client.tsx`
    `no-use-before-define` — hoisted the `prefillFromLibrary` `useCallback` above the effect that calls
    it and added it to the dep array (also clears the `exhaustive-deps` warning).
  - **Legitimate `process.env` exceptions → justified `eslint-disable`:** `push-registration.ts`
    (`NEXT_PUBLIC_*` must be read via `process.env` for Next's build-time client-bundle inlining —
    the J-23/F-44 mechanism; `@leedi/config` is Node-only) and the two `playwright.config.ts` files
    (test-runner configs reading CI/harness vars outside the validated schema).
  - **`react-hooks/set-state-in-effect`** (new stricter rule, 13 sites across 12 components) — all are
    canonical fetch-on-mount loaders (`useEffect(() => void load(), [load])` with `load` a stable
    `useCallback`) or one derive-effect; none has unstable deps so none is a real render cascade →
    justified per-line `eslint-disable` (refactoring runtime-verified components for a conservative
    rule would be high-risk churn). Affected unit tests re-run green. *Exit:* `pnpm lint` green. ✅

- [ ] **PL-8 · [Code health] CI test gate excludes `@leedi/db` and `@leedi/api`.** ⏳ **`@leedi/api`
  HALF RESOLVED 2026-06-21; `@leedi/db` half still blocked on PL-3.** `ci.yml` now runs
  `turbo run test --filter='!@leedi/db'` (only `@leedi/db` excluded). The `@leedi/api` cross-file
  test-state pollution was resolved over Epics 13–20; the full suite (**236 tests / 45 files**) is now
  stable run together — verified **3× green** in isolation and the whole gate **36/36 green** under
  `turbo … --concurrency=3`. (Note: an *unbounded* local `turbo run test` on Windows can flake with
  vitest "Failed to start forks worker" — a fork-spawn resource limit hitting `@leedi/ui`/`@leedi/api`
  alike — a local-environment artifact, NOT a CI/correctness issue; constrained concurrency is clean.)
  `@leedi/db` stays excluded: its 2 RLS suites need a non-BYPASSRLS `leedi_app` role + live DB (ties to
  **PL-3**, Caio). Source: `epic-1-test-ci-backlog.md`. *Exit:* both packages back in the CI test gate,
  green — **`@leedi/api` done**; `@leedi/db` re-include lands with PL-3.

- [ ] **PL-9 · [Epic 3 / Story 3.4] Wire the nightly E2E + axe CI gate.** The authed E2E
  suites + the axe sweep are **green locally** (dashboard auth 13/13, admin 3/3), but the
  **CI-enforced** axe/E2E gate is only scaffolded: `.github/workflows/e2e-nightly.yml` is
  **dispatch-only** (`schedule:` commented), gated on `E2E_DATABASE_URL`/`E2E_BETTER_AUTH_SECRET`.
  This is what 3.4 was originally blocked on (accepted as `done` with this documented caveat).
  Depends on PL-4 (dedicated E2E Supabase). *Exit:* add the secrets, uncomment `schedule:`,
  confirm the nightly runs green; CI runners are slower + `reuseExistingServer` is off, so the
  120s per-test timeout in both `playwright.config.ts` may need raising.

- [ ] **PL-10 · [Epic 2 / Story 2.8] Exercise impersonation write+audit in staging.**
  Audit-on-mutation is implemented + unit-tested (fail-closed), but never run on a deployed
  env. Log in as `super_admin` → impersonate a tenant → write through a `/api/tenants/*`
  route → confirm an `audit_logs` row (actor = real super-admin, target = tenant). **Known
  gap:** direct dashboard server actions (not the `/api/tenants/*` proxies — e.g. team
  `inviteAction`) are NOT covered by the API-layer audit. *Exit:* audit row verified in staging.
  **Added 2026-06-16 (F-30):** impersonation scoping fixed to platform-wide + browser-verified
  (start works cross-workspace, helper-based pages render) — but **33 dashboard content pages
  re-implement `listUserTenants(session.user.id)+header` inline**, so under impersonation they
  read the super-admin's empty memberships and render "Nenhum workspace encontrado". Full
  dashboard render under impersonation needs routing those pages through the shared
  `getCurrentTenantContext`/`requireTenantRouteAccess` helper (which is now impersonation-aware).
  Pre-existing (broader than the old `/settings/*`-only note), LOW. **RESOLVED 2026-06-17
  (`a58e0ef`..`5ad635f`):** all 31 inline pages + `settings/whatsapp/actions.ts` now route through
  the impersonation-aware `getCurrentTenantContext`; a guard test
  (`apps/dashboard/lib/__tests__/no-inline-tenant-resolution.test.ts`) prevents regression;
  browser-verified across all batches under impersonation (home/leads/agente/conhecimento/
  templates/disparos/configuracoes render, no 403, no "Nenhum workspace"). **PL-10 now reduces to
  the original item only:** exercise the impersonated write+audit flow on a deployed env (audit
  row: actor = real super-admin, target = tenant). Direct-server-action audit coverage remains a
  separate pre-existing gap.

- [x] **PL-11 · [Epic 4 / Story 4.4] Inbound webhook rate limiting.** ✅ **RESOLVIDO 2026-06-21.**
  Re-audit found the rate limit was **already wired** (landed after the checklist note): the Meta
  inbound webhook (`apps/api/src/routes/webhook-meta.ts:148-159`) calls `webhookLimit(phoneNumberId)`
  — a sliding-window **1000/min keyed by `phone_number_id` (≈ connection, not global)**, **fail-open**
  on any limiter/network error, returning **429** when exceeded. The check runs *after* HMAC signature
  verification and *before* the async processing is scheduled (the raw body can only be read once, so
  it can't be router-level middleware). The generous per-connection window tolerates Meta's legitimate
  retry bursts. **This pass added regression coverage** (`webhook-meta.test.ts`): a mutation-proof test
  forcing the limiter to reject asserts 429 + no QStash/Redis side-effects, and a second asserts the
  signed `phone_number_id` is the limiter key (api 228 tests green). *Exit (met):* rate limit on the
  inbound webhook endpoint. ✅

- [x] **PL-12 · [Epic 7 / Story 7.4] Tag-dedup race / missing unique constraint.** ✅ **FIXED IN
  CODE 2026-06-21 (apply + verify in staging).** Added a DB-level `UNIQUE (tenant_id, lead_id, tag)`
  on `lead_tags` and switched both insert paths to `ON CONFLICT DO NOTHING`, closing the intra-turn
  race. Changes: (a) schema — `unique('lead_tags_tenant_lead_tag_unique')` in `packages/db/src/schema/
  lead.ts`; (b) migration `0023_lead_tags_unique.sql` (hand-written SQL, same convention as 0017–0022)
  that **dedups existing rows first** (keeps the earliest per group via `ROW_NUMBER()`) so the
  `ADD CONSTRAINT` can't fail on pre-existing duplicates; (c) `packages/agent/.../adicionar-tag.ts` —
  dropped the query-then-insert, now a single `onConflictDoNothing` insert (removed the residual race);
  (d) `packages/lead/.../add-lead-tag.ts` — the manual path had **no** dedup (a duplicate would now hit
  the constraint → 23505), so made it idempotent: `onConflictDoNothing` + fetch-existing fallback (no
  500, returns the pre-existing row). Tests updated to ON-CONFLICT semantics + mutation-proofs (lead
  6/6, agent adicionar-tag 3/3; db/lead/agent typecheck+lint exit 0). **NOT applied to any DB** —
  prod/staging write is the operator's call. *Exit (met in code):* unique constraint defined + migration
  written; **residual:** apply `0023` and verify under the `leedi_app` role in staging (a concurrent
  double-tag yields one row).

> **⚠️ DEPLOY-ORDERING GATE — migrations `0023` (PL-12) + `0024` (PL-17), 2026-06-21.** These two code
> changes **throw at runtime against a DB without the migration applied first** — NOT optional "verify
> later" polish: **PL-12** → `ON CONFLICT (tenant_id,lead_id,tag)` raises `42P10` on *every* tag insert
> until the UNIQUE constraint exists (breaks agent + manual tagging); **PL-17** → the `SET
> status='enviando'` claim raises `22P02` (invalid enum) on *every* dispatch batch and propagates (NOT
> inside the try/catch) → 500 → QStash retries forever → **all dispatch sends dead** until `0024` is
> applied. **The deploy pipeline will NOT apply them automatically:** `migrate:run` (`src/migrate.ts`)
> uses drizzle's **journal-based** migrator, but `migrations/meta/_journal.json` stops at idx 16 —
> `0017`–`0024` are absent from the journal (the known desync), so they were/are applied **manually via
> Supabase MCP `apply_migration`** (the path `0017`–`0022` took). **Action:** apply `0023` then `0024`
> via MCP `apply_migration` (`0024`'s `ALTER TYPE ADD VALUE` is add-only/standalone, so a single
> `apply_migration` is safe) **before or atomically with shipping `redesign/v2-gemini`**, or fold the two
> SQL files into the journal so `migrate:run` covers them. Until applied, the new tagging + dispatch code
> must not be live in prod.

- [ ] **PL-13 · [Epics 4,6,10] Behavioral RLS / integration tests deferred to a real env.**
  Several isolation/integration tests were skipped because MCP `execute_sql` runs privileged
  (bypasses RLS) and Redis/BullMQ weren't running locally: 10.1 (cross-tenant `campaigns` read
  returns zero rows), 6.1 (knowledge RLS — needs 0007/0008 applied), 4.3 (BullMQ health
  integration), 4.4 (6s debounce flush — needs Redis). Run these on staging once PL-3/PL-4 land.
  *Exit:* cross-tenant reads verified empty under the `leedi_app` role; integration paths exercised.

> **PL-14 split (2026-06-17).** The original PL-14 (`BETTER_AUTH_URL.replace(':3000', …)` breaks
> in prod) spans ~64 sites across two *different* concerns; conflating them under one checkbox
> hid that half remains. Split into **PL-14a** (external callbacks — fixed) and **PL-14b**
> (dashboard→API server-to-server — open, needs its OWN var). The discriminating audit was a
> repo-wide `publishJSON` grep: the external-callback set is closed at {12 api + 2 agent}.

- [x] **PL-14a · [Epic 4 → cross-cutting] External-callback URL derivation (Meta/QStash).**
  ✅ **FIXED IN CODE 2026-06-17** (Tier-1 enablement). The 14 sites that build a URL an EXTERNAL
  service calls back into (QStash job callbacks + the Hotmart webhook URL shown to the tenant)
  derived it via `env.BETTER_AUTH_URL.replace(':3000', \`:${env.API_PORT}\`)` — a no-op in a prod
  `BETTER_AUTH_URL` with no `:3000` port → wrong host → silently broken QStash callbacks (inbound
  flush, dispatch, campaign transitions, billing/followup, gateway recovery, agent-tool followup +
  reengagement). **Set, verified closed via `publishJSON` grep:** 12 in apps/api (`webhook-meta`,
  `onboarding`, `webhooks/{hotmart,asaas}`, jobs `{campaign-phase-transition,send-followup,
  run-dispatch-job,process-dispatch-batch}`, use-cases `dispatch/{create,resume}-dispatch-job` +
  `gateway/{create-gateway-integration,handle-recovery-event}`) + 2 in packages/agent
  (`tools/{agendar-followup,solicitar-reengajamento}`). **Fix:** new optional `API_PUBLIC_URL` env
  var (`packages/config/src/schema.ts`) + a pure, unit-tested resolver `resolveApiPublicUrl` and a
  singleton `apiPublicUrl()`. Set → wins (trailing slash stripped); unset → legacy derivation
  (back-compat, local single-host). **Deliberate duplication:** the resolver is a self-contained
  copy per package (`apps/api/src/utils/api-public-url.ts` + `packages/agent/src/tools/api-url.ts`)
  reading ONLY `env`, because a shared `@leedi/config` export would break the ~15 suites that
  `vi.mock('@leedi/config', () => ({ env }))` — kept byte-identical, drift-guarded by a test in
  each package. api 226/226 + agent 124/124 + config 5/5 green, typecheck clean. *Exit (met in
  code; verify in staging):* set `API_PUBLIC_URL` to the real API public origin and confirm every
  callback resolves there.

- [x] **PL-14b · [cross-cutting] Dashboard→API BFF proxy URL derivation (server-to-server).**
  ✅ **FIXED IN CODE 2026-06-21 (set var + verify in a multi-origin deploy).** The discriminating audit
  (`grep "replace(':3000'"`) found **58 sites** — all the `apps/dashboard/app/api/.../route.ts` BFF
  proxies plus `configuracoes/gateway/page.tsx`, `app/api/ai/improve-text`, `app/api/sales-methods` —
  using the **identical** `env.BETTER_AUTH_URL.replace(':3000', \`:${env.API_PORT}\`)` hack (no-op in a
  prod `BETTER_AUTH_URL` with no `:3000`). **Fix (mirrors PL-14a exactly):** new optional
  `INTERNAL_API_URL` env var (`packages/config/src/schema.ts`) + a pure, unit-tested resolver
  `resolveInternalApiUrl` and a singleton `internalApiUrl()` in `apps/dashboard/lib/internal-api-url.ts`
  (set → wins, trailing slash stripped; unset → legacy derivation, back-compat). Distinct from
  `API_PUBLIC_URL` on purpose: the dashboard→API call is server-to-server to a plausibly *internal*
  origin, so routing it through the public tunnel would hairpin. A codemod replaced all 58 inline
  expressions with `internalApiUrl()` and removed the now-unused `@leedi/config` import from 57 files
  (1 keeps it for other env use). Drift-guard test asserts the legacy fallback stays byte-identical to
  the original inline expression. `.env.example` documents the var. **Verified:** dashboard typecheck
  + lint exit 0, dashboard 94/94 tests, full monorepo typecheck+lint exit 0, resolver 5/5. *Exit (met
  in code):* set `INTERNAL_API_URL` to the API's internal origin and confirm the proxies reach it in a
  multi-origin deploy.

- [x] **PL-16 · [Epic 8 / Stories 8.1 & 8.2] End-to-end playground smoke test.** ✅ **VERIFIED END-TO-END
  2026 at J-06 (roteiro F-16).** A live local run (real `agent_config` + Anthropic call + Upstash Redis
  session, NOT mocked) exercised all 3 scenarios: multi-tool agent turns fired (`buscar_historico_lead`
  + `consultar_base_conhecimento`), row counts across leads/lead_journey_events/conversation_windows/
  usage_counters/agent_threads/agent_messages/agent_tool_calls/messages stayed **identical to baseline**
  (zero sandbox rows), `lead_com_objecao` engaged the price objection (AC#2), and "Reiniciar conversa"
  cleared the session. **Residual (optional):** re-confirm on a deployed staging env per the original
  exit wording — substance is met locally. The review fixed
  a HIGH bug where the playground 500'd on every message (`leadId: 'playground-lead'` → uuid
  `22P02`) and a sandbox side-effect (`consultar_base_conhecimento` writing `lead_journey_events`).
  The uuid fix is proven at the DB level and the side-effect is locked by a unit test, BUT the
  feature's tests mock `@leedi/db`, so no full live run (real `agent_config` + Anthropic call +
  Upstash Redis session) was executed. *Exit:* in staging, send a message in each of the 3
  scenarios (novo_lead / lead_recorrente / lead_com_objecao), confirm WhatsApp-style bubbles +
  tool-call panels render, "Reiniciar conversa" resets, and **no** `leads`/`agent_*`/
  `lead_journey_events`/`conversation_windows`/`usage_counters` rows are created for the session.
  Specifically verify the two scenarios whose synthetic history ends on a `user` turn
  (lead_recorrente, lead_com_objecao) return a 200 on the first message — the API merges consecutive
  same-role turns per claude-api guidance, but confirm against the live model — and that
  lead_com_objecao's first agent turn engages the "preço" objection (AC#2).

- [x] **PL-17 · [Epic 13 / Story 13.2] Residual at-least-once duplicate-send window in the dispatch
  batch worker.** ✅ **FIXED IN CODE 2026-06-21 (apply migration + force a mid-batch redelivery in
  staging).** Added the `enviando` claim state and an atomic compare-and-set claim before each send:
  - migration `0024_dispatch_target_status_enviando.sql` — sole-statement
    `ALTER TYPE dispatch_target_status ADD VALUE IF NOT EXISTS 'enviando' BEFORE 'enviado'` (add-only,
    not used in the same file, so the PG `ADD VALUE` in-tx footgun is moot; the worker that *uses* it
    ships separately); enum value also added to `packages/db/src/schema/dispatch.ts`.
  - `process-dispatch-batch.ts` — before `sendTemplate`, an atomic
    `UPDATE … SET status='enviando' WHERE id=? AND status='pendente' RETURNING id`; if 0 rows claimed
    (a redelivery/concurrent worker already took it) the target is **skipped**. Only a successful send
    flips it to `enviado`. The claim runs **after** the per-iteration pause/quality check, so a graceful
    pause leaves the in-flight row `pendente` (resume stays correct with no reset).
  - **Deliberate non-reset:** a row stuck `enviando` (claimed, then crash before/around the send) is
    **not** auto-retried — it has no `wamid` to reconcile and re-sending would re-introduce the duplicate
    (per the exit: "a redelivered batch never re-sends an already-claimed target"). The old over-send
    window becomes a strictly-better rare under-send. The detail UI's `targetCounts` is a dynamic map, so
    `enviando` renders fine; no UI change needed.
  - Tests: process-dispatch-batch 6/6 incl. a **mutation proof** (claim returns 0 rows → `sendTemplate`
    not called, `sent===0`); dispatch trio (process-batch + run-job + resume-job) 13/13 run together to
    catch `@leedi/api` cross-mock pollution; monorepo typecheck+lint exit 0. **NOT applied to any DB.**
    *Exit (met in code):* a target is claimed (`pendente → enviando`) before the send and only a
    successful send flips it to `enviado`; **residual:** apply `0024` and force a mid-batch redelivery in
    staging to confirm no re-send. **Original:**
  `process-dispatch-batch` selects `pendente` targets, sends each template, then
  marks `enviado` in a *separate* transaction. The Epic 13 review reduced the duplication surface
  (added a `deduplicationId` on the chained QStash publish, an atomic compare-and-set claim in
  `run-dispatch-job`, and per-iteration pause/quality re-checks), but a narrow window remains: if the
  process dies (or the status update fails) *after* a successful `sendTemplate` but *before* the row
  flips to `enviado`, a QStash redelivery re-selects that still-`pendente` row and **re-sends the
  template** — a real WhatsApp message cost + quality-rating risk. Fully closing it needs an atomic
  *claim* state, but `dispatch_target_status` has no `enviando` value, so the fix requires a pgEnum
  migration (`ALTER TYPE ... ADD VALUE`, which can't run in a transaction) plus worker + counts/UI
  handling of the new state. **Best bundled with the messages-partition / enum maintenance work**
  (see [[project_partition_maintenance]]). *Exit:* a target can be claimed (`pendente → enviando`)
  before the send and only a successful send flips it to `enviado`; a redelivered batch never
  re-sends an already-claimed target (verified in staging by forcing a mid-batch redelivery).

- [ ] **PL-18 · [Epic 14 / Stories 14.1–14.3] Inbox SQL + UI not runtime-verified.** The Epic 14
  review (2026-06-11) applied 14 patches but two surfaces shipped **typecheck-clean only, never
  exercised at runtime**: (a) the **inbox list-route SQL** in `apps/api/src/routes/inbox/index.ts`
  has **no test/integration harness** — the keyset cursor, the `status` filter `statusCondition`
  (`bot` → `= 'bot' OR IS NULL`; default view → `IS DISTINCT FROM 'resolvido'`), the LEFT-JOIN
  `COALESCE` status, and the correlated last-message subquery are correct by inspection but **not
  DB-validated** (the story already carried "inbox list query untested — manual verification
  required"); (b) the **8s poll-merge** in `conversas-client.tsx` and `conversa-detail-client.tsx`
  (merge-by-id preserving loaded pages/history + in-flight optimistic message) has **no component
  test** and was **not verified in a browser** (repo's standing "UI not verified in browser"
  pattern). Source: `project_epic14_code_review` memory + Epic 14 Review Findings. *Exit:* in
  staging, exercise the inbox list with each filter combination (status incl. `bot`/default-hides-
  `resolvido`, temperatura, cursor pagination across a tie on `created_at`) and confirm rows match
  expectation under the `leedi_app` role; and drive the inbox + detail in a browser confirming the
  8s poll does not wipe "Carregar mais"/older-history or drop an in-flight reply.

- [x] **PL-19 · [Cross-cutting / Epics 2,3,19] Hardcoded `http://localhost:3000` login origin
  broke the redirect-to-login flow in production.** ✅ **FIXED 2026-06-11 (commit pending).** The
  web-app login page lives on a separate origin (port 3000), and that origin was a **hardcoded
  literal** in `apps/dashboard/middleware.ts` (`LOGIN_ORIGIN`) and
  `apps/dashboard/app/onboarding/layout.tsx`. In production an unauthenticated user who hit any
  protected dashboard route was redirected by the Edge middleware to `http://localhost:3000/login`
  — a dead address → **login unreachable**. **Fix:** both sites now derive the origin from
  `BETTER_AUTH_URL` (the canonical web/auth origin) — middleware reads `process.env.BETTER_AUTH_URL`
  (Edge runtime forbids importing the Node-only `@leedi/config`, per `@leedi/auth/edge`); the
  onboarding Server Component uses the validated `env.BETTER_AUTH_URL` via `new URL('/login', …)`.
  **No new env var** — reuses `BETTER_AUTH_URL`. **Empirically verified** against the built bundle
  (`.next/server/middleware.js`): Next keeps this as a **runtime** `process.env.BETTER_AUTH_URL`
  read (NOT a build-time inline), so the only remaining dependency is that `BETTER_AUTH_URL` is set
  to the real web origin in the **runtime** environment — already required by **PL-2**. Distinct
  from PL-14 (internal `:3000`→`API_PORT` substitution). *Exit (met in code; verify in staging):* an
  unauthenticated request to a protected route redirects to `${BETTER_AUTH_URL}/login`; no
  `localhost:3000` literal remains in dashboard source (only the local-dev fallback).

> **PL-20 update (2026-06-21).** ✅ **PRIMARY RESOLVED IN CODE (verify in staging); secondary
> event-map audit still open.** Re-audit corrected the root-cause framing: `create-gateway-
> integration.ts` (the `randomUUID()` webhookSecret cited below) is **dead code — no callers**. The
> live path is `upsertGatewayHottok` (`PUT /api/tenants/:id/onboarding/hottok`, owner-only), which
> stores the client's real HOTTOK as `webhook_secret` (creates the row on first save, else updates),
> and the webhook validates `hottok === webhook_secret` with the F-40 header fix. The **Configurações
> → Integrações** screen (`configuracoes/gateway` → `HottokForm`) already captured/rotated the HOTTOK.
> The **only genuine gap** was the **onboarding step 3** — it showed the webhook URL + polled for
> confirmation but had **no HOTTOK input**, and `gateway-webhook-url` returns `null` until a row
> exists (chicken-and-egg). **Fixed:** `apps/dashboard/app/onboarding/_components/step-3.tsx` now has a
> HOTTOK input that `PUT`s to `/gateway/hottok` (same path as Configurações), surfaces the returned
> webhook URL on save, and loads existing-HOTTOK status on mount; the dead-end "configure nas
> configurações" copy was replaced. Tests: step-3 5/5 (incl. a new save→URL-surfaced mutation proof);
> monorepo typecheck+lint exit 0. *Residual (secondary, lower priority — needs real Hotmart events):*
> reconcile the long `EVENT_MAP` tail (`PURCHASE_DELAYED/EXPIRED`, `SUBSCRIPTION_*`, `PURCHASE_REFUSED`).

- [x] **PL-20 · [Epic 11 / Story 19.3 — Hotmart gateway] No UI to capture the client's Hotmart
  HOTTOK; the webhook can't authenticate real client deliveries.** ✅ **PRIMARY FIXED IN CODE
  2026-06-21 (see the update box above).** Surfaced at **J-22** (2026-06-18)
  against 16 real Hotmart 2.0 deliveries. The webhook validates `hottok === gateway_integrations.
  webhookSecret`, but `apps/api/src/use-cases/gateway/create-gateway-integration.ts:22` sets
  `webhookSecret = randomUUID()` — a value Leedi invents, while Hotmart sends the **account's own
  fixed HOTTOK** in the `X-HOTMART-HOTTOK` header. The onboarding gateway step (`/onboarding`
  step 3) shows the generated webhook **URL** but has **no input** for the client to paste their
  HOTTOK. So even with the F-40 header fix live, every real client's deliveries 401 → **Hotmart
  gateway non-functional in prod for any real tenant** (the F-40 fix is necessary but not
  sufficient). Local J-22 was unblocked by manually setting `webhookSecret` = the account HOTTOK
  in the DB. **Where the field must live:** both the **onboarding gateway step** (`/onboarding`
  step 3) AND a persistent **Configurações → Integrações (Hotmart)** screen in the client area, so
  an existing client can add/rotate their HOTTOK after onboarding (today there is no settings
  surface for gateway credentials at all). Store the entered HOTTOK as `gateway_integrations.
  webhook_secret`.
  **Companion finding (F-43) — PIX recovery: RESOLVED in code (was structurally dead).** Hotmart
  support + a real PIX checkout confirmed there is **no dedicated PIX event** — Hotmart reuses
  **`PURCHASE_BILLET_PRINTED` with `purchase.payment.type='PIX'`** (real delivery status was
  `BILLET_PRINTED`, not `WAITING_PAYMENT`). The normalizer now reclassifies it to `pix_gerado`
  (content-based); **live-proven** (PIX generated → `pix_gerado`; PIX paid → `compra_aprovada`).
  F-42 real-phone also **live-proven** (`+5535999731201`/`+5535991923321`). **Remaining audit
  (lower priority):** the long event tail is still unverified — `PURCHASE_DELAYED`/`PURCHASE_EXPIRED`
  (no canonical) and `SUBSCRIPTION_STARTED`/`SUBSCRIPTION_OVERDUE`/`PURCHASE_REFUSED` (guessed
  names). Source: roteiro F-41/F-43, J-22. *Exit:* **(primary)** add the HOTTOK field (onboarding +
  Configurações), store as `webhook_secret`, so real clients authenticate; **(secondary)** reconcile
  the remaining `EVENT_MAP` tail against the authoritative Hotmart event list.

---

## C. P2 — V2 / post-launch (descoped from V1 — listed for memory)

- [ ] **[Epic 6 / 7.5] Vector / semantic search (pgvector).** `knowledge_base.embedding`
  stays nullable/deferred; V1 is keyword/exact match only. V2.
- [ ] **[Epic 7.7] Deepgram adapter + admin provider config.** Stub throws-loudly; provider
  switching is env-var only (platform-level). V2.
- [ ] **[Epic 19.2] Company logo file upload.** V1 accepts `logo_url` string only; upload → V1.5.
- [ ] **[Epic 20.3] Live FX rate + CRM CTA.** USD→BRL is a fixed env var (`USD_TO_BRL_RATE`,
  manual updates); "Entrar em contato" copies email to clipboard (no CRM integration). V2.
- [ ] **[Epic 20.3] "Days at risk" precision.** Approximate in V1; precise value deferred.
- [ ] **[Epic 2.6] Invite polish + auto-session on accept.** Reenviar/Cancelar pending-invite
  actions (Task 5 polish); accept→dashboard auto-session (currently → `/login`, correct under
  email verification) lands with Epic 19 onboarding/session work.
- [ ] **[Epic 2.8] Impersonation hardening (optional).** No server-side early revocation before
  the 1h expiry (cookie overlay, no DB session to kill); `getWorkspaceAdmin` `.limit(1)` is
  not workspace-scoped (single-workspace MVP); no shared `requireWorkspaceAdmin` route-guard
  wrapper / dashboard→admin redirect. Low risk, documented.
- [ ] **[Epic 2.5] `/settings/*` floor guard.** Optional `(shell)/settings/layout.tsx` calling
  `requireTenantRouteAccess('/settings')` so a future settings page can't ship silently
  unprotected. Defense-in-depth.
- [ ] **[Epic 10.2] `lead_journey_events` for phase transitions.** Deferred — schema requires
  `lead_id NOT NULL`; phase transitions have no lead. Revisit with a nullable/redesign.

---

## D. Per-epic index

> Quick map from epic → its open items. P0/P1/P2 IDs point at the sections above.

- **Epic 1 — Foundation:** PL-1 (rotate secrets, P0). Lint/test-gate mechanism is correct;
  the RED state is later-epic debt → PL-6/PL-7/PL-8.
- **Epic 2 — Identity & Access:** PL-3 (RLS activation, P0), PL-5 (CSRF, P0 — ✅ fixed 2026-06-21), PL-10
  (impersonation audit staging, P1); P2: 2.6 invite polish, 2.8 hardening, 2.5 floor guard.
  *Code-complete per the 2026-06-08 review; remaining = deployed-env validation + the cross-cutting CSRF.*
- **Epic 3 — Design System & UI Shell:** PL-9 (nightly E2E/axe CI gate, P1). All 4 stories
  `done`; 3.4 done **with documented caveat** (local-green axe accepted; CI enforcement = PL-9).
- **Epic 4 — WhatsApp Connection:** PL-11 (webhook rate limiting, P1), PL-13 (4.3/4.4
  integration tests, P1), PL-14a (✅ fixed) + PL-14b (dashboard→API internal URL derivation, P1, open).
  4.5 multi-message dispatcher was deferred → **wired in Epic 7** (closed). **Formally code-reviewed
  2026-06-10** (`epic-4-code-review-report.md`): all 5 stories `done`; HIGH enum-mapping bug (Meta
  `GREEN`/`TIER_1K` → pt-BR pgEnums, `22P02`) fixed + 3 minor patches; Finding 5 deferred → PL-14
  (later split into PL-14a/14b on 2026-06-17).
- **Epic 5 — Lead Management:** PL-15 (messages-partition maintenance, P0 — ✅ resolved 2026-06-21 via `pg_cron`, migration `0022`). **Reviewed 2026-06-10**
  (stories 5.1–5.5 + epic-5 `done`): fixed `conversationCount` (5.2) + webhook stale-mocks (5.5); the
  partition-window finding (F4) → PL-15.
- **Epic 6 — Knowledge Base:** PL-6 (typecheck), PL-13 (6.1 RLS tests); P2: pgvector. **Reviewed
  2026-06-10** (stories 6.1–6.4 + epic-6 `done`): HIGH build bug (`@/` alias → `ArgumentList`) + a
  vacuous `toThrow(undefined)` test + 4 `tsc` errors fixed (resolved the pending-typecheck-epic6 item).
- **Epic 7 — Sales Agent:** PL-6 (typecheck: `@leedi/notification`), PL-12 (tag-dedup race);
  P2: 7.7 Deepgram/provider config. **Reviewed 2026-06-10** (stories 7.1–7.8 + epic-7 `done`): HIGH
  missing `@leedi/notification` dep in `@leedi/agent` (+jsx tsconfig); MEDIUM stale `MODEL_PRICING`
  (haiku/opus 4.x) corrected; agent 119/119 + agent-memory 13/13 green.
- **Epic 8 — Playground:** PL-16 (e2e playground smoke test, P1). Reviewed 2026-06-10; stories
  8.1 & 8.2 `done`. Two HIGH bugs fixed (uuid `22P02` on every message; sandbox `lead_journey_events`
  write) + AC#1a campaign selector added. Live end-to-end run deferred → PL-16.
- **Epic 9 — Doc Corrections:** documentation-only epic; no runtime pre-launch items expected.
- **Epic 10 — Campaigns:** PL-13 (10.1 behavioral RLS test); P2: 10.2 journey events (§C). Reviewed
  2026-06-10; stories 10.1–10.3 + epic-10 `done`. Fixed: HIGH — `activateCampaign` reactivated
  terminal `encerrada` campaigns (10.2 AC#7 violation; claimed test was absent → added); MEDIUM —
  transition endpoint returned 500 instead of 400 (case-sensitive `.includes('transição')` vs
  `"Transição…"` message → switched to `instanceof` mapping); LOW — pre-existing tsc error in the
  10.2 job test. Epic 10 files now type-clean; repo-wide PL-6 still RED from Epic 17 debt.
- **Epic 11 — Hotmart Gateway:** PL-7 (lint), PL-20 (HOTTOK capture UI — also Story 19.3). **Reviewed
  2026-06-10** (stories 11.1–11.3 + epic-11 `done`): MEDIUM latent — `handle-recovery-event` did the
  dispatch-rule lookup + QStash publish INSIDE the tx → a DB error silently rolled back journey+processed
  (moved past commit); +idempotent notif. gateway 19/19 + api 15/15. **Real-delivery hardening landed
  later at J-22** (F-40 hottok-in-header, F-42 phone, F-43 PIX/event-map; F-41 → PL-20).
- **Epic 12 — Meta Templates:** PL-6 (typecheck), PL-7 (⚠ `no-use-before-define`). **Reviewed
  2026-06-10** (stories 12.1/12.2 + epic-12 `done`): 3 HIGH — `/library` route shadowed by `/:id`
  (Hono registration order); `DELETE` always 204 (return inside `withTenant`); `?status=` enum →
  `22P02`/500 — + AC#2 approval notif + AC#7 `[id]` edit page (fixed a dead link); RLS `WITH CHECK`
  absence noted as systemic → deferred.
- **Epic 13 — Smart Dispatch:** PL-17 (residual duplicate-send window, P1, needs enum migration);
  lint debt (→ PL-7). Reviewed 2026-06-11; stories 13.1–13.5 `done` (13.2 done **with documented
  caveat** = PL-17). 5 HIGH + multiple MEDIUM/LOW patches applied (dup-send guards, `bloqueado`
  exclusion, throttle enforcement for all tiers, quality-update unknown-signal + restoration notif,
  recovery dedup status-filter, FK/limit/offset guards, exact-text fixes); 13.4 `agendar_followup`
  contract realigned to `agendado_para`; 13.5 manual `/resume` endpoint + dashboard badge/button shipped.
- **Epic 14 — Human Inbox:** PL-18 (inbox SQL + poll-merge UI not runtime-verified, P1); lint debt
  (→ PL-7). Reviewed 2026-06-11; stories 14.1–14.3 + epic-14 `done`. 14 patches + 2 decisions:
  HIGH takeover-steal guard + poll wiped pagination/history; AC#8 24h-detection was **dead vs the
  real adapter** (`meta-cloud-provider.ts` discarded the Meta error code → enriched it); AC#7 kept
  the real Epic-18 notification (dep on Epic 18, still `review`); `22P02`→500 hardening
  (enum/cursor/limit). 2 defers (UNIQUE `inbox_assignments`, reply cross-tx) in `deferred-work.md`.
- **Epic 15 — Analytics:** PL-7 (lint). **Reviewed 2026-06-11** (stories 15.1–15.3 `done`): 7 patches
  (date-range guard + off-by-one, numeric-cast `22P02`, `to_char` UTC, objection events-vs-labels,
  `daysRemaining` NaN, +2 vacuous→real tests); defers (tenant RLS systemic, partition perf, BFF `:3000`,
  polling).
- **Epic 16 — Usage Metering:** PL-7 (lint). **Reviewed 2026-06-11** (stories 16.1–16.3 + epic-16
  `done`): 1 HIGH — the block killed open conversations → new read-only `hasOpenConversationWindow` —
  + 3 MEDIUM (overage toggle didn't disable; 2 dead `/settings`→`/configuracoes` links; notification
  dedup race gated on `RETURNING`). Deviation noted: `tenants.plan` vs `subscriptions.plano` (Epic 17).
- **Epic 17 — Billing (Asaas):** PL-2 (real Asaas keys + `ASAAS_SANDBOX=false`), PL-7 (lint).
  **Reviewed 2026-06-11** (money path; stories 17.1–17.3 + epic-17 `done`, commit `41b244f`): 2
  CRITICAL — webhook read `body.accessToken` vs the `asaas-access-token` header (401 on everything);
  `PAYMENT_CREATED` unhandled → invoices never created (all no-op) — + 2 HIGH (`cpfCnpj` required by
  Asaas never sent → 400 in prod, now collected in the admin form; Redis dedup before enqueue +
  swallowed failure → lost payment). UNIQUE index `invoices.asaas_payment_id` (migration `0019`)
  smoke-validated; `daily-billing-check` typecheck fixed (closed PL-6's Epic-17 line). **F-39 (daily
  lockdown never blocked — `.rows` misread on the postgres-js array) found + fixed live at J-21.**
- **Epic 18 — Notifications:** PL-2 (real VAPID keys **+ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`**, see the PL-2
  note), PL-7 (⚠ `no-process-env` exception). **Reviewed 2026-06-11** (stories 18.1/18.2 + epic-18
  `done`, commit `a45e51c`): 3 patches — VAPID `setVapidDetails` at module-load crashed import/boot +
  health suite (made lazy); `push-registration` `Uint8Array`→`BufferSource` TS2322; `quality_caindo`
  toggle was dead (handler emitted `quality_vermelho`, violating AC#2/#3). Closed PL-6/PL-9 sub-items
  (health VAPID + push-registration typecheck). **Push wiring later proven end-to-end at J-23 (F-44):
  the root-`.env` inlining fix for `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.**
- **Epic 19 — Onboarding Wizard:** ~~PL-19 (hardcoded `localhost:3000` login origin)~~ ✅ **FIXED
  2026-06-11** (derive from `BETTER_AUTH_URL`; runtime-verified). PL-14a (✅ **fixed** — the
  `gateway-webhook-url` endpoint, which showed the user a webhook URL via the same `:3000`→`API_PORT`
  replace, now derives via `API_PUBLIC_URL`); P2: 19.2 logo upload (V1.5), 19.4 PostHog tracking deferred. **Reviewed 2026-06-11** (Opus 4.8,
  commit `197ce4f`); stories 19.1–19.4 + epic-19 `done`. **No production-code defects** — all
  cross-epic contracts verified (`/whatsapp/connect`, `/playground/message`, `/agent-config`,
  `/sales-methods`); tenant default `trial` → AC#1 redirect works. Findings were **test-only**:
  HIGH 2 vacuous hotmart-gateway tests (`toBeGreaterThanOrEqual(0)` always-true + `sql` mock
  discarded args → filters never matched) and MEDIUM the `complete` test asserted only
  `success:true` — both fixed + mutation-proven. `audit_logs` `db.insert` confirmed = convention.
- **Epic 20 — Super-Admin Dashboard:** P2: 20.3 live FX, CRM CTA, days-at-risk precision. **Reviewed
  2026-06-12** (stories 20.1–20.3 + epic-20 `done`, commit `b3914ae`): **first epic with zero
  production-code defects** (dev applied advisor catches in the build); 2 test patches (sql-mock
  discarding the query — same fake-green class as Epic 19 — in `list-all-tenants-detailed` +
  `list-tenant-invoices`, hardened to the SQL contract) + 4 mutation proofs. billing 34/34,
  tenancy 33/33, config 5/5, admin 18/18.

---

## E. How to keep this current

1. When an epic gets its formal `bmad-code-review`, fold every new deferred AC into Section A/B/C
   with a `PL-N` id and add it to that epic's line in Section D.
2. When a `PL-N` item is resolved, check its box and note the resolving commit/date — do not delete
   it (the audit trail matters for a launch gate).
3. `deferred-work.md` stays the detailed tracker; this file stays the curated launch checklist.
   If they disagree, reconcile (this file is the decision record for *launch readiness*).
