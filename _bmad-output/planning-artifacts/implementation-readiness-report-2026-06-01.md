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
  - docs/03-leedi-execucao.md
  - All story files for Epics 5, 6, 7, 11, 12, and 13
scope: Epics 5–7 + Epics 11–13 coherence check (PRD + Architecture + Story files)
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-01
**Project:** leedi
**Scope:** Epics 5–7 — PRD / Architecture / Story file coherence analysis
**Reviewer:** BMAD Implementation Readiness Skill

---

## Document Inventory

| Document Type       | Location                                   | Status      |
|---------------------|--------------------------------------------|-------------|
| **PRD**             | `docs/02-leedi-prd.md`                     | ✅ Found    |
| **Architecture**    | `docs/01-leedi-arquitetura.md`             | ✅ Found    |
| **Epics & Stories** | `_bmad-output/planning-artifacts/epics.md` | ✅ Found    |
| **UX Design**       | (embedded in PRD/Epics)                    | ⚠️ Separate doc not found |

### Story Files Analyzed

| Epic | Stories | Status |
|------|---------|--------|
| Epic 5 — Lead Management & Conversation Tracking | 5.1, 5.2, 5.3, 5.4, 5.5 | ✅ All found |
| Epic 6 — Product Knowledge Base & Sales Methods  | 6.1, 6.2, 6.3, 6.4       | ✅ All found |
| Epic 7 — Intelligent Sales Agent                 | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8 | ✅ All found |

---

## FR Coverage — Epics 5, 6 and 7

All FRs assigned to Epics 5–7 in the coverage map are accounted for in the story files:

| FR Range | Epic | Coverage |
|----------|------|----------|
| FR87–FR91 | Epic 5 | ✅ Stories 5.1–5.4 |
| FR41–FR47, FR53–FR55 | Epic 6 | ✅ Stories 6.1–6.4 |
| FR24–FR40 | Epic 7 | ✅ Stories 7.1–7.8 |
| NFR7, NFR8, NFR9 | Epic 7 | ✅ Stories 7.2, 7.8 |
| NFR10 (LGPD) | Epic 5 | ✅ Story 5.4 |

**FR coverage: 100% for epics 5–7 scope. No missing FRs in the coverage map.**

---

## UX Alignment

- All UX-DR requirements (UX-DR1–UX-DR9) are assigned to Epic 3 (completed).
- Epics 5–7 do not introduce new UX requirements beyond those covered by Epic 3's design system.
- The `AIAssistedTextarea` component (UX-DR3) is referenced correctly in Stories 6.2, 6.3, 6.4, and 7.1.
- Dark/light theme and WCAG AA are inherited from Epic 3. No new gaps.

**UX alignment: ✅ No gaps for Epics 5–7.**

---

## Findings — Coherence Issues

The findings below are the result of cross-referencing each story file against the PRD requirements, Architecture decisions, and epics.md definitions.

---

### 🔴 CRITICAL — Must fix before devving these stories

---

#### CRITICAL-1: Migration numbering conflict between Stories 5.5 and 6.1

**Location:** `5-5-conversation-window-tracking.md` and `6-1-product-catalog-crud.md`

**Problem:** Both stories claim migration number `0006`:
- Story 5.5 Dev Notes: *"Generate the next sequential migration (currently `0006`)"*
- Story 6.1 Dev Notes: *"Generate migration `0006_knowledge_schema.sql` via Drizzle Kit"*

The correct sequence is:
| # | Story | Migration |
|---|-------|-----------|
| 0004 | Epic 4 (existing) | `0004_add_messages_table` |
| 0005 | Story 5.1 | `0005_lead_schema` |
| **0006** | **Story 5.5** | **`0006_messaging_schema` (conversation_windows, partitioned messages)** |
| **0007** | **Story 6.1** | **`0007_knowledge_schema` (products, knowledge_base)** — story says `0006` ❌ |
| **0008** | **Story 6.4** | **`0008_sales_methods`** — story says `0007` ❌ |
| **0009** | **Story 7.1** | **`0009_agent_schema` (agent_configs + agent-memory tables)** — story says `0008` ❌ |

**Impact:** If implemented as written, Story 6.1 will collide with Story 5.5 at the Drizzle migration runner level, causing a complete deployment failure.

**Fix required:** Update the Dev Notes in stories **6.1** (→ `0007`), **6.4** (→ `0008`), and **7.1** (→ `0009`). The journal `_journal.json` must reflect the correct sequence.

---

#### CRITICAL-2: Architecture domain violation — `@leedi/knowledge` package is missing

**Location:** `6-1-product-catalog-crud.md`, `6-2-sales-arguments.md`, `6-3-faq-objection.md`

**Problem:** The Architecture defines `packages/knowledge/` as a first-class domain package:
> *"packages/knowledge/ — Domínio: produtos, argumentos, objeções, FAQ, base de conhecimento"*

And the core architectural principle:
> *"A camada de API é fina — recebe requisição, chama caso de uso, devolve resposta"*
> *"Tudo que escreve no banco passa por um caso de uso"*

However, Story 6.1 puts all CRUD use cases in `apps/api/src/use-cases/knowledge/` instead of in a proper domain package. Epic 5 (Leads) correctly creates `@leedi/leads`. Epic 7 (Agent) correctly creates `@leedi/agent`. Epic 6 is the outlier — no `@leedi/knowledge` package is created.

Additionally, Story 6.1 puts the agent-tool use case (`getActiveOffers`) inside `packages/db/src/use-cases/knowledge/`, which is also wrong — `packages/db` is the data-access layer, not a domain package. Business logic should not live in `packages/db`.

**Impact:** This violates the domain-isolation contract. Knowledge domain logic will be scattered between `apps/api` and `packages/db`, making it impossible to test in isolation and breaking the architectural boundary that prevents the rest of the system from depending on implementation details.

**Fix required:** Create `packages/knowledge/` with the standard domain structure. Move all knowledge use cases (including `getActiveOffers`) there. Story 6.1, 6.2, and 6.3 tasks must be updated to reference `@leedi/knowledge`.

---

#### CRITICAL-3: Storytelling phases diverge from PRD

**Location:** `6-4-sales-methods-seed-selection.md`, `docs/02-leedi-prd.md`

**Problem:** The PRD (§MÓDULO 7) explicitly defines the Storytelling method phases as:
> *"Storytelling — Identificação → Conflito → Transformação → Convite"* (4 phases)

But Story 6.4 Task 2 seeds Storytelling with:
> *"Storytelling: `nome='storytelling'`; template structures Contexto → Conflito → Resolução"* (3 phases, different names)

**Impact:** The seeded method will not match the method described in the PRD. Any infoprodutor who reads the PRD and expects "Identificação → Conflito → Transformação → Convite" will get a different experience. The acceptance criteria in the epics.md aligns with the PRD (4 phases), but the story implementation deviates.

**Fix required:** Update Story 6.4 Task 2 to use the PRD-defined phases: `Identificação → Conflito → Transformação → Convite` (4 phases, in that order). Update the `system_prompt_template` accordingly.

---

### 🟡 WARNINGS — Non-blocking, but should be addressed

---

#### WARNING-1: Tools `agendar_followup` and `solicitar_reengajamento` are stubbed as throwing errors

**Location:** `7-2-agent-core-processing-loop.md`, Architecture §7.3

**Problem:** Stories 7.2 (registry) and 7.1 explicitly list all 10 agent tools. The two dispatch-related tools are assigned to Epic 13 (FR76, FR77). Story 7.2 says to *"stub any not-yet-implemented tools to throw a clear 'not implemented'"*.

However, a throwing stub means: if Claude ever decides to call `agendar_followup` or `solicitar_reengajamento` during an Epic 7 agent session (even in playground), the agent processing loop will crash. This creates a production risk in the V0 launch (Libras A2) which runs with only Epic 7 deployed.

**Impact:** Agent stability risk in V0/V1 before Epic 13 is complete.

**Recommendation:** Change the stubs to return a graceful non-error response instead of throwing:
```typescript
// stub: returns a no-op success until Epic 13 implements this
return { scheduled: false, reason: 'feature_not_yet_enabled' }
```
Also, the `tools_habilitadas` default in Story 7.1 sets all configurable tools to `false`. Since `agendar_followup` and `solicitar_reengajamento` are configurable, they default OFF — meaning they won't be in the tools array passed to Claude, so Claude won't call them unless the tenant enables them. The risk is real only if a tenant enables these toggles before Epic 13 is deployed.

---

#### WARNING-2: New external dependency (OpenAI Whisper) not documented in PRD or Architecture

**Location:** `7-7-multimodal-input-processing-audio-image.md`

**Problem:** Story 7.7 introduces `openai` SDK and `OPENAI_API_KEY` for audio transcription. Neither the PRD nor the Architecture mention OpenAI as a dependency. The Architecture's technology table only lists Anthropic/Claude for AI.

**Impact:** 
- New cost center (OpenAI transcription billing) not accounted for
- New API key management requirement (secret rotation, monitoring)
- Dependency on a competitor's platform not previously discussed with stakeholders

**Recommendation:** This is a pragmatic choice and technically sound (adapter pattern means it can be swapped). However, it should be explicitly noted as an architectural decision. Add a note to `docs/01-leedi-arquitetura.md` under section 13 (Dívidas conscientes) or create a brief ADR entry. Stakeholder (Caio) should acknowledge this choice.

---

#### WARNING-3: Rate limiting (NFR8) is not explicitly implemented in any Epic 7 story

**Location:** NFR8: *"All API endpoints rate-limited per tenant (Redis)"*

**Problem:** Story 7.2 correctly implements the distributed lock (NFR9: prevents parallel conversation processing). However, NFR8 requires a general rate-limiting middleware for API endpoints. No Epic 7 story explicitly implements a `ratelimit:{tenant_id}:{endpoint}` Redis check (which the Architecture §9.4 defines).

The distributed lock is NOT the same as rate limiting — it prevents parallel execution of the same conversation, but doesn't prevent a tenant from flooding the API with 1000 unique-lead messages per second.

**Impact:** Without rate limiting, a poorly integrated or malicious client could overwhelm the API. The Architecture §9.7 defines the TTL: `ratelimit:{tenant_id}:{endpoint}` → 60s.

**Recommendation:** Add a rate-limiting middleware task to either Story 7.2 or as a dedicated sub-task in the Epic 7 tracker. It can be a simple Redis-backed middleware applied at the Hono router level.

---

#### WARNING-4: Story 6.4 uses a temporary persistence path for sales method selection

**Location:** `6-4-sales-methods-seed-selection.md`

**Problem:** The story explicitly acknowledges that the selected `sales_method_id` is temporarily stored in `tenants.config` jsonb (not in `agent_configs.sales_method_id`) until Story 7.1 creates the `agent_configs` table. Story 7.1 says to wire the FK but only mentions it in passing.

**Impact:** If Story 7.1 does not explicitly include a task to "migrate `tenants.config.tenant_sales_method_preference` → `agent_configs.sales_method_id`", the temporary state may remain in `tenants.config` forever (technical debt).

**Recommendation:** Story 7.1 Task 2 (or a new task) should explicitly include: *"Read `tenants.config.tenant_sales_method_preference` if set, and seed the initial `agent_configs.sales_method_id` from it during the upsert."* This ensures no data is lost and the migration is atomic.

---

#### WARNING-5: Story 5.2 has an unresolved forward dependency on Story 5.5

**Location:** `5-2-lead-detail-page-journey-timeline.md`

**Problem:** Story 5.2 shows `conversationCount` on the lead detail page, but the `conversation_windows` table is only created in Story 5.5. The story documents this dependency and handles it with a default of `0` and a TODO comment.

This is an accepted pattern in the workflow, but it means:
- Story 5.2 ships in a degraded state (conversation count always shows 0)
- There's no acceptance criterion explicitly testing the count becoming correct after 5.5 lands
- The TODO in code could be forgotten

**Recommendation:** Add a note to Story 5.5's Dev Notes: *"After this story is complete, remove the TODO guard in Story 5.2's `get-lead-detail.ts` and wire the real `conversationCount` query."* This makes the completion of 5.2 explicitly dependent on 5.5.

---

#### WARNING-6: `buildSystemPrompt` does not reference active product at build time

**Location:** `7-1-agent-configuration-panel.md`, `7-2-agent-core-processing-loop.md`, `7-3-lead-context-tools-history-offers-eligibility.md`

**Problem:** `buildSystemPrompt(agentConfig, salesMethod, activeProduct)` is designed to include the product in the stable, cached system prompt prefix. However, `consultar_ofertas_ativas` is also defined as an always-on agent tool. This creates potential duplication:

- The system prompt (built pre-call) embeds the active product context
- The tool `consultar_ofertas_ativas` can be called during the conversation to get the same data

This is not incorrect per se — the architecture §7.5 describes the system prompt as "persona + método + produto + regras" — but the product passed to `buildSystemPrompt` must be fetched before the Claude call (not via a tool). Story 7.2's `process-message` flow does load the agent context (including active campaign/product) before the Claude call.

However, if the `buildSystemPrompt` uses a static product snapshot and then `consultar_ofertas_ativas` returns the same data dynamically during the tool loop, the agent may process redundant/inconsistent product information (especially during campaign phase transitions mid-conversation).

**Recommendation:** Document clearly in Story 7.2 that `buildSystemPrompt` is called with the product snapshot at the *start* of the call, and `consultar_ofertas_ativas` is meant for when the agent needs to verify eligibility or the current active offer mid-conversation. These serve different purposes and should be clarified in the system prompt instructions.

---

## Epic Quality Summary

### Epic 5: Lead Management & Conversation Tracking
| Criterion | Assessment |
|-----------|------------|
| User value clearly defined | ✅ |
| Stories independently completable | ✅ (5.5 has a known 5.1 dependency — acceptable) |
| Forward dependencies managed | ⚠️ 5.2 → 5.5 (documented with guard) |
| AC are testable | ✅ |
| No missing FRs | ✅ |
| Architecture alignment | ✅ Correctly uses `@leedi/leads` domain package |

### Epic 6: Product Knowledge Base & Sales Methods
| Criterion | Assessment |
|-----------|------------|
| User value clearly defined | ✅ |
| Stories independently completable | ✅ (6.3 depends on 6.1 schema — documented) |
| Migration numbering | ❌ CRITICAL-1: conflict with Story 5.5 |
| Architecture alignment | ❌ CRITICAL-2: no `@leedi/knowledge` package created |
| PRD alignment | ❌ CRITICAL-3: Storytelling phases wrong |
| Temporary persistence coupling | ⚠️ WARNING-4: sales method in tenants.config |

### Epic 7: Intelligent Sales Agent
| Criterion | Assessment |
|-----------|------------|
| User value clearly defined | ✅ |
| Stories independently completable | ✅ |
| Tool stubs | ⚠️ WARNING-1: throwing stubs could crash the agent |
| External dependencies | ⚠️ WARNING-2: OpenAI undocumented |
| Rate limiting | ⚠️ WARNING-3: NFR8 not explicitly implemented |
| Architecture alignment | ✅ Correctly uses `@leedi/agent` and `@leedi/agent-memory` packages |
| Prompt caching | ✅ Correctly implemented in 7.2 |
| Model routing | ✅ Centralized in 7.8 |

---

## Action Items Summary

### Must fix before starting Epic 6 development

| # | Priority | Story | Action |
|---|----------|-------|--------|
| 1 | 🔴 CRITICAL | 6.1, 6.4, 7.1 | Fix migration numbering: 6.1→`0007`, 6.4→`0008`, 7.1→`0009` |
| 2 | 🔴 CRITICAL | 6.1, 6.2, 6.3 | Create `@leedi/knowledge` package; move use cases out of `apps/api` |
| 3 | 🔴 CRITICAL | 6.4 | Fix Storytelling phases: Identificação→Conflito→Transformação→Convite (4 phases) |

### Should fix before V0 launch

| # | Priority | Story | Action |
|---|----------|-------|--------|
| 4 | 🟡 WARNING | 7.2 | Change stubs for `agendar_followup`/`solicitar_reengajamento` to return graceful no-op |
| 5 | 🟡 WARNING | 7.1 | Add explicit task to migrate `tenants.config.tenant_sales_method_preference` → `agent_configs.sales_method_id` |
| 6 | 🟡 WARNING | 7.2 or new | Add rate-limiting middleware task (NFR8) |

### Should document / acknowledge

| # | Priority | Story | Action |
|---|----------|-------|--------|
| 7 | 🟡 WARNING | 7.7 | Add architectural decision record for OpenAI Whisper dependency |
| 8 | 🟡 WARNING | 5.5 | Add explicit cleanup TODO: wire real conversationCount in 5.2 after 5.5 lands |

---

## Overall Readiness Verdict — Epics 5, 6, 7

| Epic | Status |
|------|--------|
| Epic 5 — Lead Management | ✅ **READY FOR DEV** — all stories clean |
| Epic 6 — Knowledge Base | ✅ **READY FOR DEV** — 3 critical issues fixed on 2026-06-01 |
| Epic 7 — AI Agent | ✅ **READY FOR DEV** — all issues resolved on 2026-06-01 |

### Fixes applied on 2026-06-01

| # | Fix | Files changed |
|---|-----|---------------|
| CRITICAL-1 | Migration numbering corrected (0007/0008/0009) | `6-1`, `6-4`, `7-1` story files |
| CRITICAL-2 | `@leedi/knowledge` package added to all Epic 6 stories | `6-1`, `6-2`, `6-3` story files |
| CRITICAL-3 | Storytelling phases corrected: Identificação→Conflito→Transformação→Convite | `6-4` story file |
| WARNING-1 | Tool stubs changed from throwing to graceful no-op | `7-2` story file |
| WARNING-2 | OpenAI → Groq Whisper (default, 18× cheaper); decision documented | `7-7` story file, `docs/01-leedi-arquitetura.md` |
| WARNING-3 | NFR8 rate limiting task added (`@upstash/ratelimit` middleware) | `7-2` story file |
| WARNING-4 | Migration path `tenants.config` → `agent_configs.sales_method_id` added | `7-1` story file |

---

---

# Assessment Section 2: Epics 11, 12, 13

**Scope:** Epic 11 (Hotmart Gateway Integration), Epic 12 (Meta Template Management), Epic 13 (Smart Message Dispatch)
**Documents cross-referenced:** `docs/01-leedi-arquitetura.md` §6.9, §6.10, §6.11, §7.3, §8.2; `docs/02-leedi-prd.md`; `epics.md` (FR61–FR78, FR92–FR97, NFR4–NFR6); all 9 story files.

---

## Story File Inventory — Epics 11–13

| Story | File | Status |
|-------|------|--------|
| 11.1  | `11-1-hotmart-webhook-receiver-canonical-event-normalization.md` | ✅ Found |
| 11.2  | `11-2-purchase-approved-lead-status-update.md` | ✅ Found |
| 11.3  | `11-3-recovery-flow-triggers-abandoned-cart-boleto-pix.md` | ✅ Found |
| 12.1  | `12-1-template-builder-meta-submission.md` | ✅ Found |
| 12.2  | `12-2-template-status-tracking-suggested-library.md` | ✅ Found |
| 13.1  | `13-1-lead-segment-builder.md` | ✅ Found |
| 13.2  | `13-2-manual-template-dispatch.md` | ✅ Found |
| 13.3  | `13-3-automatic-dispatch-rules.md` | ✅ Found |
| 13.4  | `13-4-24h-window-followup-reengagement.md` | ✅ Found |

---

## FR Coverage — Epics 11, 12, 13

| FR Range | Epic | Coverage |
|----------|------|----------|
| FR92–FR97 | Epic 11 | ✅ Stories 11.1–11.3 |
| NFR4 | Epic 11 | ✅ Covered across all three 11.x stories |
| FR61–FR68 | Epic 12 | ✅ Stories 12.1–12.2 |
| FR69–FR78 | Epic 13 | ✅ Stories 13.1–13.4 |
| NFR5 | Epic 13 | ✅ Story 13.2 (throttle respects Meta tier) |
| **NFR6** | **Epic 13** | ❌ **NOT COVERED — see CRITICAL-4 below** |

---

## Findings — Coherence Issues (Epics 11–13)

---

### 🔴 CRITICAL — Must fix before devving these stories

---

#### CRITICAL-4: NFR6 not covered by any Epic 13 story

**Requirement:** NFR6 — *"Quality rating drop pauses dispatches + alerts"* (assigned to Epic 13 in the requirements inventory)

**Problem:** None of the four Epic 13 stories (13.1–13.4) implement the following behavior defined in NFR6:
- Detecting when the tenant's WhatsApp number quality rating drops to RED (via Meta webhook or polling)
- Automatically pausing all active `dispatch_jobs` when quality drops
- Alerting the tenant: "Seu número teve queda de qualidade. Disparos pausados automaticamente."

The Meta webhook handler (Story 4.4) does receive quality rating updates (`phone_number_quality_update` events). However, no story wires this event to dispatch management logic. Story 15.3 ("Number Health, Campaign Status Widgets") mentions the quality widget but only for display — it does not act on quality changes.

**Impact:** A production tenant running a dispatch when quality drops to RED will continue sending, potentially causing the number to be flagged or banned by Meta. This is a compliance and product reliability gap.

**Fix required:** Add either:
- A new Story 13.5 ("Quality Gate for Dispatches"), OR
- A task to Story 13.2's dispatch worker: *"Before each send, check `whatsapp_connections.quality_tier`; if `red`, pause the dispatch_job and notify"*
AND an extension to the Meta webhook handler (Story 4.4) to update `dispatch_jobs.status = 'pausado'` when a `phone_number_quality_update` with `quality: RED` arrives for that tenant's connection.

---

### 🟡 WARNINGS — Non-blocking, but should be addressed

---

#### WARNING-9: `dispatch_targets` schema is missing a `wamid` column for delivery tracking

**Location:** `13-2-manual-template-dispatch.md`, Architecture §6.10

**Problem:** Story 13.2 AC #8 expects to track `entregues` (delivered) count from Meta delivery webhooks. The Meta webhook sends a delivery notification that includes the WhatsApp message ID (`wamid`) as the correlation key. However:
- The `dispatch_targets` table (Architecture §6.10 and Story 13.2 Task 1) has no column to store the `wamid` returned by `connection.enviarTemplate()` after sending.
- Without a stored `wamid`, the Meta webhook handler cannot find which `dispatch_targets` record to update to `status: entregue`.

The dispatch worker in Story 13.2 Task 3 calls `connection.enviarTemplate()` and increments `dispatch_jobs.enviados`, but there is no step to save the returned message ID to `dispatch_targets`.

**Impact:** Delivery tracking will not work. The `entregues` count will always be 0 regardless of actual delivery. The dispatch detail page (Story 13.2 AC #8) will never show accurate delivery statistics.

**Fix required:** Add a `wamid` column (text nullable) to `dispatch_targets` in the Story 13.2 Task 1 migration. In the dispatch worker (Task 3), after each successful `enviarTemplate()` call, update `dispatch_targets.wamid = result.messageId`. In the Meta webhook handler (Story 4.4), when processing delivery status events, look up `dispatch_targets WHERE wamid = ?` and update status to `entregue`.

---

#### WARNING-10: `dispatch_rule_id` column added to `dispatch_targets` is not in the Architecture §6.10

**Location:** `13-3-automatic-dispatch-rules.md` Dev Notes

**Problem:** Story 13.3 Dev Notes says: *"Recommended: add optional `dispatch_rule_id` column to `dispatch_targets` in the migration (nullable FK → `dispatch_rules.id`)"*. This column is needed for the deduplication logic in `dispatch-recovery-target.ts` (AC #5: prevents double-sending for same lead+rule within 24h).

However, this column does not exist in the Architecture §6.10 `dispatch_targets` schema. It is not documented as a conscious deviation — it is proposed inline as a "Recommended" implementation note.

**Impact:** If the dev agent adds this column without it being in the architecture spec, the architecture document becomes stale. If the dev agent skips it and tries to implement deduplication via `dispatch_jobs` JSON fields, the logic becomes more complex and potentially incorrect.

**Fix required:** Make an explicit decision:
- **Option A (preferred):** Add `dispatch_rule_id (uuid FK nullable)` to `dispatch_targets` in Architecture §6.10, then Story 13.2 Task 1 migration includes it from the start.
- **Option B:** Keep the column out and implement deduplication purely via application-layer timestamp check (less clean but avoids schema change).

If Option A is chosen, update `docs/01-leedi-arquitetura.md` §6.10 to include this column before development starts.

---

#### WARNING-11: Migration coordination ambiguity across Stories 13.2, 13.3, and 13.4

**Location:** Dev Notes in `13-2-manual-template-dispatch.md`, `13-3-automatic-dispatch-rules.md`, `13-4-24h-window-followup-reengagement.md`

**Problem:** All three stories reference migration slot 0012 (or possibly 0013) for the dispatch domain. The three stories are independent dev tasks but share the same DB migration boundary:
- Story 13.2 creates migration **0012** with `dispatch_jobs` + `dispatch_targets`
- Story 13.3 says: *"Add `dispatch_rules` to 0012 OR confirm 0013"*
- Story 13.4 says: *"Add `followups` to 0012 OR confirm 0013"*

If Stories 13.3 and 13.4 are implemented after 13.2 has already applied migration 0012 to the dev DB, extending the same migration file is not possible without resetting the DB. This creates an ambiguous instruction for the dev agent.

**Impact:** A dev agent implementing 13.3 after 13.2 is applied might incorrectly try to edit migration 0012 (causing Drizzle Kit errors) or might correctly create 0013, but then Story 13.4 needs 0013 too, causing a second conflict.

**Fix required:** Clarify the migration strategy explicitly in all three stories:
> *"If implementing 13.2, 13.3, and 13.4 in the same Drizzle session (no migration applied yet), create a single migration 0012 with all dispatch domain tables: `dispatch_jobs`, `dispatch_targets`, `dispatch_rules`, `followups`. If 0012 is already applied from a prior session, create migration 0013 for the remaining tables."*

---

#### WARNING-12: HTTP status code inconsistency for invalid `hottok` — Story 11.1 vs epics.md

**Location:** `11-1-hotmart-webhook-receiver-canonical-event-normalization.md` AC #3; `epics.md` Story 11.1 AC

**Problem:** The story file (AC #3) says an invalid/missing `hottok` should return **`401 Unauthorized`**. The epics.md AC states: *"Hotmart sends a webhook with invalid signature → responds `403 Forbidden`"*.

These are different HTTP status codes with different semantics: 401 means "authentication required", 403 means "authenticated but forbidden". For a webhook validation failure (wrong secret), 401 is slightly more correct, but the inconsistency should be resolved.

**Fix required:** Standardize on **`401 Unauthorized`** (the story file's choice) and update the epics.md note. The dev agent should follow the story file (most recent source of truth).

---

#### WARNING-13: FR93 states "12 event types" but the canonical enum defines 11

**Location:** `epics.md` FR93; `11-1-hotmart-webhook-receiver-canonical-event-normalization.md` AC #6; Architecture §6.11

**Problem:** FR93 reads: *"Canonical events processing (12 event types)"*. But Architecture §6.11, Story 11.1 AC #6, and the `gateway_evento_canonico` enum definition all list exactly 11 types:
`compra_aprovada`, `compra_recusada`, `compra_cancelada`, `compra_reembolsada`, `chargeback`, `carrinho_abandonado`, `assinatura_iniciada`, `assinatura_cancelada`, `assinatura_atrasada`, `boleto_gerado`, `pix_gerado`

**Impact:** Minor — no implementation risk. The stories and architecture are self-consistent at 11 types. The error is only in the FR description.

**Fix required:** Update FR93 in `epics.md` to read *"11 event types"*. No story file changes needed.

---

#### WARNING-14: `solicitar_reengajamento` tool uses vague "first match" rule selection logic

**Location:** `13-4-24h-window-followup-reengagement.md` Task 3

**Problem:** Story 13.4 Task 3 says: *"Query `dispatch_rules WHERE tenant_id = ? AND ativo = true` — pick first match (or most recently activated)"* for the `solicitar_reengajamento` tool. If a tenant has multiple active rules with different triggers (e.g., `carrinho_abandonado` AND `sem_resposta_48h`), the tool would arbitrarily select the first/most recent one. This could cause a `carrinho_abandonado`-targeted template to be sent in a context where `solicitar_reengajamento` was called for a different reason.

**Impact:** The agent might send a semantically incorrect recovery template (e.g., an "abandoned cart" message to a lead who simply stopped responding, not one who abandoned a cart). The Architecture §7.3 defines `solicitar_reengajamento` as "Schedules approved template to reopen window" without specifying a trigger filter.

**Fix required:** One of:
- **Option A:** Filter by a specific reengagement trigger type (e.g., prefer `sem_resposta_48h` rules). Update Task 3 query to `WHERE trigger = 'sem_resposta_48h' AND ativo = true`.
- **Option B:** Pass `motivo` (reason) from the agent to the tool and use it to select the best matching rule. More flexible but requires the agent to know rule trigger names.
- **Option C (V1 acceptable):** Document the "first match" behavior explicitly as a known V1 limitation, and ensure tenant onboarding guides recommend setting up one rule per trigger type.

---

#### WARNING-15: Internal inconsistency in Story 13.2 throttle rate dev notes

**Location:** `13-2-manual-template-dispatch.md` Dev Notes

**Problem:** The Dev Notes contain two contradictory statements about the 1k tier send rate:
1. *"1k messages/day → 86s/msg"* (which would mean ~1 message every 86 seconds — far too slow for any usable dispatch)
2. *"throttle to 1 msg/second for 1k tier"* (1000ms interval)

The first figure (86s) comes from naively dividing 86,400 seconds/day by 1,000 messages. But Meta's 1k tier means 1,000 unique contacts per 24-hour rolling window, not 1 message per 86 seconds. A practical throttle of 1 msg/second spreads 1,000 messages over ~17 minutes — well within the day limit.

**Impact:** If the dev agent uses 86,000ms (86s) as the interval, every 1k-tier dispatch will be effectively non-functional (sending to 100 leads would take 2+ hours). The correct value is the one stated second: ~1,000ms for 1k tier.

**Fix required:** Remove or correct the first misleading figure in Story 13.2 Dev Notes. The authoritative tier→interval mapping should be:
| Tier | Interval | Notes |
|------|----------|-------|
| 1k/day | 1,000ms | ~17 min for 1k leads |
| 10k/day | 500ms | ~1.4h for 10k leads |
| 100k/day | 100ms | ~2.8h for 100k leads |
| Unlimited | 50ms | No daily cap enforced |

---

## Architecture Alignment Check — Epics 11–13

| Area | Check | Result |
|------|-------|--------|
| Schema §6.9 vs Story 12.1 | `templates` + `template_library` table match | ✅ Exact match |
| Schema §6.10 vs Stories 13.x | `dispatch_jobs`, `dispatch_targets`, `dispatch_rules`, `followups` match | ✅ Match (WARNING-10 applies) |
| Schema §6.11 vs Story 11.1 | `gateway_integrations` + `gateway_events` table match | ✅ Exact match |
| Adapter pattern §8.2 | `HotmartNormalizer` implements `GatewayProvider` interface | ⚠️ Not explicitly stated (soft deviation) |
| Migration sequence | 0010=gateway, 0011=templates, 0012=dispatch | ✅ Consistent |
| Domain packages | `@leedi/gateway` follows same pattern as `@leedi/connection` | ✅ Correct |
| BullMQ pattern | Fire-and-forget for cross-epic job dependencies | ✅ Sound pattern |
| RLS | All new tables (gateway, template, dispatch) have RLS enabled | ✅ Covered in every story |

---

## Epic Quality Summary — Epics 11–13

### Epic 11: Hotmart Gateway Integration

| Criterion | Assessment |
|-----------|------------|
| User value clearly defined | ✅ |
| FR coverage (FR92–FR97, NFR4) | ✅ 100% |
| Schema alignment to Architecture §6.11 | ✅ Exact |
| Idempotency (NFR4) | ✅ All three stories |
| Cross-story dependency management | ✅ 11.3 → 13.3 correctly documented with fire-and-forget |
| Minor discrepancies | ⚠️ WARNING-12 (401 vs 403), WARNING-13 (11 vs 12 event types) |

### Epic 12: Meta Template Management

| Criterion | Assessment |
|-----------|------------|
| User value clearly defined | ✅ |
| FR coverage (FR61–FR68) | ✅ 100% |
| Schema alignment to Architecture §6.9 | ✅ Exact |
| AI-assist integration (FR68) | ✅ `AIAssistedTextarea` correctly referenced |
| Epic 18 placeholder dependency | ✅ Correctly deferred |
| Migration extension risk | ⚠️ WARNING-11 applies to 0011 migration |

### Epic 13: Smart Message Dispatch

| Criterion | Assessment |
|-----------|------------|
| User value clearly defined | ✅ |
| FR coverage (FR69–FR78, NFR5) | ✅ 100% |
| NFR6 (quality rating pauses dispatches) | ❌ **NOT COVERED — CRITICAL-4** |
| Schema alignment to Architecture §6.10 | ⚠️ Missing `wamid` (WARNING-9), missing `dispatch_rule_id` (WARNING-10) |
| Migration coordination | ⚠️ Ambiguous across 13.2/13.3/13.4 (WARNING-11) |
| Throttle rate documentation | ⚠️ Internal inconsistency (WARNING-15) |
| Rule selection for re-engagement | ⚠️ Vague "first match" (WARNING-14) |

---

## Action Items Summary — Epics 11–13

### Must fix before starting Epic 13 development

| # | Priority | Story | Action |
|---|----------|-------|--------|
| C4 | 🔴 CRITICAL | 13.2 or new 13.5 | Implement NFR6: quality rating drop pauses active dispatches and alerts tenant |
| W9 | 🟡 WARNING | 13.2 | Add `wamid` column to `dispatch_targets` schema; wire it in dispatch worker + Meta webhook handler |
| W10 | 🟡 WARNING | 13.3 + Architecture | Decide: add `dispatch_rule_id` to `dispatch_targets` in Architecture §6.10, OR document as deviation |
| W11 | 🟡 WARNING | 13.2, 13.3, 13.4 | Clarify migration strategy: single 0012 if implementing sequentially in same session, else 0013 for remaining |

### Should fix before Epic 11/12 dev starts

| # | Priority | Story | Action |
|---|----------|-------|--------|
| W12 | 🟡 WARNING | 11.1 | Standardize on `401` for invalid `hottok`; update epics.md reference |
| W13 | 🟡 INFO | epics.md | Correct FR93: "11 event types" (not 12) |
| W15 | 🟡 WARNING | 13.2 | Fix throttle rate table in dev notes; remove the misleading 86s/msg figure |

### V1-acceptable with documentation

| # | Priority | Story | Action |
|---|----------|-------|--------|
| W14 | 🟡 WARNING | 13.4 | Document `solicitar_reengajamento` "first match" as V1 limitation; recommend one rule per trigger in tenant onboarding |

---

## Overall Readiness Verdict — Epics 11–13

| Epic | Status |
|------|--------|
| Epic 11 — Hotmart Gateway | ✅ **READY FOR DEV** — two minor discrepancies (WARNING-12, WARNING-13), no blockers |
| Epic 12 — Meta Template Management | ⚠️ **CONDITIONALLY READY** — migration extension caveat (WARNING-11) must be handled at dev time; no blockers |
| Epic 13 — Smart Message Dispatch | ⚠️ **CONDITIONALLY READY** — CRITICAL-4 (NFR6 gap) and WARNING-9 (missing `wamid`) must be resolved before 13.2 dev starts; other warnings addressable during implementation |
