---
baseline_commit: c7247e7
---

# Story 19.2: Wizard Steps 1-2 (Company Data & WhatsApp Connection)

Status: review

## Story

As a **new tenant owner**,
I want to enter my company details and connect my WhatsApp number through guided steps,
so that my account is branded correctly and my channel is operational.

## Acceptance Criteria

1. **Given** the tenant is on wizard Step 1, **When** they fill in company name, upload a logo, select a segment, and click "Próximo", **Then** `tenants.name`, `tenants.logo_url`, and `tenants.config.segmento` are updated, `PATCH /api/onboarding/progress` persists `{ step: 1, data: { nome, logo_url, segmento } }`, and the wizard advances to Step 2.
2. **Given** the tenant opens Step 1 after previously completing it, **When** the step renders, **Then** the form is pre-filled with `stepData[1].nome`, `stepData[1].logo_url`, `stepData[1].segmento`.
3. **Given** Step 1 validation fails (empty company name), **When** the tenant clicks "Próximo", **Then** an inline error shows "Nome da empresa é obrigatório" and the step does not advance.
4. **Given** the tenant is on Step 2, **When** the step renders, **Then** they see a checklist and three labeled input fields (phone_number_id, waba_id, access_token).
5. **Given** the tenant enters their WhatsApp credentials on Step 2 and clicks "Validar conexão", **When** validation succeeds, **Then** a green success indicator shows "Número conectado: [displayName]" and the "Próximo" button becomes enabled.
6. **Given** WhatsApp validation fails, **When** the error occurs, **Then** an inline error shows the failure reason and the "Próximo" button remains disabled.
7. **Given** Step 2 validation succeeds, **When** the tenant clicks "Próximo", **Then** `PATCH /api/onboarding/progress` persists `{ step: 2, data: { phone_number_id, waba_id } }` (NOT the access token) and the wizard advances to Step 3.

## Tasks / Subtasks

- [x] Task 1: Tenant update endpoint for Step 1 data (AC: #1, #2)
  - [x] `PATCH /api/tenants/:tenantId/onboarding/profile` implemented in `apps/api/src/routes/onboarding.ts`
  - [x] Stores `name`/`logoUrl` on tenants row, `segmento` in `tenants.config` jsonb
  - [x] RBAC: `requireTenantSession('owner')`

- [x] Task 2: Step 1 component — Company Data (AC: #1–#3)
  - [x] Implemented `apps/dashboard/app/onboarding/_components/step-1.tsx`
  - [x] Fields: `nome`, `logo_url`, `segmento` (native select)
  - [x] On submit: calls PATCH profile + PATCH progress
  - [x] Pre-fills from `stepData[1]`
  - [x] Form validation: `nome` required

- [x] Task 3: Step 2 component — WhatsApp Connection (AC: #4–#7)
  - [x] Implemented `apps/dashboard/app/onboarding/_components/step-2.tsx`
  - [x] Reuses `POST /api/tenants/:tenantId/whatsapp/connect` from Epic 4 (Story 4.2)
  - [x] Shows displayName on success, error inline on failure
  - [x] "Próximo" disabled until validation succeeds
  - [x] DOES NOT include access_token in stepData

- [x] Task 4: Tests (AC: #1, #3, #5, #6, #7)
  - [x] Component: Step 1 submit calls both PATCH APIs
  - [x] Component: Step 1 shows inline error when nome is empty
  - [x] Component: Step 2 "Próximo" remains disabled until validation succeeds
  - [x] Component: access_token is NOT included in stepData[2]
  - [x] Component: Step 1 pre-fills from stepData[1]

## Dev Notes

- **Schema correction:** `tenants` table has `name` (not `nome`) and `logoUrl` (not `logo_url`). No `segmento` column — stored in `config` jsonb.
- **V1 logo upload:** Accept `logo_url` as URL string. File upload deferred to V1.5.
- **WhatsApp validation:** Uses existing `POST .../whatsapp/connect` endpoint which returns `{ status, displayName, phoneNumberId, qualityRating, messagingTier }`. `displayName` shown as "Número conectado: {displayName}".

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Completion Notes List

- Step 1 (step-1.tsx) and Step 2 (step-2.tsx) fully implemented with API calls and validations
- step-1.test.tsx: 3 tests passing
- step-2.test.tsx: 4 tests passing
- step-indicator.test.tsx: 3 tests passing (from 19.1)

### File List

- apps/dashboard/app/onboarding/_components/step-1.tsx (implemented — was stub from 19.1)
- apps/dashboard/app/onboarding/_components/step-2.tsx (implemented — was stub from 19.1)
- apps/dashboard/app/onboarding/_components/__tests__/step-indicator.test.tsx (created)
- apps/dashboard/app/onboarding/_components/__tests__/step-1.test.tsx (created)
- apps/dashboard/app/onboarding/_components/__tests__/step-2.test.tsx (created)

### Change Log

- 2026-06-04: Implemented Steps 1 and 2 components with tests
- 2026-06-11: Code review (Opus 4.8) — no code change; see Code Review Findings

## Code Review Findings (2026-06-11, Opus 4.8)

**Verified correct (no change):**
- The `step-2` test "does NOT include access_token in the progress PATCH" is real
  — it parses the actual PATCH body and asserts `access_token` is `undefined`
  while `phone_number_id` is present (AC#7 security requirement holds).
- WhatsApp validation reuses `POST /api/tenants/:tenantId/whatsapp/connect`
  (Epic 4). Contract confirmed: the route accepts `{ phone_number_id, waba_id,
  access_token }` and returns `{ status: 'conectado', displayName }` — Step 2's
  `connectBodySchema` payload and `connectResult.displayName` read both match, so
  the "Número conectado: {displayName}" success indicator (AC#5) renders correctly.
- Step 1 pre-fill (AC#2), empty-name validation (AC#3), and the parallel
  profile+progress PATCH on "Próximo" (AC#1) are all covered by real component
  tests.

No defects. api 221/221, dashboard 65/65.
