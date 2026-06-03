---
baseline_commit: 9ea8a05
---

# Story 16.3: Overage Handling & Tenant Configuration

Status: review

## Story

As a tenant owner,
I want overage conversations to continue working and be billed transparently at R$0,30/conversation,
so that I never lose a sales conversation because of a plan limit.

## Acceptance Criteria

1. **Given** a tenant exceeds their monthly `conversas_limite`, **When** the next billable `conversation_window` is created, **Then** `usage_counters.overage_conversas` is incremented and `overage_valor` is updated (`+= 0.30`) — agent continues normally (no block by default).
2. **Given** the tenant's `config` has `{ "bloquear_ao_atingir_limite": true }`, **When** the plan limit is reached AND a new conversation window would be created, **Then** the window IS NOT created and the lead receives NO response.
3. **Given** `bloquear_ao_atingir_limite = true` and limit is reached, **When** the tenant upgrades or next billing period starts, **Then** the block lifts automatically as `conversas_usadas < new conversas_limite`.
4. **Given** `tenants.config` has `{ "notificar_overage_a_cada": 100 }`, **When** `overage_valor` crosses a multiple of R$100.00, **Then** an `alerta_overage` notification is dispatched. Deduplication via `alertas_enviados` (key `'overage_brl_100'`, etc.).
5. **Given** the block is active, **When** the tenant owner is logged in, **Then** a persistent red banner shows at the top of the dashboard.
6. **Given** a tenant owner navigates to Configurações → Uso, **When** the page loads, **Then** they see two toggles: "Bloquear ao atingir limite" and "Notificar a cada R$100 em excedente". Changes saved immediately on toggle.
7. **Given** block is toggled ON while already over limit, **When** saved, **Then** only NEW windows are blocked — existing open conversations are unaffected.

## Tasks / Subtasks

- [x] Task 1: Block-at-limit check in conversation window creation (AC: #1, #2, #3, #7)
  - [x] `checkUsageBlock(tenantId)` in `packages/usage/src/use-cases/check-usage-block.ts` — read-only, no increment
  - [x] Called in `apps/api/src/routes/webhook-meta.ts` BEFORE `resolveConversationWindow`
  - [x] If blocked, returns early — lead gets no response (correct per FR107)
  - [x] `incrementUsage` also checks block internally (AC#2 defense-in-depth)
- [x] Task 2: Overage notification milestones in `incrementUsage` (AC: #4)
  - [x] Milestone detection: `Math.floor(overage_valor / 100) > Math.floor((overage_valor - 0.30) / 100)`
  - [x] Returns `alertsDue` with `tipo: 'alerta_overage'` — caller fires notification
  - [x] Deduplication via `alertas_enviados` key `'overage_brl_{milestone}'`
- [x] Task 3: API route — usage settings PATCH (AC: #6)
  - [x] `PATCH /api/tenants/:tenantId/usage/settings` — owner only (`billing:write`)
  - [x] Merges into `tenants.config` jsonb without overwriting other keys
- [x] Task 4: Usage settings UI (AC: #6)
  - [x] `apps/dashboard/app/(shell)/configuracoes/uso/page.tsx` + `usage-settings-client.tsx`
  - [x] Two toggle switches; saves immediately on change
  - [x] Link "Configurar alertas →" from history page
- [x] Task 5: Block banner in dashboard layout (AC: #5)
  - [x] `apps/dashboard/app/(shell)/layout.tsx` calls `checkUsageBlock(tenantId)` server-side
  - [x] Non-dismissible red banner with "Fazer upgrade" CTA linking to `/configuracoes/billing`
  - [x] `getUsageCounter` includes `blocked: boolean` field
- [x] Task 6: Tests (AC: #1, #2, #4, #5, #7)
  - [x] `incrementUsage` block-at-limit + overage-continues tests in `increment-usage.test.ts`
  - [x] PATCH settings + 400 for empty body in `usage.test.ts`
  - [x] `checkUsageBlock` covered indirectly by `incrementUsage` tests

## Dev Notes

- Block check uses `checkUsageBlock` (read-only) at apps/api layer before window creation
- Settings toggle uses native button with `role="switch"` (no shadcn/ui Switch needed — consistent with existing dashboard style)
- Dashboard layout imports `@leedi/usage` directly (server component, not Edge middleware — safe)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- Block logic split into `checkUsageBlock` (read-only check) + `incrementUsage` (read+write): clean separation of concerns
- `webhook-meta.ts` calls `checkUsageBlock` before `resolveConversationWindow` for best-effort blocking
- Overage milestone = `Math.floor(overage_valor / R$100) > Math.floor((overage_valor - R$0.30) / R$100)`
- Settings PATCH uses raw SQL jsonb `||` operator (Drizzle doesn't support it natively)
- Block banner in layout.tsx runs server-side — avoids client-side flash

### File List

- packages/usage/src/use-cases/check-usage-block.ts (new)
- packages/usage/src/index.ts (modified — exported checkUsageBlock)
- apps/api/src/routes/usage.ts (PATCH /settings added)
- apps/api/src/routes/webhook-meta.ts (modified — block check before resolveConversationWindow)
- apps/dashboard/app/(shell)/layout.tsx (modified — block banner)
- apps/dashboard/app/(shell)/configuracoes/uso/page.tsx (new)
- apps/dashboard/app/(shell)/configuracoes/uso/usage-settings-client.tsx (new)
- apps/dashboard/package.json (modified)

### Change Log

- 2026-06-03: Story 16.3 implemented — block-at-limit, overage milestones, settings UI, block banner in layout
