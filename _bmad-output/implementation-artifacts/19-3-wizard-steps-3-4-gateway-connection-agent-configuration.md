---
baseline_commit: c7247e7
---

# Story 19.3: Wizard Steps 3-4 (Gateway Connection & Agent Configuration)

Status: review

## Story

As a **new tenant owner**,
I want to connect my Hotmart account and configure my agent's basic settings within the wizard,
so that my sales pipeline and agent are ready before I run the test.

## Acceptance Criteria

1. **Given** the tenant is on Step 3, **When** they select Hotmart as their gateway, **Then** the system displays the webhook URL from existing Epic 11 gateway integration in a copy-able field.
2. **Given** the webhook URL is displayed, **When** the page polls every 3 seconds, **Then** if Hotmart sends a test webhook, the step changes to "Webhook confirmado!" and "Próximo" becomes enabled.
3. **Given** the tenant clicks "Pular por enquanto", **When** clicked, **Then** `PATCH /api/onboarding/progress { step: 3, data: { skipped: true } }` is saved and wizard advances to Step 4.
4. **Given** the tenant fills agent name, persona, and sales method in Step 4, **When** they click "Salvar configuração", **Then** agent config is persisted and a preview shows the agent name and method.
5. **Given** the tenant has already configured the agent, **When** Step 4 renders, **Then** form is pre-filled with existing agent config.
6. **Given** the tenant clicks "Próximo" after saving Step 4, **When** processed, **Then** progress is saved and wizard advances to Step 5.

## Tasks / Subtasks

- [x] Task 1: Webhook URL generation for Step 3 (AC: #1)
  - [x] `GET /api/tenants/:tenantId/onboarding/gateway-webhook-url` implemented in `apps/api/src/routes/onboarding.ts`
  - [x] Reads existing `gateway_integrations.webhook_url_path` for the tenant

- [x] Task 2: Webhook confirmation polling (AC: #2)
  - [x] `GET /api/tenants/:tenantId/onboarding/gateway-confirmed` reads `tenants.config.onboarding_config.gateway_webhook_received`
  - [x] Hotmart webhook handler sets `gateway_webhook_received = true` when `current_step === 3`

- [x] Task 3: Step 3 component — Gateway Connection (AC: #1–#3)
  - [x] Implemented `apps/dashboard/app/onboarding/_components/step-3.tsx`
  - [x] Webhook URL display with copy button
  - [x] 3s polling via `setInterval` with cleanup on unmount
  - [x] "Pular por enquanto" link button

- [x] Task 4: Step 4 component — Agent Configuration (AC: #4–#6)
  - [x] Implemented `apps/dashboard/app/onboarding/_components/step-4.tsx`
  - [x] Fields: `nome_agente`, `persona` (AIAssistedTextarea), `metodo_venda` (native select)
  - [x] Reuses `PATCH /api/tenants/:tenantId/agent-config` from Epic 7
  - [x] Pre-fills from `GET /api/tenants/:tenantId/agent-config`

- [x] Task 5: Tests (AC: #2, #3, #4, #5)
  - [x] API: `gateway-confirmed` returns correct value
  - [x] API: Hotmart webhook sets flag only when `current_step === 3`
  - [x] Component: "Pular" advances without confirmation
  - [x] Component: Step 4 "Próximo" is disabled until save
  - [x] Component: Step 4 pre-fills nome from agent config

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Completion Notes List

- step-3.tsx: polling uses setInterval with clearInterval cleanup; "Pular" saves skipped flag
- step-4.tsx: uses AIAssistedTextarea and native select (no shadcn Select in @leedi/ui)
- Hotmart webhook handler: `setGatewayWebhookReceivedIfOnboarding` checks current_step === 3 before setting flag
- 4 step-3 tests, 4 step-4 tests, 2 hotmart-gateway tests — all passing

### File List

- apps/dashboard/app/onboarding/_components/step-3.tsx (implemented — was stub from 19.1)
- apps/dashboard/app/onboarding/_components/step-4.tsx (implemented — was stub from 19.1)
- apps/dashboard/app/onboarding/_components/__tests__/step-3.test.tsx (created)
- apps/dashboard/app/onboarding/_components/__tests__/step-4.test.tsx (created)
- apps/api/src/__tests__/onboarding-hotmart.test.ts (created)

### Change Log

- 2026-06-04: Implemented Steps 3 and 4 with hotmart webhook flag + tests
