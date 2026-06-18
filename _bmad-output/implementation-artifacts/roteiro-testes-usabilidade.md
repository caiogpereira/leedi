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
- **Tier:** 0 · **Driver:** Claude+Caio · **Status:** done — register/verify/login/forgot/reset all work with real Resend email (F-32); PL-19 ok (F-02). Caveats: F-29 (logout broken), F-28 (403→/login), F-31 (no tenant).
- **Preconditions:** Resend configured *or* the DB email-verify workaround (Setup runbook 0); confirms **PL-19** (login redirect derives from `BETTER_AUTH_URL`, not `localhost:3000`).
- **Steps:** register → receive/derive verification link → verify → login → logout → forgot-password → reset-password → hit a protected route while logged out (expect redirect to `${BETTER_AUTH_URL}/login`) → hit a forbidden route (expect `/403`).
- **Observe:** verification + reset emails render and links work; redirect target is the real web origin (not `localhost:3000`); 403 page is sane.
- **Risks to confirm:** PL-19 fix is live (no `localhost:3000` literal in the redirect).

### J-02 · Onboarding wizard
- **Tier:** 0 (steps 1, 3–5; step 2 = WhatsApp connect is **Tier 1**, see J-13) · **Driver:** Claude+Caio · **Status:** done — F-31 fixed (auto-provision on verify); full wizard verified → trial→active (F-33); F-34 (WhatsApp step no-skip) logged; step 2 skipped via API (Tier 1); PL-14 url null (revisit). Onboarding+sales-methods proxies committed.
- **Preconditions:** a **fresh** tenant in `trial` status (newly registered account redirects here). Steps that call `/onboarding/gateway-webhook-url` show a URL derived via the `:3000`→port replace — see **PL-14** (wrong host in prod; cosmetic locally).
- **Steps:** complete profile (step 1) → [step 2 WhatsApp = J-13] → gateway webhook step (step 3) → sales method/agent (step 4) → complete (step 5) → confirm full reload lands on an `active`-tenant dashboard.
- **Observe:** wizard progress persists across reloads (`/onboarding/progress`); skipping/returning behaves; final redirect works.
- **Risks to confirm:** PL-14 — note the webhook URL shown; flag if it embeds `:3000`.

### J-03 · Leads
- **Tier:** 0 · **Driver:** Claude · **Status:** done (F-05 scope, F-06 bug, F-07 PL-12, F-08 OK)
- **Steps:** create lead → import CSV (valid + malformed rows) → add/remove tags → change status → open detail.
- **Observe:** CSV phone normalization (note: 10-digit landlines over-accepted — deferred-work Epic 5 F5); list sort by `ultima_interacao` (deferred-work Epic 5 F6 — existing leads never bump, so active leads may not float up); tag dedup (**PL-12** — no DB unique constraint, intra-turn race).
- **Risks to confirm:** PL-12 tag dup; Epic 5 F6 sort staleness.

### J-04 · Knowledge base
- **Tier:** 0 · **Driver:** Claude · **Status:** done (F-09 fixed, F-10 PL-N systemic gap, F-11 PL-6 OK; FAQ/objections create blocked by F-10)
- **Steps:** products CRUD (`/conhecimento/produtos`, `/novo`, `/[id]`) → FAQ → objections.
- **Observe:** keyword/exact match only (pgvector is P2, not present); product detail page renders (Epic 6 had a `@/` alias typecheck issue — **PL-6**; confirm it renders at runtime).

### J-05 · Agent config
- **Tier:** 0 · **Driver:** Claude · **Status:** done — config + method round-trip verified in DB (nome/persona/modelo/tools/estilo + metodo=spin); F-13 pool exhaustion fixed
- **Steps:** `/agente/configuracoes` (persona, settings) → `/agente/metodo` (sales method).
- **Observe:** config saves and round-trips; method selection persists.

### J-06 · Playground
- **Tier:** 0 · **Driver:** Claude · **Status:** done — F-15 proxies fixed, F-14 credits resolved, **PL-16 full pass (F-16)**, AC#2 objection engaged, agent honors J-05 config.
- **Preconditions:** Anthropic API key + Upstash Redis (session). Exercises **PL-16**.
- **Steps:** run all 3 scenarios — `novo_lead`, `lead_recorrente`, `lead_com_objecao` → "Reiniciar conversa".
- **Observe:** WhatsApp-style bubbles + tool-call panels render; the two scenarios whose synthetic history ends on a `user` turn return 200 on first message; `lead_com_objecao` first agent turn engages the "preço" objection (AC#2).
- **Risks to confirm:** **PL-16** — confirm **no** `leads`/`agent_*`/`lead_journey_events`/`conversation_windows`/`usage_counters` rows are created for the session (sandbox side-effect bug was fixed; verify live).

### J-07 · Templates (build draft)
- **Tier:** 0 · **Driver:** Claude · **Status:** done — builder + coverage UI OK; draft persists after F-19 proxy fix; F-20 (draft requires examples) logged. Did NOT submit to Meta (J-16).
- **Steps:** template builder (`/templates/new`), library (`/templates/biblioteca`), edit (`/templates/[id]`); build a `rascunho` with `{{N}}` variables. **Do not submit to Meta** (that's J-16).
- **Observe:** variable coverage UI (deferred-work 12.1 — server doesn't validate `{{0}}`/sequential, UI does); builder prefill from library.

### J-08 · Campaigns
- **Tier:** 0 · **Driver:** Claude · **Status:** done — full lifecycle + AC#7 terminal guard (409) verified (F-21).
- **Steps:** create campaign → phases → activate → pause → end (`/campanhas`, `/campanhas/[id]`). No real dispatch.
- **Observe:** ending a campaign is terminal — re-activating an `encerrada` campaign must be rejected (Epic 10 AC#7); transition errors return 400 not 500.

### J-09 · Dispatch config
- **Tier:** 0 · **Driver:** Claude · **Status:** done — segment+preview+save OK; rule UI gates on approved template (F-22).
- **Steps:** segments (`/disparos/segmentos`, `/new`) + preview → rules (`/disparos/regras`, `/new`). Configuration only; execution is J-17/J-18.
- **Observe:** segment preview counts; rule creation.

### J-10 · Reports / Analytics
- **Tier:** 0 (UI) · **Driver:** Claude · **Status:** done — `/relatorios` dead link confirmed (F-23); analytics render post-F-01 (F-24); usage widget blocked by F-18. Meaningful data = revisit after Tier 1.
- **Preconditions:** ⚠️ **meaningful data only exists after Tier 1** (real conversations/sales). Either seed analytics data or treat this as a **revisit after Tier 1**.
- **Steps:** dashboard widgets, sales analytics, objections, connection-health, active-campaign.
- **Observe:** **validate the `/relatorios` sidebar link** — no `page.tsx` was found for that route (suspected dead link); confirm and log. Date-range edge cases (deferred-work Epic 15 — off-by-one, NaN daysRemaining were fixed; verify).
- **Risks to confirm:** dead `/relatorios` route; empty-state rendering with no data.

### J-11 · Settings
- **Tier:** 0 · **Driver:** Claude+Caio · **Status:** done — notif (Epic 18 ✅), usage+overage (Epic 16 ✅) & billing views unblocked via new proxies; /settings/{whatsapp,team} render; no dead links (F-25). Team invite send needs Resend.
- **Steps:** usage (`/uso`, `/configuracoes/uso`), billing view (`/configuracoes/cobranca`), notifications toggles (`/configuracoes/notificacoes`), team invite (`/settings/team` — needs email), whatsapp settings view (`/settings/whatsapp`).
- **Observe:** dead-link check on `/configuracoes` vs `/settings` (Epic 16 found two `/settings`→`/configuracoes` dead links — confirm fixed); invite sends (email dep); notification toggles persist (Epic 18 — `quality_caindo` toggle was dead, fixed; verify it maps to the right signal).

### J-12 · Super-admin (admin app)
- **Tier:** 0 · **Driver:** Claude · **Status:** done — guard + dashboards + block/unblock + audit OK (F-27); Operacional 500 fixed (F-26); F-28 (/login 404), F-29 (no logout) FIXED; **F-30 (impersonation scope) FIXED + browser-verified (`6b8b3c0`)** — platform-wide impersonation, start works cross-workspace. **Full dashboard render under impersonation RESOLVED (`a58e0ef`..`5ad635f`, 2026-06-17):** the 33 inline-resolution pages now route through the impersonation-aware `getCurrentTenantContext` helper; browser-verified that home/leads/agente/conhecimento/templates/disparos/configuracoes all render under impersonation (no 403, no "Nenhum workspace"). Operator can now configure a tenant end-to-end via impersonation. Only the deployed-env write+audit pass remains under PL-10.
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
- **Tier:** 2 · **Driver:** Claude+Caio · **Status:** **done** — full lifecycle PROVEN end-to-end. Verified: admin "Criar tenant" (CPF `111.444.777-35`, Starter) → Asaas customer+subscription (`cus_000008200852`/`sub_4483bi953549tpzr`, R$697); `asaas-access-token` header gate (401 wrong / 200 right); **real Asaas `PAYMENT_RECEIVED` (apiVersion 3) → QStash(US) → signed callback → invoice `pago` + subscription `ativa`** (DB-confirmed). **This session (2026-06-18) closed the rest:** overdue→**lock** via the real signed QStash daily-check (tenant `active`→`blocked`, surfacing+fixing **F-39 CRITICAL**); pay→**unlock** via a real signed QStash `PAYMENT_RECEIVED` while blocked → invoice `pago` + sub `ativa` + tenant `blocked`→`active` (the `wasBlocked` branch fired the `conta_reativada` stub); **overage toggle** ("Bloquear ao atingir limite") round-tripped via the UI under impersonation (config `false`→`true`→`false`, +2 `impersonation_write` audit rows); **`/configuracoes/cobranca` view** verified in all 3 states (Ativa+Pago / red "Conta suspensa" banner+Atrasada+Atrasado / recovered Ativa+Pago — screenshots in `evidence/j20-cobranca-{blocked,active}.png`). DB restored to the clean proof state afterward. Fixed en route earlier: F-35 (DB pooler), F-36 (QStash US region), F-37 (webhook apiVersion 2→3). Surfaced + fixed F-38 (dedup payment-id-only → now event-scoped).
- **Steps:** create subscription (admin form, with `cpfCnpj`) → Asaas `PAYMENT_CREATED` webhook → invoice created → confirm header is `asaas-access-token` (Epic 17 CRITICAL fixes) → simulate overdue → lock → pay → unlock; toggle overage; view `/configuracoes/cobranca`.
- **Observe:** invoice `UNIQUE asaas_payment_id` (migration 0019) dedup; lock/unlock idempotency; overage toggle actually turns metering on/off (Epic 16 fix).
- **Risks to confirm:** webhook dedup (Redis before enqueue); `cpfCnpj` sent to Asaas (was missing → 400 in prod).

### J-21 · Daily billing check job
- **Tier:** 2 · **Driver:** Claude · **Status:** **done** — seeded an overdue invoice (status `atrasado`, vencimento −8d, sub `atrasada`) → fired the **real signed QStash** `POST /api/internal/billing/daily-check` (`verifyQStash`-gated, message DELIVERED 200) → tenant flipped `active`→`blocked`. **Caught + fixed F-39 (CRITICAL):** the job had been blocking **nobody** in prod — it read `.rows` off a `postgres-js` result that's a bare array, so `checked:0` every run; pre-fix the live call returned 200 with no effect, post-fix it blocked. Fix is live-proven for the daily-check and applied to 2 sibling `.rows` misreads (gateway recovery + Hotmart dedup, Tier-3, live-verify at J-22).
- **Observe:** the block sets `tenants.status='blocked'` unconditionally; the `hasOpenConversationWindow` guard is enforced at **send-time** (read-only), not in this job, so live chats aren't killed by the status flip (Epic 16). The job is also global — it blocks every tenant with an `atrasado`+past-due invoice (verified none other existed before running).

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

### Setup runbook 1 — Meta + QStash + tunnel (Tier 1)

> **Goal:** a public, STABLE URL forwarding to the local API (`:3003`), plus a Meta test
> number and QStash credentials, so inbound WhatsApp → agent reply (J-14) can run locally.
>
> **Why a tunnel at all:** Meta delivers webhooks and QStash delivers scheduled/delayed jobs
> from the cloud — neither can reach `localhost`. Both the Meta webhook (`/webhook/meta`) and
> the QStash callbacks (`/api/internal/*`) must resolve to the tunnel host that forwards to
> `:3003`. **PL-2.**
>
> **⚠️ The PL-14 prerequisite (now fixed in code):** the API used to derive its own callback
> base URL from `BETTER_AUTH_URL` (swapping `:3000`→`:3003`) — a same-host assumption a tunnel
> breaks, so QStash callbacks went to `localhost` and the agent never replied. There is now an
> explicit `API_PUBLIC_URL` env var (`packages/config` schema + a self-contained resolver in
> `apps/api/src/utils/api-public-url.ts` and `packages/agent/src/tools/api-url.ts`), routed through
> all 14 external-callback sites (12 in apps/api + the 2 agent tools `agendar_followup` /
> `solicitar_reengajamento`; tracker item PL-14a). **Set `API_PUBLIC_URL` to the tunnel origin** and
> every callback resolves correctly. Leaving it unset keeps the old local-only behavior. (The ~50
> dashboard→API BFF proxies are a *separate* server-to-server concern, PL-14b — not needed for local
> Tier-1.)

**Step 1 — cloudflared named tunnel (stable URL).** A *named* tunnel keeps the same hostname
across restarts, so you register the Meta webhook + QStash schedules once. It requires a domain
whose DNS is managed by Cloudflare (e.g. point `leedi.digital`'s nameservers at Cloudflare, or
use a spare domain). If you'd rather not move DNS, the quick tunnel
`cloudflared tunnel --url http://localhost:3003` works but gives a *random* `*.trycloudflare.com`
URL that rotates every run (then you must re-register the webhook/schedules each session).

1. Install: `winget install --id Cloudflare.cloudflared` (or `choco install cloudflared`).
2. Authenticate: `cloudflared tunnel login` → pick the Cloudflare-managed zone in the browser.
3. Create the tunnel: `cloudflared tunnel create leedi-dev` (writes a credentials JSON + a tunnel UUID).
4. Route a stable hostname to it: `cloudflared tunnel route dns leedi-dev leedi-dev.<your-domain>`.
5. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: leedi-dev
   credentials-file: C:\Users\<you>\.cloudflared\<tunnel-uuid>.json
   ingress:
     - hostname: leedi-dev.<your-domain>
       service: http://localhost:3003
     - service: http_status:404
   ```
6. Run it (keep it up while testing): `cloudflared tunnel run leedi-dev`.
7. Set `API_PUBLIC_URL=https://leedi-dev.<your-domain>` in `.env`. This is the base for BOTH
   the Meta webhook and the QStash callbacks.

**Step 2 — Meta Developer App + test number.** (Platform-level, one-time. See the
`project_meta_whatsapp_setup` memory for prior notes.)

1. `developers.facebook.com` → create an app, type **Business** → add the **WhatsApp** product.
2. **App Settings → Basic** → copy the **App Secret** → `WHATSAPP_APP_SECRET` in `.env`.
3. Keep (or change) `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (currently `leedi-webhook-verify-dev`).
4. **WhatsApp → Configuration → Webhook → Edit:**
   - **Callback URL:** `https://leedi-dev.<your-domain>/webhook/meta`  *(note: `/webhook/meta`,
     NOT `/api/webhooks/meta` — the route is mounted at `app.route('/webhook/meta', …)` in
     `apps/api/src/app.ts:53`; the GET handshake checks `hub.verify_token` against
     `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).*
   - **Verify token:** the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - After it verifies, **Subscribe** to the `messages` field (and `message_template_status_update`
     for J-16).
5. **WhatsApp → API Setup:** note the **test number** and its **phone_number_id**, and generate
   an **access token** with `whatsapp_business_messaging` (+ `whatsapp_business_management` for
   templates/J-16). These per-tenant values are entered in the dashboard WhatsApp-connect flow
   (J-13), **not** in `.env`. Add your own WhatsApp number as an allowed **recipient** on the test
   number so it can message you back.

**Step 3 — QStash (Upstash).**

1. `console.upstash.com` → **QStash** → copy `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
   `QSTASH_NEXT_SIGNING_KEY` → `.env`.
2. No schedule is needed for the core loop (J-14): the API calls `qstash.publishJSON({ url:
   `${API_PUBLIC_URL}/api/internal/agent-flush`, delay: 6 })` dynamically per inbound message.
   Just ensure `API_PUBLIC_URL` (Step 1.7) points at the tunnel so the delivered callback reaches
   the API. The signing-key check (`Receiver.verify`) does **not** pin the URL, so a changing
   tunnel host won't 401 the callback.
3. Optional schedules (later journeys): health-check (`*/15 * * * *` →
   `${API_PUBLIC_URL}/api/internal/whatsapp/health-check-all`, J-19) and daily billing
   (`0 12 * * *` → `${API_PUBLIC_URL}/api/internal/billing/daily-check`, J-21).

**Step 4 — restart + smoke.** Restart `pnpm dev` so the API picks up the new `.env`. Verify:
the tunnel hostname `GET /health` returns 200; `GET https://leedi-dev.<your-domain>/webhook/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=ping` echoes `ping`. Then proceed to J-13.

### Setup runbook 2 — Asaas sandbox (Tier 2)

> **Goal:** the Asaas sandbox firing real payment webhooks at the local API through the
> existing tunnel, so subscription → invoice → overdue → lock → pay → unlock (J-20) and the
> daily billing-check (J-21) can run locally. **PL-2.**
>
> **Independent of Meta.** Tier 2 reuses only the shared infra that's already standing from
> Tier 1 — the cloudflared tunnel (`leedi-dev.leedi.digital`), QStash (token + signing keys),
> and Redis. The Facebook BM reverification blocks **only** the inbound-WhatsApp journeys
> (J-13/J-14); it does not touch billing.
>
> **Two QStash hops (don't confuse them):** the public Asaas webhook (`/webhooks/asaas`) is
> validated by the `asaas-access-token` header only and **enqueues** to QStash; QStash then
> delivers the event **signed** to the internal worker (`/api/internal/billing/process-asaas-event`,
> verified by the QStash signing keys). So both the `ASAAS_*` vars **and** the QStash keys must
> be set — the latter already are.

**Step 0 — env vars (already set, just confirm).** In `.env`:
- `ASAAS_API_KEY` — sandbox API key (`$aact_…` from the sandbox account).
- `ASAAS_WEBHOOK_TOKEN` — a token **you choose**; you'll paste the same value into the Asaas
  webhook config in Step 2. The webhook handler rejects any request whose `asaas-access-token`
  header ≠ this value (`apps/api/src/routes/webhooks/asaas.ts:33-37`).
- `ASAAS_SANDBOX=true` — points `AsaasProvider` at the sandbox base URL.

All three are required by the config schema (`packages/config/src/schema.ts:67-69`), so the API
won't boot without them — Caio reports they're already in `.env`.

**Step 1 — confirm the tunnel forwards to the API.** The named tunnel from runbook 1 already
maps `https://leedi-dev.leedi.digital` → `http://localhost:3003`. Keep `cloudflared tunnel run
leedi-dev` up. Asaas (cloud) can only reach the local API through this host.

**Step 2 — register the webhook in the Asaas sandbox console.**
1. Log into the **sandbox** dashboard: `https://sandbox.asaas.com`.
2. **Configurações da conta → Integrações → Webhooks** (or "Notificações via webhook") → **Adicionar webhook**.
3. Fill:
   - **URL:** `https://leedi-dev.leedi.digital/webhooks/asaas`
     *(⚠️ root path `/webhooks/asaas` — **NOT** `/api/webhooks/asaas`. Mounted at
     `app.route('/webhooks/asaas', …)` in `apps/api/src/app.ts:69`; the internal `/api/internal/*`
     callbacks are a separate QStash hop.)*
   - **Token de autenticação:** the exact value of `ASAAS_WEBHOOK_TOKEN`. Asaas sends it back in
     the `asaas-access-token` header on every delivery; a mismatch → 401.
   - **Email** for delivery-failure alerts: your address.
   - **Versão da API:** v3 (default).
   - **Tipo de sincronização:** *Sequencial* (keeps event order — fine for testing).
   - **Eventos:** enable the **Cobranças (payments)** events. The worker handles
     `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
     `PAYMENT_DELETED`, `PAYMENT_REFUNDED` (`apps/api/src/jobs/process-billing-event.ts:242-262`);
     unknown events are logged and ignored, so subscribing to all payment events is safe.
   - **Ativo:** enabled.
4. Save. Asaas does **not** do a GET handshake (unlike Meta) — the webhook goes live immediately.

**Step 3 — QStash schedule for the daily billing-check (J-21).** The daily job is **not** a
per-event callback; it's a cron. Two ways to test it:
- **Manual (recommended for testing):** publish a one-off signed job from the QStash console (or
  `curl` via the QStash publish API) to `https://leedi-dev.leedi.digital/api/internal/billing/daily-check`.
  It's `verifyQStash`-gated (`internal.ts:372-373`), so it must come **through** QStash, not a raw
  POST. This lets J-21 run on demand instead of waiting for the cron.
- **Scheduled (mirrors prod):** in `console.upstash.com → QStash → Schedules`, add
  `0 12 * * *` → `https://leedi-dev.leedi.digital/api/internal/billing/daily-check`
  (12:00 UTC = 09:00 BRT; comment at `internal.ts:365-370`).

**Step 4 — restart + smoke.** Restart `pnpm dev` so the API picks up any `.env` change, and keep
the tunnel up. Smoke the wiring **before** the full journey:
1. `GET https://leedi-dev.leedi.digital/health` → 200 (tunnel reaches the API).
2. End-to-end smoke = the first half of J-20: in the **admin app** (`:3002`) → **Clientes** →
   create a client with a **valid sandbox CPF/CNPJ** (`createTenantAction` validates the check
   digits via `isValidCpfCnpj` before calling Asaas — `clientes/actions.ts:41-44`). That call
   creates the Asaas customer + subscription (`createBillingForTenant`), which makes Asaas
   generate a payment and fire **`PAYMENT_CREATED`** at the webhook → the worker inserts an
   `invoices` row (`status: 'pendente'`). **Confirm via Supabase MCP**: a new `subscriptions` row
   (with `asaas_customer_id`/`asaas_subscription_id`) and an `invoices` row keyed by
   `asaas_payment_id`. If billing init fails, the tenant is still created but flagged
   `billing_status: 'pendente_configuracao'` and the form reports `billingFailed` — check the API
   logs for the Asaas error (most likely a sandbox CPF/key issue).

> **Driving the sandbox:** the `asaas` MCP is available this session (`mcp__asaas__*`) — it can
> create customers/payments and **simulate** payment state transitions (confirm/overdue) against
> the sandbox API, which is how J-20 forces `PAYMENT_RECEIVED` / `PAYMENT_OVERDUE` without waiting
> for real due dates. For J-21, seed an `invoices` row with a past `vencimento` (status
> `atrasado`) + the subscription `atrasada`, then run the daily-check (Step 3) and confirm the
> tenant flips to `blocked` — the block honors open conversation windows
> (`hasOpenConversationWindow`, Epic 16).

### Setup runbook 3 — Hotmart sandbox *(to expand at Tier 3)*
Outline: Hotmart sandbox + webhook secret → `${tunnel}/api/webhooks/hotmart`.

---

## Findings log

> Append findings as we test. One row per finding. **Bug** = broken; **UX** = works but
> confusing; **Cosmetic** = polish. Link to the journey. When a finding becomes work, give it a
> `PL-N` (if launch-gating) and fold into `pendencias-pre-launch.md`, or note it as deferred.

| # | Journey | Type | Finding | Status / action |
|---|---|---|---|---|
| F-01 | J-10 / home | **Bug (HIGH)** | **Analytics `sales` + `objections` 500 for every tenant, always.** Root cause: `getTenantSalesMetrics` + `getTopObjections` pass JS `Date` objects (`${from}`/`${to}`) into a raw `tx.execute(sql\`…\`)`; postgres.js v3.4.9 can't serialize a `Date` param in the prepared-statement Bind path → `TypeError [ERR_INVALID_ARG_TYPE] … Received an instance of Date` (node:buffer `Buffer.byteLength`). Fails with **zero data** too (Bind happens before execution). Affects the **dashboard home** widgets (Conversas/Conversões/objeções show `...` forever) **and** `/relatorios` sales+objections. Pre-existing (branch didn't touch `packages/analytics`; last edit = Epic 15 review `5c83a5f`); invisible to unit tests because they mock the DB driver. Verified via isolated repro (`scripts/debug-analytics.ts`) + the same SQL runs clean when dates are passed as ISO strings. **Fix:** interpolate `from.toISOString()`/`to.toISOString()` (or cast) in the two raw `tx.execute` calls. | **→ propose PL-N (launch-gating: core dashboard 500).** Fix candidate identified. Awaiting Caio: fix now or log+defer. |
| F-02 | J-01 | Confirmed OK | **PL-19 fix live.** Logged-out hit on dashboard `:3001` redirects to `${BETTER_AUTH_URL}/login` = `:3000/login?redirect=%2F` (real web origin), not a hardcoded literal. Static: redirect path derives from `BETTER_AUTH_URL` in `actions.ts:20` + `middleware.ts:18` (only `localhost:3000` literals are the `??` fallback + the `.replace(':3000', …)` source token). | Closed — PL-19 verified. |
| F-03 | J-11 | Bug (to triage) | `GET /api/tenants/{id}/usage/current` → **404** on dashboard home (plan-usage widget). To investigate under J-11 (could be missing route or upstream 404). | Open — revisit in J-11. |
| F-04 | home | Cosmetic | `/favicon.ico` 404 on dashboard. | Low. |
| F-05 | J-03 | UX / scope | **No manual single-lead creation.** `/leads` offers only "+ Importar CSV"; routes are `leads` (list), `leads/import`, `leads/[id]` (detail) — no create form, no `POST /leads`. Leads originate from CSV import or WhatsApp inbound only. J-03 step "create lead" has no UI. May be intentional, but the roadmap step is unsupported. | **Closed — by design (Caio 2026-06-16):** leads come from CSV import + WhatsApp inbound only; no manual-create form is intended. No code change; the J-03 "create lead" step is N/A. |
| F-07 | J-03 | Confirmed (known) | **PL-12 tag dup reproduced.** Two concurrent `POST …/leads/{id}/tags {tag:'corrida'}` both returned 201 with distinct ids → DB `lead_tags` has `corrida` count=2 (no unique constraint, no atomic guard). Sequential UI add dedups in the React list view, but DB-level dupes accumulate via concurrency/API. Matches PL-12. | Confirmed — stays PL-12 (needs DB unique migration). |
| F-08 | J-03 | Confirmed OK | CSV import counts correct (4 imported / 2 dup / 2 errors); malformed `123`/`abc` → errors; in-file dup (same normalized number) ignored; "Baixar relatório de erros" present. Lead detail renders (origem, temperatura, timeline). Status→opt-out gated by a confirm dialog, writes `Opt-out` + timeline event (`origem: manual`) + "Reativar lead". Tag add/remove works. | Closed OK. |
| F-09 | J-04 | Bug (HIGH) — **fixed inline** | **Product create read `tenantId` from `document.cookie`, which is httpOnly → `undefined` → POST to `/api/tenants/undefined/…` → 404.** `produtos/novo/page.tsx` was the only knowledge page that was a client component reading the tenant header via `document.cookie` (every sibling is a server component that reads `requestHeaders.get('x-leedi-tenant-id')` and passes it as a prop). **Fix (committed):** split into server `page.tsx` (resolves tenant like siblings) + `novo-form.tsx` (client, takes `tenantId` prop). | Fixed + verified (product row created, detail renders). |
| F-10 | J-04 | **Bug (HIGH) → PL-N** | **The entire knowledge-base write surface is unwired in the dashboard — no proxy routes exist.** Confirmed bracket-free in git: NONE on `main`, NONE on `HEAD` (pre-existing incomplete work, not a regression). Clients (`produtos/novo`, `faq-client`, `objecoes-client`, `product-detail-client`) `fetch('/api/tenants/{id}/knowledge/…')` (relative → dashboard `:3001`), but `app/api/tenants/[tenantId]/` has **no `knowledge/` dir**, and `next.config` has no rewrites → every call 404s. Listing works (server-side use-cases). Empirically: `knowledge-base` POST 404, `products` PATCH/DELETE 404, `knowledge-base/[id]` PATCH 404. So **FAQ + objections create/edit/delete and product edit/archive are all non-functional** → the agent's knowledge can't be managed via UI. Mock-based unit tests never caught it (codebase's documented blind spot). **Wired this session (committed, verified):** `knowledge/products` POST · `playground/message` POST · `playground/session/[sessionId]` DELETE · `templates` POST + `templates/library` GET + `templates/[id]` PATCH/DELETE · `usage/{current,history}` GET + `usage/settings` PATCH · `billing/{summary,invoices}` GET · `onboarding/{progress,profile,gateway-webhook-url,gateway-confirmed,complete}` · top-level `sales-methods` GET. **Still missing (the F-18 follow-up backlog):** `knowledge/knowledge-base` POST (FAQ/objections create) · `knowledge/knowledge-base/[id]` PATCH+DELETE · `knowledge/products/[id]` PATCH+DELETE (product edit/archive) · `templates/[id]/submit` POST (Meta submit, J-16) · `whatsapp/connect` (J-13) · `inbox/*` (J-15). | **CLOSED with F-18 (commit `f2b1612`, 2026-06-16)** — all remaining knowledge-base/products write proxies wired (`knowledge-base` POST + `[id]` PATCH/DELETE; `products/[id]` PATCH + `material` + `archive`). FAQ + objections create/edit/delete and product edit/archive are now reachable. Runtime browser verification pending dev-env restart (see F-18). |
| F-11 | J-04 | Confirmed OK | **PL-6 product detail renders at runtime.** `/conhecimento/produtos/[id]` renders fully (name, tipo, tabs Dados/Argumentos/Diferenciais/Provas sociais/Garantia/Bônus, all fields, Salvar/Arquivar). The `@/` alias issue was typecheck-only; no runtime break. | Closed — PL-6 verified. |
| F-12 | J-04 | Cosmetic | After a successful product create, `router.push` to the detail page didn't navigate on the first submit (still on `/novo`); row was created. Suspected dev cold-compile timing of the `[id]` route during `router.push`. Low; revisit if it reproduces with warm routes. | Low. |
| F-13 | J-05 / infra | Bug (MED) — **fixed inline** | **DB connection-slot exhaustion** — `/agente/metodo` (and any SSR DB read) 500'd with `PostgresError: remaining connection slots are reserved for roles with the SUPERUSER attribute`. Root cause: `packages/db/src/client.ts` created postgres.js pools with no `idle_timeout` (default = never reap) and default `max:10`. Each of the 4 dev apps (web/dashboard/admin/api) pins up to 10 connections for its lifetime, and Next dev hot-reload orphans the prior module's pool on each recompile → unbounded growth against Supabase's 60-slot cap. Verified: killing the 4 dev servers dropped `pg_stat_activity` from 60 (exhausted) → 12. **Fix (committed):** add `idle_timeout: 20` (+ explicit `max: 10`) to both pools — prod-safe (busy connections stay; idle/orphaned ones release). Mostly a dev-load artifact, but uncapped idle pools are a latent prod risk on restarts/scale. | Fixed + servers restarted; recovered. |
| F-14 | J-06 | Blocker (env) — **RESOLVED** | **Anthropic credit balance was exhausted** → every agent turn failed with Anthropic 400 `invalid_request_error: "Your credit balance is too low…"` (route mapped it to a generic 500; ~27s latency = SDK retries). Caio recharged credits 2026-06-15; agent turns now succeed. | Resolved. |
| F-15 | J-06 | Bug (HIGH) — **fixed inline** | **Playground proxies were missing in the dashboard** (same class as F-10): client `fetch('/api/tenants/{id}/playground/message')` (POST) + `…/playground/session/{id}` (DELETE) → 404; API (`:3003`) has the `/playground` router but the dashboard had no proxy dir. **Fix (committed):** added both proxy routes (verbatim pattern). After the fix the call reaches the API and fails only on F-14 (credits). | Fixed; full verify pending F-14. |
| F-16 | J-06 | **Confirmed OK (full)** | **PL-16 full pass.** After **successful** multi-tool agent turns (credits restored — tools `buscar_historico_lead` + `consultar_base_conhecimento` fired), row counts across leads / lead_journey_events / conversation_windows / usage_counters / agent_threads / agent_messages / agent_tool_calls / messages stayed **identical to baseline** (4/1/0/0/0/0/0/0) — the sandbox creates **zero** real rows. Also cross-validated J-05: the agent honored name "Mari", emojis, SPIN method, and the enabled `consultar_base_conhecimento` tool. `lead_com_objecao` engaged the price objection consultatively (AC#2). "Reiniciar conversa" clears the session (DELETE proxy OK). | **Closed — PL-16 verified end-to-end.** |
| F-17 | J-06 | UX | Agent/LLM failures surface to the user as a bare "Internal Server Error" / "Erro desconhecido" bubble. A clearer "assistente indisponível" message (esp. for billing/rate-limit) would help. | Low. |
| **F-18** | **systemic (J-02/J-07/J-11/J-13/J-15)** | **Bug (HIGH) → PL-N — headline** | **The dashboard→API write-proxy layer is systematically incomplete.** Dashboard client components `fetch('/api/tenants/{id}/…')` (relative, same-origin, so the httpOnly cookie rides along) expecting a Next route handler that forwards to the Hono API — but a large set of those handlers were never built. **Not a regression:** bracket-free `git ls-tree main` shows main only ever had `templates` + `whatsapp` proxies (no billing/usage/onboarding/knowledge/playground/inbox); `git diff main HEAD -- apps/dashboard/app/api` shows **only my 3 additions, zero deletions**. Confirmed live (real status codes): `billing/summary` 404, `billing/invoices` 404, `usage/current` 404, `usage/history` 404, `usage/settings` 404, `onboarding/progress` 404, `templates/library` 404, `templates` POST 405 (proxy exists but GET-only), `whatsapp/connect` 404, plus the earlier `knowledge/*` & `playground/*` 404s. Root cause it survived 20 epics of review: package tests mock the API/driver and never exercise the dashboard↔API HTTP wiring (the codebase's documented fake-green blind spot). **Tier-0 impact:** J-07 (save/edit template), J-11 (usage + billing views) blocked; J-02 (onboarding) also depends on it (was already deferred for Resend). **Tier-1 impact:** J-13 (`whatsapp/connect`), J-15 (`inbox/*`). I wired 3 unblockers inline (`knowledge/products` POST, `playground/message`, `playground/session`); the full layer is **feature work, not a test-fix** — escalated, not built. | **Proxy layer COMPLETED (commit `f2b1612`, 2026-06-16).** All 12 remaining proxies wired (thin same-origin forward of cookie+body to the API, pattern `leads/[id]/tags/route.ts`): `knowledge/knowledge-base` POST + `[id]` PATCH/DELETE (204 guard, mirrors API soft-delete); `knowledge/products/[id]` PATCH + `[id]/material` PATCH + `[id]/archive` PATCH; `templates/[id]/submit` POST + `[id]/duplicate` POST; `whatsapp/connect` POST; `inbox` GET + `[windowId]` GET + `[windowId]/assign` PATCH + `[windowId]/reply` POST. Each upstream path/method verified against `apps/api/src/app.ts` + the route files; dashboard `tsc` clean. **Runtime browser verification PENDING** — the local dev env was wedged at test time (dashboard `:3001/` took 266s, API `/health` 54s; Postgres was idle/healthy so it's Node/machine thrashing, not slot exhaustion → needs a `pnpm dev` restart). Tier-0 flows (FAQ/objeções create-edit-delete, product edit/material/archive, template duplicate, inbox list) to be browser-verified post-restart; Tier-1 (`whatsapp/connect`, `templates/submit`, `inbox/[windowId]`+assign+reply) confirmed-reachable only — full behavior needs Meta/QStash/live conversations. **NOTE:** wiring the inbox proxies does **not** close PL-18 (inbox list SQL + 8s poll-merge runtime verification stays Tier-1). Supersedes F-03; encompasses F-10, F-15. |
| F-19 | J-07 | Bug (MED) — **fixed inline (proxies)** | **Template save/edit/library were unreachable** (part of F-18): `templates` proxy was GET-only → "Salvar rascunho" (POST) **405**; `templates/[id]` (PATCH/DELETE) and `templates/library` (GET) had no proxy → **404**. **Fix (committed):** added POST + `library` + `[id]` proxies. After fix, draft save persists (status=rascunho). | Fixed; builder/coverage UI verified. |
| F-20 | J-07 | Bug (LOW) | **Draft save rejects empty variable examples despite UI saying they're submit-only.** API `CreateTemplateSchema.VariavelSchema` requires `exemplo: z.string().min(1)`, but the UI labels the example inputs "obrigatório **para envio**" → saving a `rascunho` with `{{N}}` vars but blank examples 400s (`expected non-empty`). Filling examples → 201. Contract/UX mismatch: either make `exemplo` optional for drafts or relabel as always-required. Also: the live coverage UI lists present vars but doesn't warn on a non-sequential gap (e.g. `{{1}}`+`{{3}}` without `{{2}}`) — likely only validated at submit (J-16). | **FIXED (commit `4638ae6`, 2026-06-16).** `exemplo` is now optional at create (`z.string().default('')`) so a rascunho saves with blank examples; `submitTemplate` enforces a non-empty example for every variable before the Meta call (clear pt-BR error). Matches the "obrigatório **para envio**" label. +unit test. (The non-sequential `{{N}}` gap warning stays a J-16/Meta-submit concern.) |
| F-21 | J-08 | Confirmed OK | **Campaign lifecycle + terminal guard work.** create (dialog) → activate (`status=ativa`, confirm dialog) → pause (`pausada`) → end (`encerrada`) all succeed. **AC#7 verified:** re-activating an `encerrada` campaign is rejected with **409** + clear message ("Campanha encerrada não pode ser reativada…") — a proper 4xx, **not a 500**. Minor: the end-response serializes the lifecycle field as `fase` while the DB column is `status` (alias, not a bug); the activate proxy had a ~20s cold-compile but succeeded. | Closed OK. |
| F-22 | J-09 | Confirmed OK | **Segment build + preview + rule config work.** Segment "Não compradores" (filtro `{comprou:false}`) previewed **~4 leads** with the correct list, and persisted. Rule builder renders (gatilhos: carrinho abandonado / boleto / PIX / sem resposta 48h / fim de oferta 24h; atraso; ativar) and **correctly gates "Criar regra" disabled** because the "Template (aprovado)" dropdown is empty — rules require an approved template (Meta = J-16/Tier 1). Note: the segment preview includes the opt-out lead (Ana) — expected, since LGPD opt-out exclusion happens at dispatch (J-17), not at preview. Carla's corrupted `+1133334444` (F-06) shows in the dispatch-targets list — reinforces F-06 severity. | Closed OK (rule completion needs an approved template → post-J-16). |
| F-23 | J-10 | **Bug (MED)** | **`/relatorios` sidebar link is dead → 404.** `Sidebar.tsx:40` links `/relatorios` but no `app/(shell)/relatorios/page.tsx` exists; navigating renders Next's "404: This page could not be found." Every user clicking the primary "Relatórios" nav item hits a 404. The analytics already live on the home dashboard (`/`). **Fix options (product/IA call):** remove the sidebar entry, repoint it to `/`, or build a dedicated `/relatorios` page. Not changed unilaterally (nav IA decision). | **FIXED (commit `86f8bfc`, 2026-06-16).** Caio chose **remove**: dropped the `/relatorios` entry (+ unused `BarChart3` import) from `Sidebar.tsx`. Analytics stay on the home dashboard; a dedicated `/relatorios` page is deferred to future work. (UI removal — confirm visually post dev-env restart.) |
| F-24 | J-10 | Confirmed OK | **Analytics render after F-01.** Home dashboard widgets (Conversas iniciadas, Taxa de resposta, Conversões, Valor total, Ticket médio, ROI) resolve to real zero-data values (`sales` 200 `{conversas_iniciadas:0,…}`); "Objeções mais frequentes" empty-state renders (`objections` 200 `{items:[],total:0}`); connection-health + active-campaign 200. (The accessibility snapshot's transient "…" is the pre-fetch loading placeholder; DOM confirms "0".) Meaningful values need Tier-1 data. **"Uso do plano" widget shows "Dados de uso indisponíveis"** — the `usage/current` 404 from F-18. | Analytics OK; usage widget blocked by F-18. |
| F-25 | J-11 | Confirmed OK / fixed | **Settings verified.** Notifications: the **"Qualidade do número caindo" toggle maps to the correct signal** — toggling Push off persisted `eventos.quality_caindo.push=false` (Epic 18 fix confirmed). Usage + billing views were blocked by F-18 (no proxies); I added usage/{current,history,settings} + billing/{summary,invoices} proxies → **usage view renders and the overage "Bloquear ao atingir limite" toggle persists** (Epic 16, round-trips via PATCH); **billing view renders** ("Nenhuma assinatura…" empty state; subscriptions need Tier 2). `/settings/whatsapp` (connect form) and `/settings/team` (members + invite) render; team invite needs email (Resend / J-01 decision). **No dead links** in `/configuracoes/*` or `/settings/*` (Epic 16 fixes hold). Also recovers the home "Uso do plano" widget (F-18). | Closed OK; usage/billing proxies committed. |
| F-26 | J-12 | Bug (HIGH) — **fixed inline** | **Operacional super-admin dashboard 500s for every load.** `getOperationalHealth` interpolated `NEAR_LIMIT_THRESHOLD` (0.8) into raw SQL as `uc.conversas_limite * ${0.8}`; Postgres infers the bound param as **integer** (from `integer * $1`), so postgres.js sending `"0.8"` failed with `22P02 invalid input syntax for type integer: "0.8"` — data-independent (bind fails pre-execution). Same mock-blind class as F-01. **Fix (committed):** `uc.conversas_limite::numeric * ${…}` → param inferred numeric. Verified /operacional renders. | Fixed + verified. |
| F-27 | J-12 | Confirmed OK | **Super-admin guard + Clientes/Financeiro dashboards + block/unblock + audit all work.** Non-super-admin (owner session) is blocked from `:3002`; super-admin enters. Clientes lists tenants; **block** requires a reason (min 10 chars), writes `audit_logs` (`acao: manual_block`, actor + `detalhes.reason`), and flips `status=blocked`; **unblock** ("Liberar") restores `status=active`. Financeiro renders (MRR/recebíveis/churn/inadimplência, zero-data). ADMIN badge + "Super Admin" label present. | Closed OK. |
| F-28 | J-12 | **Bug (MED) — FIXED** | **Admin app redirected unauthorized/unauthenticated to a non-existent `/login` → 404.** `apps/admin/app/(shell)/layout.tsx` did `redirect("/login")` for both no-session and non-super-admin, but the admin app has no `/login` page (and no middleware) → `:3002/login` 404'd. **Fix (committed):** split the two branches by semantics — **no-session** → `redirect(new URL("/login", env.BETTER_AUTH_URL))` (the real web login on `:3000`); **authenticated non-super-admin** → `redirect("/403")` (the in-app forbidden page, which exists). Updated the stale `guard.spec.ts` doc comment. **Verified in browser (both branches):** anonymous `:3002/` → `:3000/login`; owner (non-super-admin) session `:3002/` → `/403` page renders (heading "403" + "Você não tem permissão…"); super-admin enters normally. The unauthenticated e2e assertion (`location` contains `/login`) still holds. | **Fixed + verified end-to-end.** |
| F-29 | J-12 / J-01 / global | **Bug (MED) — user-reported — FIXED** | **Logout was missing or broken everywhere.** The dashboard (`:3001`) and super-admin (`:3002`) shells exposed **no** sign-out affordance; the onboarding shell's "Sair" was a **relative** `<a href="/api/auth/sign-out">` → `:3001/...` **404** (the Better-Auth handler lives on web `:3000`, and sign-out is a POST). **Fix (committed):** the dashboard already had a correct `logoutAction` (`app/actions.ts`: `logoutUser` → `redirect(\`${BETTER_AUTH_URL}/login\`)`) but nothing wired to it — added a "Sair" button (`<form action={logoutAction}>` + `LogOut` icon) to the dashboard `Header.tsx`; created an identical `apps/admin/app/actions.ts` + "Sair" button in `AdminHeader.tsx`; replaced the broken onboarding `<a>` with the same server-action form. **Verified in browser on all 3 surfaces:** click "Sair" → session destroyed (post-logout API calls 401) → lands on `:3000/login`; re-navigating to a protected route then redirects back to login (cookie cleared durably, host-scoped across ports as expected). **Minor (local-only):** the cross-origin server-action `redirect()` to `:3000` makes Next attempt an RSC fetch that's CORS-blocked, then **falls back to a full browser navigation** (works, but adds console noise + a couple seconds in multi-origin dev); behind a single production origin (reverse proxy) this won't occur. | **Fixed + verified end-to-end.** |
| F-30 | J-12 | Bug (LOW) | **Impersonation list-vs-scope mismatch.** The Clientes list shows "Impersonar" for every tenant, but `startImpersonation` is workspace-scoped and rejects tenants outside the actor's workspace → `403 "Tenant não encontrado neste workspace"`, surfaced as a generic "Não foi possível iniciar a impersonação" alert. Locally the happy path is untestable because the E2E admin seed puts the super-admin in an **empty** workspace (`…-101`) while all seeded tenants live elsewhere — partly a seed artifact, but the list (cross-workspace) vs impersonate (same-workspace) scoping disagreement is real. Block, by contrast, succeeded cross-workspace — so block and impersonate apply different scoping. PL-10 full validation stays staging-only. | **FIXED + browser-verified (commit `6b8b3c0`, 2026-06-16).** Root cause is deeper than a seed artifact: self-serve signup (F-31) gives **every tenant its own workspace**, so a tenant NEVER shares the super-admin's workspace (DB: 15 workspaces / 7 tenants, none in the admin's ws) → the same-workspace gate made impersonation impossible for any real super-admin. Reconciled to **platform-wide** (super_admin impersonates ANY tenant, like the global list + cross-workspace block): dropped the `tenant.workspaceId === admin.workspaceId` gate in BOTH `start-impersonation.ts` and `api/middleware/impersonation.ts` (kept the existence check; audit `workspace_id` stays the actor's, mirroring `blockTenant`). Also made `getCurrentTenantContext` impersonation-aware (synthesizes an owner-role context from the cookies) so pages on the shared helper render. **Verified e2e:** super_admin impersonated a cross-workspace tenant → banner renders, **no 403**; `/settings/uso` (`requireTenantRouteAccess`) **rendered** under impersonation (was `/403`). Inverted unit tests + new tenant-context tests, all green, typecheck clean. **KNOWN LIMITATION → PL-10 (broader than the prior `/settings/*` note):** 33 dashboard content pages re-implement `listUserTenants(session.user.id)+header` inline, so under impersonation they read the super-admin's (empty) memberships and still show "Nenhum workspace encontrado". Proven NOT a tenant-health/onboarding-inheritance issue: the impersonated tenant (Academia Teste J-02) is a post-F-31, fully-onboarded healthy tenant (status active, onboarding_completed, workspace + owner membership) and the SAME tenant rendered on `/settings/uso` but not on the inline home page. Full dashboard render under impersonation = route those 33 pages through the shared helper (deferred — pre-existing, LOW, and impersonation's auditable-write point only validates in staging anyway). |
| **F-31** | **J-02 (+J-01)** | **Bug (CRITICAL) — FIXED** | **[FIXED]** Self-serve signup never provisioned a tenant — a new customer was permanently stuck. `registerUser` (`packages/auth/src/use-cases/register-user.ts`) only calls `auth.api.signUpEmail` → creates the `users`+`accounts` rows but **no workspace, tenant, or membership**. There is no `databaseHooks` after-create in `auth.ts` and no self-serve provisioning use-case (`createTenant` is the *super-admin* flow: needs an existing `workspaceId` + invites the owner by email — wrong shape for self-signup). Verified end-to-end: registered `caiog.pereira+leedi-j01@gmail.com` → real Resend email (from `noreply@leedi.digital` ✅) → verified (`email_verified=true`) → login → dashboard AND `/onboarding` both show **"Nenhum workspace encontrado"**; `memberships` for the user = **0 rows**. So **J-02 (onboarding wizard) is untestable** — there's no trial tenant to onboard. Epic 19's "tenant default 'trial' → AC#1" was almost certainly mock-verified (fake-green). **Fix (design needed):** add self-serve provisioning (new workspace + `status:'trial'` tenant + `owner` membership) on signup — via a better-auth `databaseHooks.user.create.after` or synchronously in `registerUser` after `signUpEmail` (decide: provision at signup vs after email-verification to avoid orphan tenants for unverified emails). **Fix (committed):** `provisionSelfServeTenant` (workspace + trial tenant + owner membership, idempotent) wired into Better-Auth's `afterEmailVerification` hook (Caio chose after-verification → no orphans). Verified end-to-end: fresh register → real email → verify → tenant auto-created → login lands on /onboarding → full wizard → trial→active. | **Fixed + verified end-to-end.** |
| F-33 | J-02 | Confirmed OK / fixed | **Onboarding wizard works end-to-end** (after F-31 + new proxies). 5 steps: Empresa (profile PATCH), WhatsApp (Tier 1 — see F-34), Gateway (Hotmart, "Pular por enquanto"), Agente (name + sales method — needs the new `/api/sales-methods` proxy; agent test turn replies on-method), Teste (mini-playground → "Concluir configuração"). Final confirm ("Tudo pronto!") drives the tenant **trial→active** (`onboarding_completed=true`) and lands on the dashboard. **Missing proxies built this session:** `onboarding/{progress(GET+PATCH),profile,gateway-webhook-url,gateway-confirmed,complete}` + top-level `sales-methods` (all were 404 — F-18 class). **PL-14:** `gateway-webhook-url` returns `{url:null}` until the gateway integration is configured, so the `:3000`-embed risk isn't observable in a fresh onboarding (revisit when a gateway is wired). | Closed OK (proxies committed). |
| F-34 | J-02 | **Bug (MED)** | **The onboarding WhatsApp step (step 2) has no skip — it hard-blocks the whole wizard for any user without Meta credentials ready.** "Próximo" stays disabled until a successful `connectResult`; there is no "Pular por enquanto" (which step 3 Gateway *does* have). So a fresh Tier-0/self-serve user who hasn't set up Meta Cloud API cannot finish onboarding or reach the app at all. (Tested steps 3–5 by advancing `progress` via the API past step 2.) Either add a skip ("conectar depois") or make WhatsApp non-blocking in onboarding. | **FIXED (commit `3c3dc98`, 2026-06-16).** Added a "Pular por enquanto" link to step 2, mirroring the Gateway step (`handleSkip` PATCHes progress `{skipped:true}` → `onAdvance(3, 2)`). A self-serve user without Meta credentials can now finish onboarding and connect the number later in `/settings/whatsapp`. (UI — confirm in browser post dev-env restart.) |
| F-32 | J-01 | Confirmed OK (real email) | **Auth flow works end-to-end with the verified Resend domain.** Register → real verification email from **`noreply@leedi.digital`** (rendered cleanly; link is a self-contained JWT, `callbackURL=/login`) → `email_verified=true` → login OK. Forgot-password shows a privacy-preserving message ("Se este e-mail estiver cadastrado…"), sends a real reset email (60-min link) → reset form → **new password works** (re-login confirmed). PL-19 redirect verified at session start (F-02). Emails read via Gmail MCP on `caiog.pereira+leedi-j01@gmail.com`. **Gaps:** logout broken (F-29), forbidden→/403 actually lands on /login (F-28), and the account has no tenant (F-31). | J-01 closed (with F-29/F-28/F-31 caveats). |
| F-06 | J-03 | **Bug (MED)** | **10-digit BR landline normalizes to a `+1` (NANP) number — silent corruption.** Confirms deferred Epic 5 F5 but sharper: `normalizeToE164` (`apps/api/src/utils/parse-leads-csv.ts:65`) has branches for 11-digit (→`+55`), 12/13-digit-starting-55 (→`+`), and a catch-all `else { +${digits} }`. A 10-digit landline `1133334444` hits the catch-all → `+1133334444`, passes `E164_RE /^\+\d{10,15}$/`, and reads as **+1 (US/Canada) 133334444** — wrong country, could dispatch to the wrong destination. Verified in DB: Carla's lead stored as `+1133334444` while `2199…`/`1198…` correctly became `+55…`. **Fix candidate:** add `if (digits.length === 10 && !digits.startsWith('55')) candidate = '+55'+digits;` (BR DDD+8 landline) **or** reject 10-digit as ambiguous — product policy call. Not fixed inline (touches dispatch correctness + policy). | **FIXED (commit `3ccd839`, 2026-06-16).** Caio chose accept-as-`+55`: added a 10-digit branch (`digits.length===10 && !startsWith('55')` → `+55${digits}`) before the catch-all in `normalizeToE164`. `1133334444` → `+551133334444` (BR), no longer `+1…`. +unit test. |

| F-35 | T-2 setup / infra | **Blocker (env) — FIXED** | **Local DB unreachable: Supabase direct connection is IPv6-only.** `DATABASE_URL` pointed at `db.<ref>.supabase.co:5432`, which resolves to **only an AAAA (IPv6) record**; this machine has no IPv6 route (`ping -6` fails) → `connect ETIMEDOUT` on every DB query (admin `getSession` 500, API `/api/sales-methods` 500). Supabase MCP was unaffected (it goes via the API, not the DB socket), masking it. **Fix:** switched `DATABASE_URL` to the **Supavisor Session pooler** (IPv4): `postgresql://postgres.<ref>:<pw>@aws-1-us-west-2.pooler.supabase.com:5432/postgres` (note `aws-1`, not the stale `aws-0` in the old commented `APP_DATABASE_URL`; user `postgres.<ref>`; port 5432 = session mode, drop-in for prepared statements). After restart, DB-backed routes → 200. **Prod note:** the deployed app must also use the pooler (or have IPv6) — direct host won't work from IPv4-only hosts. | Fixed + verified (200). |
| F-36 | T-2 setup / J-20 | **Blocker (config) — FIXED** | **QStash publish failed for every site: token is in the US region, SDK defaulted to EU.** `new Client({ token })` (~13 sites) with no `baseUrl` hits `https://qstash.upstash.io` → routes to `eu-central-1` → `404 {"error":"user (…) not found in this region (eu-central-1)"}`. Never caught before because J-14 (the only prior QStash exerciser) is Meta-blocked, so no publish had ever run. Verified the token works against `https://qstash-us-east-1.upstash.io` (→ 201). **Fix:** set `QSTASH_URL=https://qstash-us-east-1.upstash.io` in `.env` — the `@upstash/qstash` Client reads `QSTASH_URL` from `process.env` when no `baseUrl` is passed (SDK chunk-LB3C5PJP line 1027: `config?.baseUrl ?? defaultCreds.QSTASH_URL ?? DEFAULT_QSTASH_URL`), so **no code change** across the 13 sites. ⚠️ **Corrects a prior assumption** (`project_tier1_pl14_fix` note "QSTASH_URL não é necessário") — it IS necessary for a US-region token. Signing keys in `.env` are the US ones (callback `Receiver.verify` passed). | Fixed + verified (synthetic flow created invoice end-to-end). |
| F-37 | J-20 | **Bug (config) — FIXED** | **Real Asaas webhooks 400'd because the webhook was created as apiVersion 2.** Asaas apiVersion **2** (UA `Asaas_Hmlg/2.0`) delivers `application/x-www-form-urlencoded; charset=UTF-8` with the event JSON wrapped in a `data=<urlencoded-json>` field **and sends NO `asaas-access-token` header**. The handler (`asaas.ts`, built for apiVersion **3** per Epic 17 = `application/json` body + token in `asaas-access-token` header) ran `c.req.json()` on the form body → **400** → Asaas counted it failed (`penalizedRequestsCount++`). Synthetic POSTs passed because they mimicked v3 (JSON + header). **Root-caused by top-of-handler instrumentation** logging raw body + headers (reverted after). **Fix:** recreated the Asaas sandbox webhook with **apiVersion 3** + `authToken` (Asaas API `POST /webhooks`, then deleted the v2 one). Verified end-to-end: real `PAYMENT_RECEIVED` (UA `Asaas_Hmlg/3.0`, `application/json`, header `asaas-access-token=…`) → token OK → QStash(US) → callback → **invoice `pago` + subscription `ativa`** (DB-confirmed). **⚠️ RED HERRING corrected:** earlier I diagnosed a Cloudflare edge 403 — WRONG. The 403 was Cloudflare's **"Manage AI bots"** managed rule blocking only my **WebFetch** probe (UA `Claude-User`, an AI crawler); it never touched Asaas (whose deliveries don't appear in the CF security-events log at all). The `cf-warp-tag-id` header is the cloudflared tunnel's own tag added to every proxied request, **not** a WARP-vs-public path difference. Cloudflare was never blocking the webhook. **Prod note:** the production Asaas webhook MUST be apiVersion 3, or the handler must be hardened to also accept the v2 form-urlencoded `data=` format (defense-in-depth — candidate PL). | **FIXED + verified** (real delivery → invoice `pago`). |
| **F-39** | **J-21 (+J-22 Tier-3)** | **Bug (CRITICAL) — FIXED + live-proven** | **The daily billing lockdown never blocked anyone — `.rows` read off a `postgres-js` result that is a bare array.** `@leedi/db` uses `drizzle-orm/postgres-js` (`client.ts:2`), whose `tx.execute(sql\`SELECT…\`)` resolves the rows **directly as an array** (a `RowList`), NOT a `{ rows }` object (that's the node-postgres shape). `daily-billing-check.ts:40` did `const rows = (overdueRows as …{ rows }).rows ?? []` → `.rows` is `undefined` → `rows = []` → `checked:0, blocked:0` for **every** run, so an overdue tenant was **never** suspended (Story 17.2 AC#4/#5 dead in prod). **Proven empirically, not by reasoning:** seeded the test tenant overdue (invoice `atrasado`, vencimento −8d, sub `atrasada`) and fired the **real** signed QStash daily-check → endpoint returned **200 but the tenant stayed `active`**; after the fix the same live QStash call flipped it to `blocked` (the 200-but-no-effect → blocked transition is the decisive evidence, and it also proves the bare-array driver shape). **Fake-green root cause** (same class as F-01/F-18/F-26): the unit test mocked `execute` returning `{ rows: state.overdueRows }` — a shape the real driver never produces — so 4 green tests masked a dead money-path. **Repo-wide grep for the same misread found 2 siblings**, both reading `.rows` off a `tx.execute` SELECT (also fake-greened by `{rows}` mocks), both Tier-3 (not yet live-tested): `gateway/handle-recovery-event.ts:146` (`.rows.length` threw → caught by the best-effort try/catch → **recovery dispatch silently never fired**, Story 13.3) and `webhooks/hotmart.ts:110` (`.rows.length` **threw** → Hotmart dedup check crashed). **Fix:** defensive `Array.isArray(r) ? r : (r.rows ?? [])` read in all 3 + corrected the 3 test mocks to the real array shape (so they now genuinely guard). api 226/226, typecheck clean. daily-check **live-verified**; the 2 Tier-3 siblings are fixed by the identical pattern the live run validated, but await browser/live verification at **J-22** (Hotmart) / gateway recovery. | **FIXED.** daily-check live-proven (overdue → `blocked`); siblings fixed, Tier-3 live-verify deferred to J-22. |
| F-38 | J-20 | **Bug (MED) → PL candidate** | **Asaas webhook dedup key is payment-id-only, not (payment-id + event).** `webhook:asaas:${paymentId}` with 24h TTL (`asaas.ts:48`): the first event for a payment sets it; any **distinct** later lifecycle event for the **same** payment within 24h hits `!set` → returns 200 **without enqueuing** → silently dropped. For BOLETO (CREATED→RECEIVED days apart) the TTL expires first, so low impact; but for **PIX/credit-card**, `PAYMENT_CREATED` and `PAYMENT_RECEIVED` land seconds apart → the RECEIVED is dropped → invoice never marked `pago`, tenant never unblocked. The durable idempotency (UNIQUE `asaas_payment_id` + ON CONFLICT) is invoice-creation only; it does not cover the dropped status transition. Surfaced during testing (my synthetic CREATED masked a real RECEIVED). **Fix candidate:** key the dedup on `${paymentId}:${event}` (or drop the Redis dedup and rely on the durable guard + idempotent handlers). | **FIXED (commit `a9fbdef`, 2026-06-18).** Dedup key is now `webhook:asaas:${paymentId}:${event}` (event-scoped; defaults to `unknown` if the event field is absent), so distinct lifecycle events for the same payment within 24h each enqueue — PIX/card CREATED+RECEIVED no longer drop the RECEIVED. +regression test proving CREATED then RECEIVED for the same payment-id both publish (api 227/227, tsc clean). Pure key-string logic, fully unit-pinned (no driver/live dependency). |

### Pre-identified to confirm (found while writing this roadmap)
- **`/relatorios` sidebar link** (J-10): `Sidebar.tsx:40` links to `/relatorios` but no `app/(shell)/relatorios/page.tsx` exists — suspected dead link. Confirm + fix or repoint.

---

## How to keep this current
1. Update each journey's **Status** as we run it.
2. Log every observation in **§Findings log** immediately.
3. When a finding is launch-gating, give it a `PL-N` and add it to `pendencias-pre-launch.md`
   (this doc stays the *testing* record; that one stays the *launch gate*).
4. Expand Setup runbooks 1–3 to full step-by-step when we reach each tier.
