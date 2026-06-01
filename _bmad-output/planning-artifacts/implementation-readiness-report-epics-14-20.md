---
stepsCompleted:
  [
    'step-01-document-discovery',
    'step-02-prd-analysis',
    'step-03-epic-coverage-validation',
    'step-04-ux-alignment',
    'step-05-epic-quality-review',
  ]
documentsIncluded:
  - docs/02-leedi-prd.md
  - docs/01-leedi-arquitetura.md
  - _bmad-output/planning-artifacts/epics.md
  - All story files for Epics 14-20
scope: Epics 14-20 coherence check (PRD + Architecture + Story files)
---

# Implementation Readiness Assessment Report — Epics 14–20

**Date:** 2026-06-01
**Scope:** Epics 14–20 — PRD / Architecture / Story file coherence analysis
**Migration state at analysis:** 5 migrations exist (0000–0004), covering Epics 1–4.

---

## Overall Verdict: CONDITIONALLY READY

Stories for Epics 14–20 are well-structured and largely coherent with the PRD and Architecture. AC quality is high, Dev Notes are specific, cross-epic dependencies are acknowledged. However **2 critical gaps** and **5 medium issues** must be resolved before these stories go to development.

---

## Story Files Analyzed

| Epic | Stories | Status |
|------|---------|--------|
| Epic 14 — Human Inbox & Handoff           | 14.1, 14.2, 14.3       | All found |
| Epic 15 — Tenant Analytics Dashboard      | 15.1, 15.2, 15.3       | All found |
| Epic 16 — Usage Metering & Overage        | 16.1, 16.2, 16.3       | All found |
| Epic 17 — Billing & Subscription Mgmt     | 17.1, 17.2, 17.3       | All found |
| Epic 18 — Notifications                   | 18.1, 18.2             | All found |
| Epic 19 — Assisted Onboarding Wizard      | 19.1, 19.2, 19.3, 19.4 | All found |
| Epic 20 — Super-Admin Financial Dashboard | 20.1, 20.2, 20.3       | All found |

---

## FR Coverage Check

| FR Range    | Epic | Coverage Status |
|-------------|------|-----------------|
| FR79–FR86   | 14   | Complete |
| FR113–FR122 | 15   | FR120 (usage widget) intentionally deferred to Epic 16 Story 16.2 — acceptable |
| FR103–FR108 | 16   | Complete |
| FR98–FR102  | 17   | Complete |
| FR109–FR112 | 18   | Complete |
| FR10–FR16   | 19   | FR11 partial — custom colors unimplemented (see M2) |
| FR123–FR138 | 20   | FR138 task missing from Story 20.2 (see M4); FR129 net growth uncomputed (see M5) |

---

## CRITICAL FINDINGS

### C1 — Missing Meta quality rating webhook handler

**No story creates a handler for Meta quality update webhooks.**

Story 18.2 references `packages/connection/src/use-cases/handle-quality-webhook.ts`. Story 20.3 queries `connections.quality_rating`. Story 15.3 displays it. But `whatsapp_connections.quality_rating` is NEVER written after initial connection (Story 4.1/4.2). No story handles Meta `WABA_INFO_UPDATE` or `PHONE_NUMBER_QUALITY_UPDATE` events.

**Blocked by this gap:** NFR6 (dispatch pause on quality drop), Story 15.3 (number health widget always stale), Story 18.2 event `quality_caindo` never fires, Story 20.3 quality risk signal list never updates.

**Fix required:** Add sub-tasks to Story 4.4 or create Story 4.6:
1. Handle quality update webhook events at `/webhook/meta`.
2. Update `whatsapp_connections.quality_rating` and `messaging_tier` from event data.
3. On quality drop, call `notification.send({ tipo: 'quality_caindo', ... })`.
4. If quality reaches `red`, pause active dispatches (NFR6).

---

### C2 — Stories 17.1 and 18.1 have stale hardcoded migration numbers

**Story 17.1 hardcodes `0005_billing_schema.sql`. Story 18.1 hardcodes `0006_notifications_schema.sql`.**

Verified from `packages/db/migrations/meta/_journal.json`: current last entry is `0004`. Epics 5–16 will add approximately 8–10 more migrations before Epic 17. At implementation time, billing schema will be ~migration 0013 and notifications ~0014.

Story 14.1 already warns correctly: "Check migration numbering — use next available (likely 0014)." Stories 17.1 and 18.1 lack this guard and have concrete wrong names. Following them literally will conflict with earlier migrations.

**Fix required:** In Stories 17.1 and 18.1 Task 1, remove the hardcoded filename (e.g., `0005_billing_schema.sql`) and replace with: "Name the migration using the next available index from `packages/db/migrations/meta/_journal.json`."

---

## MEDIUM FINDINGS

### M1 — Story 7.5 does not record objection journey events; Story 15.2 depends on them

Story 15.2 (Objection Analytics) aggregates `lead_journey_events WHERE tipo='objecao'`. Story 15.2 Dev Notes say Story 7.5 (`consultar_base_conhecimento` tool) "should record" these events. But Story 7.5 has NO AC and NO Task creating them.

If Story 7.5 is implemented as written, Story 15.2 will have zero data to aggregate.

**Fix:** Add to Story 7.5 Task list: "After `consultar_base_conhecimento` returns a matching counter, insert a `lead_journey_events` entry: `{ tipo: 'objecao', detalhes: { categoria, texto_objecao, contorno_usado } }`."

---

### M2 — FR11 custom colors not implemented in Story 19.2

PRD FR11: "Step 1 — Company name, logo, segment, **optional custom colors**."
Story 19.2 covers name, logo URL, and segment only. Custom colors have no AC, no task, no Dev Note in any story.

**Fix:** Either (a) add a color picker field to Story 19.2 Step 1 that overrides the primary indigo token per tenant, or (b) explicitly mark "optional custom colors" as deferred to V1.5 in epics.md to formally close the FR gap.

---

### M3 — Story 16.3 AC#4 contradicts Dev Notes on overage notification trigger

**AC#4 says:** "When `overage_conversas` crosses a multiple of 100 (100, 200, 300 conversations)…"

**Dev Notes correctly say:** "Fire when `overage_valor` crosses multiples of R$100. At R$0.30/conv, 100 conversations = R$30 — not R$100."

FR107 says "notify each R$100 overage." The Dev Notes interpretation is correct. The AC is wrong and will mislead the developer.

**Fix:** Rewrite AC#4 to: "When `overage_valor` crosses a multiple of R$100.00 (R$100, R$200, R$300...), a notification fires via the `@leedi/notification` stub." Remove the "multiple of 100 conversations" language.

---

### M4 — FR138 financial history per tenant missing from Story 20.2 Task list

FR138 ("Financial history per tenant") is assigned to Epic 20. Story 20.2 claims FR138 coverage. But the implementation (`GET /api/admin/tenants/:tenantId/invoices` endpoint + Sheet panel) only appears as a parenthetical suggestion in Dev Notes — it has no formal Task entry.

**Fix:** Add Task to Story 20.2: "`GET /api/admin/tenants/:tenantId/invoices` — returns last 12 invoices for a tenant. RBAC: `requireWorkspaceAdmin()`. Renders as a shadcn/ui Sheet panel on tenant row click in the Clientes table."

---

### M5 — FR129 "net growth" metric not computed anywhere

PRD FR129: "New tenants count **and net growth** for period."
- Story 20.3 delivers new tenant count.
- Story 20.1 delivers churn count.
- Neither computes `net_growth = new_tenants - churn_this_month`.

**Fix:** Add `net_growth` field to Story 20.3 aggregate KPI query (`net_growth = new_tenants_this_month - churn_this_month`) and add a "Crescimento líquido" card to the Operacional page. Both values are already queried — they just need to be combined.

---

## LOW FINDINGS

| ID | Description | Action |
|----|-------------|--------|
| L1 | Story 17.3 doesn't distinguish partial (3-day) vs. full (7-day) block banner messages, as promised in 17.2 Dev Notes. Minor UX gap. | Optional improvement |
| L2 | 8s polling in Stories 14.1/14.2 documented as V0 tech debt; Supabase Realtime upgrade path noted. | No action needed |
| L3 | Story 19.1 leaves session extension approach for `onboarding_completed` undefined. Recommend per-request DB read in middleware (not session token extension). | Clarify in story Dev Notes |
| L4 | Story 20.2 "do not block last workspace_admin" note is confusing since block action is tenant-scoped, not user-scoped. | Clarify the edge case |
| L5 | Story 17.2 references `apps/api/src/jobs/index.ts` — verify Epic 13 creates this BullMQ bootstrap file before Epic 17. | Verify during Epic 17 kickoff |

---

## Dependency Risk: Epic 16 vs. Epic 17

Story 16.1 reads `subscriptions.plano` to resolve `conversas_limite`. The `subscriptions` table is created in Epic 17.1 — which runs after Epic 16.

**Resolution (already in Dev Notes):** Story 16.1 stores plan limits as constants in `PLAN_LIMITS = { starter: 500, pro: 2000, enterprise: 10000 }` — not from the DB. No action needed. Confirm developer follows Dev Notes.

---

## Actions Summary

| Priority | Action | Target |
|----------|--------|--------|
| Before Epic 14 dev | Add Meta quality webhook handler | Story 4.4 (new sub-tasks) or new Story 4.6 |
| Before Epic 14 dev | Add objection journey event recording | Story 7.5 task list |
| Before Epic 16 dev | Fix AC#4 to R$100 value threshold | Story 16.3 AC#4 |
| Before Epic 17 dev | Remove hardcoded migration filenames | Stories 17.1, 18.1 Task 1 |
| Before Epic 19 dev | Clarify custom colors — V1 or defer | Story 19.2 + epics.md FR11 |
| Before Epic 20 dev | Add FR138 formal task | Story 20.2 Tasks |
| Before Epic 20 dev | Add net growth KPI | Story 20.3 API + UI |
