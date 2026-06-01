---
baseline_commit: 9ea8a05
---

# Story 19.3: Wizard Steps 3-4 (Gateway Connection & Agent Configuration)

Status: ready-for-dev

## Story

As a **new tenant owner**,
I want to connect my Hotmart account and configure my agent's basic settings within the wizard,
so that my sales pipeline and agent are ready before I run the test.

## Acceptance Criteria

1. **Given** the tenant is on Step 3, **When** they select Hotmart as their gateway, **Then** the system generates a unique webhook URL (reusing Epic 11 webhook receiver) and displays it in a copy-able field with instructions: "Copie este URL e cole nas configurações de webhooks do Hotmart."
2. **Given** the webhook URL is displayed, **When** the page is polling for confirmation (every 3 seconds), **Then** if Hotmart sends a test webhook to the URL, the step 3 status changes to green: "Webhook confirmado!" and the "Próximo" button becomes enabled.
3. **Given** the tenant clicks "Pular por enquanto" on Step 3 (optional skip), **When** clicked, **Then** `PATCH /api/onboarding/progress { step: 3, data: { skipped: true } }` is saved and the wizard advances to Step 4 — gateway connection can be completed later in Settings.
4. **Given** the tenant is on Step 4 and fills in agent name, selects persona type and sales method, **When** they click "Salvar configuração", **Then** the agent config is persisted via the existing Epic 7 agent config endpoint and a preview shows: "Seu agente [Nome] está pronto para usar o método [Método]."
5. **Given** the tenant has already configured the agent (returns to Step 4 after a resume), **When** the step renders, **Then** the form is pre-filled with the existing agent name, persona (trimmed), and sales method.
6. **Given** the tenant clicks "Próximo" after saving Step 4 config, **When** processed, **Then** `PATCH /api/onboarding/progress { step: 4, data: { agente_nome, sales_method } }` is saved and the wizard advances to Step 5.

## Tasks / Subtasks

- [ ] Task 1: Webhook URL generation for Step 3 (AC: #1)
  - [ ] Create `GET /api/onboarding/gateway-webhook-url` endpoint in `apps/api/src/routes/onboarding.ts`:
    - Returns the tenant-scoped Hotmart webhook URL: `{ url: 'https://<DOMAIN>/webhooks/hotmart?tenant_id=<tenant_id>' }` (or the existing webhook URL from Epic 11 — same endpoint, tenant resolved from query param or token)
    - RBAC: owner only
  - [ ] If Epic 11's Hotmart webhook already supports tenant routing by query param, this endpoint simply constructs and returns the URL

- [ ] Task 2: Webhook confirmation polling (AC: #2)
  - [ ] Add `GET /api/onboarding/gateway-confirmed` endpoint:
    - Checks if `tenants.config.onboarding_config.gateway_webhook_received = true` (set by the Hotmart webhook handler when it processes any event for this tenant)
    - Returns `{ confirmed: boolean }`
  - [ ] In Epic 11's Hotmart webhook handler (`apps/api/src/routes/webhooks/hotmart.ts`): after processing any event for a tenant, if `tenants.config.onboarding_config.current_step === 3`, set `tenants.config.onboarding_config.gateway_webhook_received = true`
  - [ ] Step 3 UI polls `GET /api/onboarding/gateway-confirmed` every 3 seconds using `setInterval` (clear on unmount or on confirmation)

- [ ] Task 3: Step 3 component — Gateway Connection (AC: #1–#3)
  - [ ] Implement `apps/dashboard/app/onboarding/_components/step-3.tsx`
  - [ ] "Selecionar gateway" — for V1, only Hotmart available (radio/select with single option)
  - [ ] Webhook URL display: `Input` (shadcn/ui) with `readOnly` + "Copiar" button (`navigator.clipboard.writeText`)
  - [ ] Status indicator: `Alert` variant `default` → "Aguardando webhook..." while polling; `Alert` variant `success` (green) → "Webhook confirmado!" once `confirmed = true`
  - [ ] "Próximo" button: disabled until `confirmed = true` OR user clicks "Pular por enquanto"
  - [ ] "Pular por enquanto" link button (secondary style): calls `PATCH /api/onboarding/progress` with `skipped: true` then advances wizard

- [ ] Task 4: Step 4 component — Agent Configuration (AC: #4–#6)
  - [ ] Implement `apps/dashboard/app/onboarding/_components/step-4.tsx`
  - [ ] Fields:
    - `nome_agente` (text, required): agent display name (e.g., "Mari", "Sofia")
    - `persona` (textarea with AIAssistedTextarea from Story 3.3, optional): brief persona description
    - `metodo_venda` (select, required): SPIN / AIDA / Storytelling / Free (from Epic 6 seed data)
  - [ ] "Salvar configuração" button: calls existing `PATCH /api/agents/config` from Epic 7 (Story 7.1) with `{ nome_agente, persona, metodo_venda }`
  - [ ] On success: show inline success "Seu agente [nome_agente] está pronto para usar o método [metodo_venda]"
  - [ ] "Próximo" button: enabled after successful save; calls `PATCH /api/onboarding/progress { step: 4, data: { agente_nome, sales_method } }`
  - [ ] Pre-fill: on render, call `GET /api/agents/config` (Story 7.1) and populate form if data exists

- [ ] Task 5: Tests (AC: #2, #3, #4, #5)
  - [ ] Unit: `GET /api/onboarding/gateway-confirmed` returns `confirmed: true` when `gateway_webhook_received = true` in config
  - [ ] Unit: Hotmart webhook handler sets `gateway_webhook_received = true` only when `current_step === 3`
  - [ ] Unit: "Pular" advances wizard without confirming webhook
  - [ ] Component: Step 4 pre-fills form from existing agent config
  - [ ] Component: "Próximo" in Step 4 is disabled until save succeeds

## Dev Notes

- **Files to create:** `apps/dashboard/app/onboarding/_components/step-3.tsx`, `apps/dashboard/app/onboarding/_components/step-4.tsx`
- **Files to modify:** `apps/api/src/routes/onboarding.ts` (add `gateway-webhook-url` + `gateway-confirmed` endpoints), `apps/api/src/routes/webhooks/hotmart.ts` (set `gateway_webhook_received` flag during onboarding)
- **Webhook URL construction:** Use `env.API_BASE_URL` + `/webhooks/hotmart` + `?tenant_id={tenantId}`. Do NOT generate a secret per-tenant URL — Epic 11 already validates Hotmart webhooks by `hottok` header. The `tenant_id` query param is sufficient for routing.
- **Polling interval:** 3 seconds is reasonable. Use `setInterval` in a `useEffect` with cleanup. Alternatively, use TanStack Query `refetchInterval: 3000` for cleaner code.
- **AIAssistedTextarea in wizard:** Step 4's persona field uses the `AIAssistedTextarea` component (Story 3.3). This is the same component used in the main agent config panel — consistent UX.
- **Skip is permanent for step 3:** Once skipped, the wizard does not re-prompt for gateway setup. The owner can connect the gateway via Settings → Integrações later (Epic 11 UI).
- **`metodo_venda` values:** Must match the seed data enum from Epic 6: `spin`, `aida`, `storytelling`, `free`. Fetch available methods from `GET /api/sales-methods` (Story 6.4) to populate the select dynamically.

### Testing standards

- Component tests for polling state transitions (waiting → confirmed)
- Unit tests for the gateway confirmation endpoint logic

### Pitfalls to avoid

- Do NOT store the full persona text in `stepData[4]` — it may be long and is already in the `agent_configs` table. `stepData[4]` only needs the identifiers (`agente_nome`, `sales_method`) for the step indicator display.
- The polling `setInterval` MUST be cleared on component unmount to avoid memory leaks and ghost requests.
- Hotmart webhook handler must NOT set `gateway_webhook_received` unconditionally — only when `current_step === 3` to avoid contaminating completed onboardings.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.3, FR13, FR14]
- [Source: _bmad-output/implementation-artifacts/19-1-wizard-infrastructure-progress-persistence.md] (onboarding progress API)
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md] (Hotmart webhook handler — modify to set confirmation flag)
- [Source: _bmad-output/implementation-artifacts/7-1-agent-configuration-panel.md] (agent config API endpoint to reuse)
- [Source: _bmad-output/implementation-artifacts/3-3-ai-assisted-textarea-component.md] (AIAssistedTextarea to use in Step 4)

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
