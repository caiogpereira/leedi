# Roteiro de Testes de Usabilidade — Leedi

> **Purpose.** A dependency-tiered roadmap of end-to-end **user journeys** to drive real
> usability + functional testing of the app on a local environment (local server + tunnel +
> sandboxes). Each journey is a self-contained test script: preconditions, steps, what to
> observe, and the already-documented risks to confirm on purpose.
>
> **Dual use.** Journeys are ordered by **configuration dependency** (what external service
> must be set up to run them). That ordering doubles as the **unblock sequence** for the
> backlog session: Tier 0 runs 100% local today; each higher tier is unlocked by one setup
> runbook (§Setup runbooks).
>
> ⚠️ **Roadmap completion ≠ launch-ready.** This roadmap proves *what works for a user*. It
> does **not** cover launch-gate hardening that blocks **no** local journey — notably
> **PL-1** (rotate leaked secrets), **PL-3** (DB-level RLS), **PL-5** (CSRF). Those stay in
> `pendencias-pre-launch.md` and must be closed independently before real paying customers.
>
> **Sources crossed:** `pendencias-pre-launch.md` (launch gate, PL-N ids),
> `deferred-work.md` (canonical debt tracker), `project_meta_whatsapp_setup` memory.
>
> **How we work this doc:** I (Claude) drive the browser via the Chrome DevTools / Playwright
> MCP and report observations with evidence; Caio drives where a human decision/login/external
> console is needed. **When a step needs Caio to touch an external service (Meta, Asaas,
> Resend, etc.), the runbook gives numbered manual steps.** Every finding goes into §Findings
> log as we go.
>
> Created: 2026-06-15.

---

## Journey format

Each journey (`J-NN`) carries:

- **Tier** — config dependency level (0 = runs today … 3 = needs Hotmart).
- **Preconditions** — required config + the `PL-N` items it exercises.
- **Steps** — the click path, end to end.
- **Observe** — expected result **and** UX friction (not just pass/fail).
- **Risks to confirm** — `deferred-work` items that touch this journey, verified on purpose.
- **Driver** — Claude (browser MCP) or Caio.

Status per journey: `todo` → `in-progress` → `done` / `blocked`.

---

## Tier map (what unlocks what)

| Tier | Unlocked by | Journeys |
|---|---|---|
| **0** | Local: Postgres + Anthropic + Upstash Redis + **Resend** (account setup) | J-01 … J-12 |
| **1** | Tunnel + Meta test number + **QStash** (messaging core needs both) | J-13 … J-19 |
| **2** | Asaas sandbox | J-20, J-21 |
| **3** | Hotmart sandbox | J-22 |
| **X-cut** | VAPID keys (no tunnel) — set early, test opportunistically | J-23 |

> **Why Meta + QStash share Tier 1:** the inbound core (message in → agent replies) debounces
> for 6s and the flush is a **QStash delayed publish** — confirmed at
> `apps/api/src/routes/webhook-meta.ts:343-351` (`qstash.publishJSON({ url: …/api/internal/agent-flush, delay: 6 })`).
> Without QStash the flush callback never fires and the agent never answers. So both services
> are required before any inbound conversation journey is testable.

---

## Tier 0 — Runs today (local)

> **Precondition for the whole tier: a testable account.** See §Setup runbook 0 first —
> registration requires email verification via Resend, and onboarding (J-02) requires a
> **fresh** tenant (the E2E seed creates `active` tenants that skip onboarding).

### J-01 · Auth & access
- **Tier:** 0 · **Driver:** Claude+Caio · **Status:** todo
- **Preconditions:** Resend configured *or* the DB email-verify workaround (Setup runbook 0); confirms **PL-19** (login redirect derives from `BETTER_AUTH_URL`, not `localhost:3000`).
- **Steps:** register → receive/derive verification link → verify → login → logout → forgot-password → reset-password → hit a protected route while logged out (expect redirect to `${BETTER_AUTH_URL}/login`) → hit a forbidden route (expect `/403`).
- **Observe:** verification + reset emails render and links work; redirect target is the real web origin (not `localhost:3000`); 403 page is sane.
- **Risks to confirm:** PL-19 fix is live (no `localhost:3000` literal in the redirect).

### J-02 · Onboarding wizard
- **Tier:** 0 (steps 1, 3–5; step 2 = WhatsApp connect is **Tier 1**, see J-13) · **Driver:** Claude+Caio · **Status:** todo
- **Preconditions:** a **fresh** tenant in `trial` status (newly registered account redirects here). Steps that call `/onboarding/gateway-webhook-url` show a URL derived via the `:3000`→port replace — see **PL-14** (wrong host in prod; cosmetic locally).
- **Steps:** complete profile (step 1) → [step 2 WhatsApp = J-13] → gateway webhook step (step 3) → sales method/agent (step 4) → complete (step 5) → confirm full reload lands on an `active`-tenant dashboard.
- **Observe:** wizard progress persists across reloads (`/onboarding/progress`); skipping/returning behaves; final redirect works.
- **Risks to confirm:** PL-14 — note the webhook URL shown; flag if it embeds `:3000`.

### J-03 · Leads
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** create lead → import CSV (valid + malformed rows) → add/remove tags → change status → open detail.
- **Observe:** CSV phone normalization (note: 10-digit landlines over-accepted — deferred-work Epic 5 F5); list sort by `ultima_interacao` (deferred-work Epic 5 F6 — existing leads never bump, so active leads may not float up); tag dedup (**PL-12** — no DB unique constraint, intra-turn race).
- **Risks to confirm:** PL-12 tag dup; Epic 5 F6 sort staleness.

### J-04 · Knowledge base
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** products CRUD (`/conhecimento/produtos`, `/novo`, `/[id]`) → FAQ → objections.
- **Observe:** keyword/exact match only (pgvector is P2, not present); product detail page renders (Epic 6 had a `@/` alias typecheck issue — **PL-6**; confirm it renders at runtime).

### J-05 · Agent config
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** `/agente/configuracoes` (persona, settings) → `/agente/metodo` (sales method).
- **Observe:** config saves and round-trips; method selection persists.

### J-06 · Playground
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Preconditions:** Anthropic API key + Upstash Redis (session). Exercises **PL-16**.
- **Steps:** run all 3 scenarios — `novo_lead`, `lead_recorrente`, `lead_com_objecao` → "Reiniciar conversa".
- **Observe:** WhatsApp-style bubbles + tool-call panels render; the two scenarios whose synthetic history ends on a `user` turn return 200 on first message; `lead_com_objecao` first agent turn engages the "preço" objection (AC#2).
- **Risks to confirm:** **PL-16** — confirm **no** `leads`/`agent_*`/`lead_journey_events`/`conversation_windows`/`usage_counters` rows are created for the session (sandbox side-effect bug was fixed; verify live).

### J-07 · Templates (build draft)
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** template builder (`/templates/new`), library (`/templates/biblioteca`), edit (`/templates/[id]`); build a `rascunho` with `{{N}}` variables. **Do not submit to Meta** (that's J-16).
- **Observe:** variable coverage UI (deferred-work 12.1 — server doesn't validate `{{0}}`/sequential, UI does); builder prefill from library.

### J-08 · Campaigns
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** create campaign → phases → activate → pause → end (`/campanhas`, `/campanhas/[id]`). No real dispatch.
- **Observe:** ending a campaign is terminal — re-activating an `encerrada` campaign must be rejected (Epic 10 AC#7); transition errors return 400 not 500.

### J-09 · Dispatch config
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** segments (`/disparos/segmentos`, `/new`) + preview → rules (`/disparos/regras`, `/new`). Configuration only; execution is J-17/J-18.
- **Observe:** segment preview counts; rule creation.

### J-10 · Reports / Analytics
- **Tier:** 0 (UI) · **Driver:** Claude · **Status:** todo
- **Preconditions:** ⚠️ **meaningful data only exists after Tier 1** (real conversations/sales). Either seed analytics data or treat this as a **revisit after Tier 1**.
- **Steps:** dashboard widgets, sales analytics, objections, connection-health, active-campaign.
- **Observe:** **validate the `/relatorios` sidebar link** — no `page.tsx` was found for that route (suspected dead link); confirm and log. Date-range edge cases (deferred-work Epic 15 — off-by-one, NaN daysRemaining were fixed; verify).
- **Risks to confirm:** dead `/relatorios` route; empty-state rendering with no data.

### J-11 · Settings
- **Tier:** 0 · **Driver:** Claude+Caio · **Status:** todo
- **Steps:** usage (`/uso`, `/configuracoes/uso`), billing view (`/configuracoes/cobranca`), notifications toggles (`/configuracoes/notificacoes`), team invite (`/settings/team` — needs email), whatsapp settings view (`/settings/whatsapp`).
- **Observe:** dead-link check on `/configuracoes` vs `/settings` (Epic 16 found two `/settings`→`/configuracoes` dead links — confirm fixed); invite sends (email dep); notification toggles persist (Epic 18 — `quality_caindo` toggle was dead, fixed; verify it maps to the right signal).

### J-12 · Super-admin (admin app)
- **Tier:** 0 · **Driver:** Claude · **Status:** todo
- **Steps:** `/tenants`, `/clientes`, `/financeiro`, `/operacional`; impersonate a tenant → navigate.
- **Observe:** dashboards render with seeded data; block/unblock tenant; super-admin guard.
- **Risks to confirm:** **PL-10** — impersonation write+audit can only be *fully* validated in staging; here, confirm the UI flow + that a non-super-admin can't reach admin.

---

## Tier 1 — After Meta + QStash (tunnel + test number)

> Setup runbook 1 covers: tunnel (ngrok/cloudflared), Meta Developer App (app secret, webhook
> verify token, test number), QStash (token + signing keys pointed at the tunnel). **PL-2.**

### J-13 · Connect WhatsApp
- **Tier:** 1 · **Driver:** Claude+Caio · **Status:** todo
- **Steps:** onboarding step 2 *and* `/settings/whatsapp` → connect flow → Meta webhook verification handshake (GET verify) → confirm `conectado` status + display name/phone id.
- **Observe:** webhook verify token round-trip; connection status reflects reality.

### J-14 · 💛 Inbound → agent replies (core loop)
- **Tier:** 1 · **Driver:** Claude+Caio · **Status:** todo
- **Preconditions:** Meta test number + QStash + Redis. **PL-13** (6s debounce flush).
- **Steps:** send a WhatsApp message from the test number → 6s debounce → QStash flush → agent generates a reply → reply delivered → `conversation_window` opened, message persisted.
- **Observe:** debounce batches rapid messages; agent reply is on-method; window/lead state correct; media refs ride along the flush.
- **Risks to confirm:** flush idempotency (multiple flush attempts safe); message partition (**PL-15** — partitions exist through 2026-08; not a near-term blocker).

### J-15 · Human inbox takeover
- **Tier:** 1 · **Driver:** Claude · **Status:** todo
- **Preconditions:** live conversations from J-14. **PL-18.**
- **Steps:** `/conversas` list (filters: status incl. `bot`/default-hides-`resolvido`, temperatura) → open `/conversas/[windowId]` → takeover → reply (humano) → "Carregar mais" history → return to bot → resolve.
- **Observe:** **PL-18** — the 8s poll must **not** wipe loaded pages / older history / an in-flight optimistic reply; takeover-steal guard prevents two agents grabbing the same window.
- **Risks to confirm:** PL-18 poll-merge; deferred-work Epic 14 — duplicate `inbox_assignments`, reply cross-tx status drift.

### J-16 · Template submit → Meta approval
- **Tier:** 1 · **Driver:** Claude+Caio · **Status:** todo
- **Steps:** take a `rascunho` from J-07 → submit to Meta → receive `message_template_status_update` webhook → status reflects approval/rejection.
- **Observe:** approval notification fires (Epic 12 AC#2); status callback handling (deferred-work 12.2 — malformed body 500/retry; `webhook:unknown` rate-limit bucket for template callbacks).

### J-17 · Mass dispatch
- **Tier:** 1 · **Driver:** Claude+Caio · **Status:** todo
- **Preconditions:** approved template + segment. **PL-17.**
- **Steps:** create a dispatch job → run → watch sends via Meta → pause → resume (`/disparos/[id]`).
- **Observe:** throttle enforced for all tiers; `bloqueado` (LGPD opt-out) leads excluded; pause/resume.
- **Risks to confirm:** **PL-17** — residual at-least-once duplicate-send window (send-then-mark, no `enviando` claim state); force a mid-batch redelivery and watch for a re-send.

### J-18 · Campaign transitions + follow-ups
- **Tier:** 1 · **Driver:** Claude · **Status:** todo
- **Preconditions:** QStash jobs. **PL-14** (internal URL derivation — verify callbacks resolve).
- **Steps:** trigger a phase transition → confirm scheduled QStash callback fires → schedule a follow-up (`agendar_followup` with `agendado_para`) → confirm it sends / cancels on conversion.
- **Observe:** transition jobs fire; follow-up reorder/dedup (Epic 13 fixes); `cancelado` note not persisted (deferred-work 13.4 — known gap).

### J-19 · Quality update / connection health
- **Tier:** 1 · **Driver:** Claude+Caio · **Status:** todo
- **Steps:** trigger a Meta quality signal (or simulate the webhook) → confirm `connection-health` analytics update + notification.
- **Observe:** quality signal maps correctly (green/yellow/red pgEnums); 24h-window detection surfaces the Meta error code (Epic 14 AC#8).

---

## Tier 2 — After Asaas sandbox

> Setup runbook 2: Asaas sandbox account, API key, webhook token, `ASAAS_SANDBOX=true`. **PL-2.**

### J-20 · Subscription & billing
- **Tier:** 2 · **Driver:** Claude+Caio · **Status:** todo
- **Steps:** create subscription (admin form, with `cpfCnpj`) → Asaas `PAYMENT_CREATED` webhook → invoice created → confirm header is `asaas-access-token` (Epic 17 CRITICAL fixes) → simulate overdue → lock → pay → unlock; toggle overage; view `/configuracoes/cobranca`.
- **Observe:** invoice `UNIQUE asaas_payment_id` (migration 0019) dedup; lock/unlock idempotency; overage toggle actually turns metering on/off (Epic 16 fix).
- **Risks to confirm:** webhook dedup (Redis before enqueue); `cpfCnpj` sent to Asaas (was missing → 400 in prod).

### J-21 · Daily billing check job
- **Tier:** 2 · **Driver:** Claude · **Status:** todo
- **Steps:** seed an overdue invoice → run/await the daily-billing-check QStash job → confirm tenant blocked.
- **Observe:** block respects open conversation windows (Epic 16 — `hasOpenConversationWindow` read-only guard, doesn't kill live chats).

---

## Tier 3 — After Hotmart sandbox

> Setup runbook 3: Hotmart sandbox + webhook secret pointed at the tunnel.

### J-22 · Hotmart gateway
- **Tier:** 3 · **Driver:** Claude+Caio · **Status:** todo
- **Steps:** fire a Hotmart purchase webhook → confirm signature verification → lead status updated → recovery event flow.
- **Observe:** idempotency (deferred-work Epic 11 — app-layer SELECT-then-INSERT, no unique index; concurrent dup possible); recovery event published *after* commit (Epic 11 fix).

---

## Cross-cutting

### J-23 · Push notifications
- **Tier:** X-cut (VAPID keys, no tunnel) · **Driver:** Claude+Caio · **Status:** todo
- **Preconditions:** VAPID keys (`VAPID_*`). **PL-2.**
- **Steps:** register a push subscription in the browser → trigger a notification (inbox/quality/billing) → receive it.
- **Observe:** subscription upsert keyed on `(user_id, endpoint)`; notification preferences respected.
- **Risks to confirm:** stale `tenant_id` after tenant switch (deferred-work Epic 18 — low impact).

---

## Setup runbooks

> Each runbook is the **numbered manual steps** for Caio to stand up a tier's external
> dependency. Tier 0 is filled now; Tiers 1–3 are outlined and will be expanded to full
> step-by-step (with exact Meta/Asaas/Hotmart console clicks and the `.env` keys to set)
> **when we reach that tier**.

### Setup runbook 0 — A testable account (do this first)
**Goal:** a verified login, plus a way to reach the onboarding wizard.
1. **Email delivery (for register/verify/reset).** Registration uses `requireEmailVerification: true` via Resend (`packages/auth/src/email-senders.ts` → `resend.ts`). Two options:
   - **(a) Real Resend (recommended for testing the real email UX):** create a Resend account, get an API key, set `RESEND_API_KEY`. For the `from` domain (`noreply@leedi.digital`) you must verify the domain in Resend, *or* temporarily change `FROM_ADDRESS` to Resend's `onboarding@resend.dev` and send only to your own verified address.
   - **(b) DB workaround (fastest to unblock):** register, then manually flip the user's `email_verified`/verification in the DB (or read the Better-Auth verification token row and open the verify URL by hand). Use this to skip email entirely for journeys other than J-01.
2. **Account for general testing:** the E2E seed already provisions an `active` tenant + owner (`e2e+owner@leedi.test`) — usable for J-03…J-12.
3. **Account for onboarding (J-02):** a newly registered account's tenant defaults to `trial` → it redirects into `/onboarding`. The seeded account is `active` and **skips** onboarding, so use a *fresh* registration (needs step 1 working) to test the wizard.
4. **Local services:** Postgres (Supabase) `DATABASE_URL`, Anthropic API key, Upstash Redis — confirm all set in `.env`.

### Setup runbook 1 — Meta + QStash + tunnel *(to expand at Tier 1)*
Outline: (1) start a tunnel (ngrok/cloudflared) exposing the API port; (2) Meta Developer App → WhatsApp → get test number, `WHATSAPP_APP_SECRET`, set `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, point the webhook callback at `${tunnel}/api/webhooks/meta`; (3) QStash → `QSTASH_TOKEN` + signing keys, ensure the flush callback URL resolves to the tunnel. See `project_meta_whatsapp_setup` memory for the existing notes. **PL-2.**

### Setup runbook 2 — Asaas sandbox *(to expand at Tier 2)*
Outline: Asaas sandbox account → API key + webhook token, `ASAAS_SANDBOX=true`, webhook URL → `${tunnel}/api/webhooks/asaas`.

### Setup runbook 3 — Hotmart sandbox *(to expand at Tier 3)*
Outline: Hotmart sandbox + webhook secret → `${tunnel}/api/webhooks/hotmart`.

---

## Findings log

> Append findings as we test. One row per finding. **Bug** = broken; **UX** = works but
> confusing; **Cosmetic** = polish. Link to the journey. When a finding becomes work, give it a
> `PL-N` (if launch-gating) and fold into `pendencias-pre-launch.md`, or note it as deferred.

| # | Journey | Type | Finding | Status / action |
|---|---|---|---|---|
| _(empty — first session populates this)_ | | | | |

### Pre-identified to confirm (found while writing this roadmap)
- **`/relatorios` sidebar link** (J-10): `Sidebar.tsx:40` links to `/relatorios` but no `app/(shell)/relatorios/page.tsx` exists — suspected dead link. Confirm + fix or repoint.

---

## How to keep this current
1. Update each journey's **Status** as we run it.
2. Log every observation in **§Findings log** immediately.
3. When a finding is launch-gating, give it a `PL-N` and add it to `pendencias-pre-launch.md`
   (this doc stays the *testing* record; that one stays the *launch gate*).
4. Expand Setup runbooks 1–3 to full step-by-step when we reach each tier.
