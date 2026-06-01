---
baseline_commit: 9ea8a05
---

# Story 9.2: PRD — Onboarding Edge Case & Architecture Webhook Retry/DLQ

Status: ready-for-dev

## Story

As a developer,
I want the PRD to clarify how incomplete onboardings are handled in the super-admin view, and the Architecture to document the webhook retry and DLQ strategy,
so that partial setups are managed gracefully and no sales event is silently lost.

## Acceptance Criteria

1. **Given** the updated PRD MÓDULO 2 (Onboarding) in `docs/02-leedi-prd.md`, **When** a developer reads it, **Then** it specifies: (a) what the super-admin sees for tenants with incomplete onboarding (e.g., status `incompleto` visible in admin tenant list), (b) what triggers a re-invitation or re-nudge (e.g., wizard incomplete after 48h → automated email), and (c) whether a tenant with incomplete onboarding can still receive messages (answer: NO — agent is inactive until wizard is complete).
2. **Given** the updated Architecture Webhooks section in `docs/01-leedi-arquitetura.md`, **When** a developer reads it, **Then** it specifies: (a) retry count = 3 attempts with exponential backoff (1s → 4s → 16s), (b) DLQ destination = BullMQ failed queue (`{tenantId}:webhook:dlq`), (c) alerting condition: Sentry alert when DLQ length > 10 for a tenant in 1 hour, and (d) manual replay procedure: a super-admin can re-trigger a DLQ event from the admin panel (V1: via direct BullMQ job; V2: UI button).
3. **Given** the Architecture Webhooks section, **When** a developer looks for the idempotency strategy, **Then** it explicitly states how duplicate webhooks are detected: `gateway_events` table row with `processado: true` guards the Hotmart flow; `messages.meta_message_id` (UNIQUE) guards the Meta flow.
4. **Given** the Architecture section on the Meta webhook specifically, **When** read, **Then** it documents the 6-second debounce buffer behavior: multiple messages from the same lead within 6s are batched; the debounce key is `{tenantId}:{leadPhone}` in Redis; each individual message is still persisted to `messages` before debouncing (so no message is lost even if the agent processes them as a batch).

## Tasks / Subtasks

- [ ] Task 1: Update PRD MÓDULO 2 — incomplete onboarding handling (AC: #1)
  - [ ] Locate MÓDULO 2 (Onboarding) in `docs/02-leedi-prd.md` (around line 139)
  - [ ] Add a subsection or bullet block: "Onboarding Incompleto" covering: what the super-admin sees, re-nudge trigger, and agent activation gate
  - [ ] Confirm the wizard completion is the gate for `tenant.status = 'ativo'` (agent active)
- [ ] Task 2: Add/update Webhooks section in Architecture (AC: #2, #3, #4)
  - [ ] Locate or create a "Webhooks — Retry, DLQ e Idempotência" section in `docs/01-leedi-arquitetura.md`
  - [ ] Add retry strategy: 3 attempts, exponential backoff (1s → 4s → 16s), final failure → DLQ
  - [ ] Add DLQ destination: BullMQ failed queue, key pattern `{tenantId}:webhook:dlq`
  - [ ] Add alerting: Sentry alert when DLQ > 10 events/tenant/hour
  - [ ] Add manual replay note: super-admin can trigger from admin panel (V1: via BullMQ API; V2: UI button)
  - [ ] Add idempotency: `gateway_events.processado = true` for Hotmart; `messages.meta_message_id UNIQUE` for Meta
  - [ ] Add debounce behavior: 6s window, key `{tenantId}:{leadPhone}`, messages persisted before debounce
- [ ] Task 3: Cross-check no contradictions (AC: #1–#4)
  - [ ] Confirm the retry/DLQ strategy does not contradict the BullMQ job descriptions in existing sections
  - [ ] Confirm the debounce documentation matches Story 4.4 implementation notes

## Dev Notes

- Documentation story. No code, no migrations.
- Files to modify: `docs/02-leedi-prd.md` (MÓDULO 2 section), `docs/01-leedi-arquitetura.md` (Webhooks section — create if missing).
- Do NOT change the structure of either document beyond the targeted sections.
- The Architecture document is the technical source of truth — additions must match the implementation already described in Stories 4.4 and 11.1.

### Testing standards

- Manual verification: read the updated sections and confirm each AC item is explicitly covered.

### Pitfalls to avoid

- Do NOT invent retry/DLQ numbers that conflict with the BullMQ behavior already coded in Epic 4/11 stories.
- Do NOT modify the meta webhook validation or Hotmart signature sections — only add the retry/DLQ strategy.

### References

- [Source: docs/02-leedi-prd.md#MÓDULO 2 — Onboarding]
- [Source: docs/01-leedi-arquitetura.md] (Webhooks section — locate or create)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.2]
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (debounce behavior)
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md] (idempotency)
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-29.md] (gap items P4, A2)

## Dev Agent Record

### Agent Model Used

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
