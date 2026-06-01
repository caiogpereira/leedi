---
baseline_commit: 9ea8a05
---

# Story 19.2: Wizard Steps 1-2 (Company Data & WhatsApp Connection)

Status: ready-for-dev

## Story

As a **new tenant owner**,
I want to enter my company details and connect my WhatsApp number through guided steps,
so that my account is branded correctly and my channel is operational.

## Acceptance Criteria

1. **Given** the tenant is on wizard Step 1, **When** they fill in company name, upload a logo, select a segment, and click "Próximo", **Then** `tenants.nome`, `tenants.logo_url`, and `tenants.segmento` are updated, `PATCH /api/onboarding/progress` persists `{ step: 1, data: { nome, logo_url, segmento } }`, and the wizard advances to Step 2. **Note:** FR11 mentions "optional custom colors" — this is **deferred to V1.5** (requires per-tenant CSS variable override system). Step 1 does NOT implement custom colors in V1.
2. **Given** the tenant opens Step 1 after previously completing it, **When** the step renders, **Then** the form is pre-filled with `stepData[1].nome`, `stepData[1].logo_url`, `stepData[1].segmento`.
3. **Given** Step 1 validation fails (empty company name), **When** the tenant clicks "Próximo", **Then** an inline error shows "Nome da empresa é obrigatório" and the step does not advance.
4. **Given** the tenant is on Step 2, **When** the step renders, **Then** they see: a video guide placeholder (static link/embed), a checklist of what they need (phone_number_id, WABA ID, access token), and three labeled input fields.
5. **Given** the tenant enters their WhatsApp credentials on Step 2 and clicks "Validar conexão", **When** validation succeeds (API confirms connection via Meta), **Then** a green success indicator shows "Número conectado: +55 XX XXXXX-XXXX" and the "Próximo" button becomes enabled.
6. **Given** WhatsApp validation fails (wrong credentials), **When** the error occurs, **Then** an inline error shows the failure reason and the "Próximo" button remains disabled.
7. **Given** Step 2 validation succeeds, **When** the tenant clicks "Próximo", **Then** `PATCH /api/onboarding/progress` persists `{ step: 2, data: { phone_number_id, waba_id } }` (NOT the access token — never in stepData) and the wizard advances to Step 3.

## Tasks / Subtasks

- [ ] Task 1: Tenant update endpoint for Step 1 data (AC: #1, #2)
  - [ ] Create `PATCH /api/tenants/profile` in `apps/api/src/routes/tenants.ts` (or add if route exists):
    - Body: `{ nome?: string, logo_url?: string, segmento?: string }`
    - Updates `tenants` table for authed `tenant_id`
    - RBAC: `requireRole(['owner'])`
  - [ ] Logo upload: Accept a `multipart/form-data` `POST /api/tenants/logo` endpoint that uploads to Supabase Storage bucket `tenant-logos` and returns `logo_url`; OR accept logo_url as a string (user pastes URL) for V1 simplicity — choose the simpler option

- [ ] Task 2: Step 1 component — Company Data (AC: #1–#3)
  - [ ] Implement `apps/dashboard/app/onboarding/_components/step-1.tsx` (stub from Story 19.1)
  - [ ] Fields: `nome` (required, text), `logo_url` (optional, URL input or file upload), `segmento` (select: infoproduto/educação/saúde/outros)
  - [ ] On submit:
    - Call `PATCH /api/tenants/profile` to persist entity data
    - Call `PATCH /api/onboarding/progress { step: 1, data: { nome, logo_url, segmento } }` to persist step data
    - On both success: advance wizard to step 2
  - [ ] Pre-fill from `stepData[1]` if available (from `GET /api/onboarding/progress`)
  - [ ] Form validation: `nome` required (Zod + react-hook-form)

- [ ] Task 3: Step 2 component — WhatsApp Connection (AC: #4–#7)
  - [ ] Implement `apps/dashboard/app/onboarding/_components/step-2.tsx`
  - [ ] Static checklist section (UI only): "O que você vai precisar: ✅ Conta Meta Business ✅ Phone Number ID ✅ WABA ID ✅ Token de acesso permanente"
  - [ ] YouTube embed / link placeholder for setup video (static — use a placeholder div with text "Veja o tutorial em vídeo" for V1)
  - [ ] Three input fields: `phone_number_id` (required), `waba_id` (required), `access_token` (required, type="password")
  - [ ] "Validar conexão" button (separate from "Próximo"):
    - Calls the EXISTING WhatsApp connection validation from Epic 4 (`POST /api/connections/whatsapp/validate` from Story 4.2)
    - On success: show green status "Número conectado: +55 XX XXXXX-XXXX"; enable "Próximo"
    - On failure: show error inline; keep "Próximo" disabled
  - [ ] On "Próximo" (only enabled after validation):
    - Call `PATCH /api/onboarding/progress { step: 2, data: { phone_number_id, waba_id, connection_id } }` — do NOT include `access_token` in stepData
    - Advance wizard to step 3
  - [ ] Pre-fill `phone_number_id` and `waba_id` (NOT access_token) from `stepData[2]`

- [ ] Task 4: Tests (AC: #1, #3, #5, #6, #7)
  - [ ] Unit: Step 1 submit calls both `PATCH /api/tenants/profile` and `PATCH /api/onboarding/progress`
  - [ ] Unit: Step 1 shows inline error when `nome` is empty
  - [ ] Unit: Step 2 "Próximo" remains disabled until validation succeeds
  - [ ] Unit: access_token is NOT included in `stepData[2]` (verify PATCH body)
  - [ ] Unit: Step 1 pre-fills from `stepData[1]`

## Dev Notes

- **Files to create:** `apps/dashboard/app/onboarding/_components/step-1.tsx`, `apps/dashboard/app/onboarding/_components/step-2.tsx`
- **Files to modify:** `apps/api/src/routes/tenants.ts` (add profile PATCH endpoint)
- **Logo upload approach for V1:** Accept `logo_url` as a URL string (user provides public URL). File upload to Supabase Storage is deferred to V1.5. This avoids the complexity of multipart upload in the wizard flow.
- **Custom colors (FR11 — deferred to V1.5):** FR11 specifies "optional custom colors" for Step 1. This requires a per-tenant CSS variable override system (e.g., `tenants.config.primary_color` + runtime CSS generation or Tailwind theming). This is **not implemented in V1** — the indigo primary token is applied globally for all tenants. Custom brand colors will be added in V1.5 as a settings page option.
- **Reuse Epic 4 connection validation:** Step 2 calls the same `POST /api/connections/whatsapp/validate` endpoint built in Story 4.2. The wizard step is a UX wrapper around existing infrastructure.
- **access_token security:** Never store access_token in `stepData` (it's already encrypted in `connections` table by Story 4.1). When pre-filling Step 2, leave the access_token field blank — user must re-enter if they return to this step. This is intentional security behaviour.
- **`segmento` values:** Keep as a free enum for V1. Suggested values: `infoproduto`, `educação`, `saúde`, `consultoria`, `e-commerce`, `outros`. Store as text in `tenants.segmento`.
- **Progressive enhancement:** "Próximo" in Step 2 is disabled until `connectionValidated = true` (local state). This state is lost on page refresh — user must re-validate. This is acceptable for V1.

### Testing standards

- Component tests for form validation and button state
- Integration test: Step 2 full flow — enter credentials → validate → advance

### Pitfalls to avoid

- Do NOT advance the wizard programmatically until BOTH the entity update AND the progress update succeed.
- Do NOT show the access_token in any log, API response, or pre-filled field after it's been entered.
- Step 2 must call the EXISTING validation endpoint (Story 4.2) — do NOT duplicate WhatsApp connection logic in the wizard.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.2, FR11, FR12]
- [Source: _bmad-output/implementation-artifacts/19-1-wizard-infrastructure-progress-persistence.md] (onboarding API, step router)
- [Source: _bmad-output/implementation-artifacts/4-2-connect-whatsapp-number-tenant-configuration.md] (WhatsApp validation endpoint to reuse)
- [Source: docs/01-leedi-arquitetura.md#5.1] (tenants schema — nome, logo_url, segmento fields)

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
