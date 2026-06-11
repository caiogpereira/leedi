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
> **Living document.** Only **Epics 1, 2, 3, 4** have had a formal code review so far
> (others are `review` status). Items for Epics 5–20 below come from each story's own
> "deferred" notes; the list for those epics will **grow as each epic gets its formal
> review**. Re-run the review per epic and fold new findings in here.
>
> **Severity legend**
> - **P0 — Launch blocker.** Security, tenant-data isolation, money/billing, or data
>   integrity. Must be done (or consciously risk-accepted in writing) before real customers.
> - **P1 — Strongly recommended.** Correctness/quality/observability gaps that won't
>   necessarily break day 1 but carry real risk; close before launch if at all possible.
> - **P2 — V2 / post-launch.** Explicitly descoped from V1. Listed so nothing is forgotten,
>   not expected before launch.
>
> Last updated: 2026-06-10.

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
  rotated values (and `ASAAS_SANDBOX=false`). See the `project_meta_whatsapp_setup` memory
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

- [ ] **PL-5 · [Cross-cutting / Epic 2] CSRF defense-in-depth on state-changing routes.**
  Custom state-changing JSON routes (impersonate / switch-tenant / stop-impersonation, and
  any future mutating JSON endpoints) rely solely on `SameSite=Lax` — no CSRF token / Origin
  check / `Content-Type` assertion. Add at least an Origin/Content-Type assertion (or CSRF
  token) before launch. Source: `deferred-work.md` (Epic 2 cross-cutting). *Exit:* mutating
  routes reject cross-origin/forged requests beyond SameSite alone.

- [ ] **PL-15 · [Epic 5 / Story 5.5 → Epic 16] Rolling `messages` partition maintenance.**
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

- [ ] **PL-6 · [Code health] `pnpm typecheck` is RED on `main`.** Later-epic code carries
  typecheck errors caught during the Epic 2 review (all registered to their owning epic, to
  be fixed in that epic's review):
  - Epic 6 — `@leedi/dashboard` `product-detail-client.tsx` (`@/` alias unconfigured, TS2307;
    `ArgumentList.tsx` TS2345) + `@leedi/api` `knowledge-base.ts:26` (TS2379).
  - Epic 7 — `@leedi/agent` `tools/transferir-humano.ts:216` missing `@leedi/notification` (TS2307).
  - Epic 10 — `@leedi/api` `campaign-phase-transition.test.ts:86` (TS2532).
  - Epic 12 — `@leedi/dashboard` `templates/new/page.tsx:29` (TS2375).
  - Epic 17 — `@leedi/api` `jobs/daily-billing-check.ts:24` (TS2344).
  - Epic 18 — `@leedi/dashboard` `src/lib/push-registration.ts:24` (TS2322).
  *Exit:* `pnpm typecheck` green across the monorepo.

- [ ] **PL-7 · [Code health] `pnpm lint` is RED on `main`.** Real lint debt in later-epic
  code (Epics 4,6,10,11,12,13,14,15,16,17,18,19) — mostly unused vars / `prefer-const` /
  `setState`-in-effect, **two substantive (⚠️)**: Epic 12 `template-builder-client.tsx`
  `no-use-before-define` + missing exhaustive-deps; Epic 18 `push-registration.ts`
  `no-process-env` (legitimate exception → needs a justified `eslint-disable`). Full list +
  line numbers: `deferred-work.md` → "Epic 1 lint debt". *Exit:* `pnpm lint` green.

- [ ] **PL-8 · [Code health] CI test gate excludes `@leedi/db` and `@leedi/api`.** `ci.yml`
  runs `turbo run test --filter='!@leedi/db' --filter='!@leedi/api'`. `@leedi/db` needs a
  non-BYPASSRLS `leedi_app` role + live DB (ties to PL-3); `@leedi/api` has cross-file
  test-state pollution (suites pass alone, fail together). Re-include each once fixed.
  Source: `epic-1-test-ci-backlog.md`. *Exit:* both packages back in the CI test gate, green.

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

- [ ] **PL-11 · [Epic 4 / Story 4.4] Inbound webhook rate limiting.** Task 8 deferred — V1
  relies on HMAC signature + dedup for abuse protection; no `@upstash/ratelimit` on the
  inbound webhook. Recommended before exposing the public webhook to real traffic. *Exit:*
  rate limit on the inbound webhook endpoint, or explicit risk-acceptance.

- [ ] **PL-12 · [Epic 7 / Story 7.4] Tag-dedup race / missing unique constraint.** `lead_tags`
  has no `(tenant_id, lead_id, tag)` unique constraint; dedup is in-app (query-then-insert),
  leaving a residual intra-turn race that can create duplicate tags. Add the DB constraint
  (then simplify to `ON CONFLICT`). Data-integrity item. See 7.4 Completion Notes. *Exit:*
  unique constraint in place; dedup relies on it.

- [ ] **PL-13 · [Epics 4,6,10] Behavioral RLS / integration tests deferred to a real env.**
  Several isolation/integration tests were skipped because MCP `execute_sql` runs privileged
  (bypasses RLS) and Redis/BullMQ weren't running locally: 10.1 (cross-tenant `campaigns` read
  returns zero rows), 6.1 (knowledge RLS — needs 0007/0008 applied), 4.3 (BullMQ health
  integration), 4.4 (6s debounce flush — needs Redis). Run these on staging once PL-3/PL-4 land.
  *Exit:* cross-tenant reads verified empty under the `leedi_app` role; integration paths exercised.

- [ ] **PL-14 · [Epic 4 → cross-cutting] Internal API URL derivation breaks in production
  (Finding 5, deferred).** Internal/job/webhook URLs are derived via
  `env.BETTER_AUTH_URL.replace(':3000', \`:${env.API_PORT}\`)` in ~40 sites (originated in
  `webhook-meta.ts`). In a production `BETTER_AUTH_URL` with no `:3000` port (e.g.
  `https://app.leedi.com`), the replace is a **no-op** → the derived URL points at the wrong host,
  silently breaking QStash callbacks / inter-service calls (inbound debounce flush, dispatch jobs,
  campaign transitions, billing/followup jobs). **Fix before the first production client:** introduce
  a dedicated `INTERNAL_API_URL` (or `API_BASE_URL`) env var in `@leedi/config` and replace the
  string-hack at all call sites (use a dynamic/explicit port, not a hardcoded `:3000`→`:PORT`
  substitution). Source: `epic-4-code-review-report.md` Finding 5 + `deferred-work.md`.
  *Exit:* every internal URL resolves correctly under the real production `BETTER_AUTH_URL`
  (verified in staging), with no reliance on the `:3000` substring being present.

- [ ] **PL-16 · [Epic 8 / Stories 8.1 & 8.2] End-to-end playground smoke test.** The review fixed
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

- [ ] **PL-17 · [Epic 13 / Story 13.2] Residual at-least-once duplicate-send window in the dispatch
  batch worker.** `process-dispatch-batch` selects `pendente` targets, sends each template, then
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
- **Epic 2 — Identity & Access:** PL-3 (RLS activation, P0), PL-5 (CSRF, P0), PL-10
  (impersonation audit staging, P1); P2: 2.6 invite polish, 2.8 hardening, 2.5 floor guard.
  *Code-complete per the 2026-06-08 review; remaining = deployed-env validation + the cross-cutting CSRF.*
- **Epic 3 — Design System & UI Shell:** PL-9 (nightly E2E/axe CI gate, P1). All 4 stories
  `done`; 3.4 done **with documented caveat** (local-green axe accepted; CI enforcement = PL-9).
- **Epic 4 — WhatsApp Connection:** PL-11 (webhook rate limiting, P1), PL-13 (4.3/4.4
  integration tests, P1), PL-14 (internal API URL derivation, P1). 4.5 multi-message dispatcher was
  deferred → **wired in Epic 7** (closed). **Formally code-reviewed 2026-06-10** (`epic-4-code-review-report.md`):
  all 5 stories `done`; HIGH enum-mapping bug (Meta `GREEN`/`TIER_1K` → pt-BR pgEnums, `22P02`) fixed
  + 3 minor patches; Finding 5 deferred → PL-14.
- **Epic 5 — Lead Management:** no deferred ACs surfaced yet. *Not yet formally code-reviewed.*
- **Epic 6 — Knowledge Base:** PL-6 (typecheck), PL-13 (6.1 RLS tests); P2: pgvector. *Not yet reviewed.*
- **Epic 7 — Sales Agent:** PL-6 (typecheck: `@leedi/notification`), PL-12 (tag-dedup race);
  P2: 7.7 Deepgram/provider config. *Not yet reviewed.*
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
- **Epic 11 — Hotmart Gateway:** lint debt only so far (→ PL-7). *Not yet reviewed.* **⚠ Money path
  — prioritize its formal review** (webhook → purchase → lead status; idempotency, signature verification).
- **Epic 12 — Meta Templates:** PL-6 (typecheck), PL-7 (⚠ `no-use-before-define`). *Not yet reviewed.*
- **Epic 13 — Smart Dispatch:** PL-17 (residual duplicate-send window, P1, needs enum migration);
  lint debt (→ PL-7). Reviewed 2026-06-11; stories 13.1–13.5 `done` (13.2 done **with documented
  caveat** = PL-17). 5 HIGH + multiple MEDIUM/LOW patches applied (dup-send guards, `bloqueado`
  exclusion, throttle enforcement for all tiers, quality-update unknown-signal + restoration notif,
  recovery dedup status-filter, FK/limit/offset guards, exact-text fixes); 13.4 `agendar_followup`
  contract realigned to `agendado_para`; 13.5 manual `/resume` endpoint + dashboard badge/button shipped.
- **Epic 14 — Human Inbox:** lint debt (→ PL-7). *Not yet reviewed.*
- **Epic 15 — Analytics:** lint debt (→ PL-7). *Not yet reviewed.*
- **Epic 16 — Usage Metering:** lint debt (→ PL-7). *Not yet reviewed.* **⚠ Billing-adjacent
  (usage counts feed overage/billing) — prioritize its formal review.**
- **Epic 17 — Billing (Asaas):** PL-2 (real Asaas keys + `ASAAS_SANDBOX=false`), PL-6 (typecheck),
  PL-7 (lint). *Not yet reviewed.* **⚠ Money path — prioritize its formal review** (subscription
  creation, webhook lock/unlock idempotency, signature verification).
- **Epic 18 — Notifications:** PL-2 (real VAPID keys), PL-6 (typecheck), PL-7 (⚠ `no-process-env`
  exception). *Not yet reviewed.*
- **Epic 19 — Onboarding Wizard:** P2: 19.2 logo upload (V1.5), 19.4 PostHog tracking deferred.
  *Not yet reviewed.*
- **Epic 20 — Super-Admin Dashboard:** P2: 20.3 live FX, CRM CTA, days-at-risk precision; 20.1
  row-click → 20.2. `epic-20: backlog` in sprint-status though stories are `review`. *Not yet reviewed.*

---

## E. How to keep this current

1. When an epic gets its formal `bmad-code-review`, fold every new deferred AC into Section A/B/C
   with a `PL-N` id and add it to that epic's line in Section D.
2. When a `PL-N` item is resolved, check its box and note the resolving commit/date — do not delete
   it (the audit trail matters for a launch gate).
3. `deferred-work.md` stays the detailed tracker; this file stays the curated launch checklist.
   If they disagree, reconcile (this file is the decision record for *launch readiness*).
