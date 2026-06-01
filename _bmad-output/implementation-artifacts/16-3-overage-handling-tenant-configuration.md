---
baseline_commit: 9ea8a05
---

# Story 16.3: Overage Handling & Tenant Configuration

Status: ready-for-dev

## Story

As a tenant owner,
I want overage conversations to continue working and be billed transparently at R$0,30/conversation,
so that I never lose a sales conversation because of a plan limit.

## Acceptance Criteria

1. **Given** a tenant exceeds their monthly `conversas_limite`, **When** the next billable `conversation_window` is created, **Then** `usage_counters.overage_conversas` is incremented and `overage_valor` is updated (`+= 0.30`) via the `incrementUsage` use case (Story 16.1) — the agent continues functioning normally (no block by default).
2. **Given** the tenant's `config` (jsonb in `tenants` table) has `{ "bloquear_ao_atingir_limite": true }`, **When** the plan limit is reached AND a new conversation window would be created, **Then** the window IS NOT created, the agent is not invoked for that message, and the lead receives NO response. An internal alert is logged: `'[usage] tenant {tenantId} at limit, blocking new conversation'`. A dashboard banner shows: "Limite de conversas atingido. Reative ou faça upgrade para continuar." (see AC #5).
3. **Given** `bloquear_ao_atingir_limite = true` and the limit is reached, **When** the tenant upgrades their plan or the next billing period starts, **Then** the block is automatically lifted as `conversas_usadas < new conversas_limite`.
4. **Given** `tenants.config` has `{ "notificar_overage_a_cada": 100 }` (default ON per FR107 — "notify each R$100 overage"), **When** `overage_valor` crosses a multiple of R$100.00 (R$100, R$200, R$300...), **Then** `notification.send({ tipo: 'alerta_overage', tenantId, userId: 'owner', titulo: 'Overage: R$ X,00 extras', corpo: 'Você excedeu seu limite em X conversas excedentes (R$ Y,00 adicionais).' })` is called via the `@leedi/notification` stub. Deduplication: track sent milestones in `alertas_enviados` jsonb (key `'overage_brl_{milestone}'`, e.g. `'overage_brl_100'`). At R$0.30/conversation, R$100 milestone = ~333 conversations.
5. **Given** the block is active (`bloquear_ao_atingir_limite = true` + limit reached), **When** the tenant owner is logged in to the dashboard, **Then** a persistent red banner (non-dismissible) shows at the top: "Limite de conversas atingido. Reative ou faça upgrade para continuar." with a CTA button "Fazer upgrade" linking to `/settings/billing`.
6. **Given** a tenant owner navigates to Configurações → Uso (Usage settings), **When** the page loads, **Then** they see two toggles: "Bloquear ao atingir limite" (default OFF) and "Notificar a cada R$100 em excedente" (default ON), plus the current values from `tenants.config`. Changes are saved immediately on toggle (no submit button).
7. **Given** the tenant saves "Bloquear ao atingir limite = ON" and they are ALREADY over the limit, **When** the setting is saved, **Then** the system does not retroactively destroy open conversations — the block only applies to NEW conversation windows created after the setting is saved.

## Tasks / Subtasks

- [ ] Task 1: Block-at-limit check in conversation window creation (AC: #1, #2, #3, #7)
  - [ ] In `packages/usage/src/use-cases/increment-usage.ts` (Story 16.1), before incrementing:
    - If `conversas_usadas >= conversas_limite`:
      - Read `tenant.config.bloquear_ao_atingir_limite` (boolean, default false)
      - If `true`: return `{ blocked: true }` — caller must NOT create the conversation window or invoke agent
      - If `false`: proceed to increment `overage_conversas` and `overage_valor`
  - [ ] In `apps/api/src/use-cases/messaging/create-conversation-window.ts` (Story 5.5):
    - Call `incrementUsage()` BEFORE inserting the window row (not after)
    - Check return value: if `{ blocked: true }`, skip window creation, skip agent invocation, log warning, return `{ blocked: true }` to caller
    - Caller (webhook message handler) discards the message silently (lead gets no response — this is correct behavior per FR107)
- [ ] Task 2: Overage notification milestones in `incrementUsage` (AC: #4)
  - [ ] In `packages/usage/src/use-cases/increment-usage.ts`, after incrementing `overage_conversas`:
    - Check if `overage_valor` has crossed a new R$100 milestone: `Math.floor(newOverageValor / 100) > Math.floor((newOverageValor - 0.30) / 100)` — true only on the conversation that crosses the R$100 boundary
    - Compute: `milestone = Math.floor(newOverageValor / 100) * 100` (e.g., 100, 200, 300)
    - Check `tenant.config.notificar_overage_a_cada` (default 100 BRL if absent)
    - If milestone reached AND not already in `alertas_enviados` (key `'overage_brl_{milestone}'`, e.g. `'overage_brl_100'`):
      - Call notification stub with `tipo: 'alerta_overage'` and `corpo: 'Você excedeu seu limite em X conversas excedentes (R$ {milestone},00 adicionais).'`
      - Add `'overage_brl_{milestone}'` to `alertas_enviados`
      - Note: at R$0.30/conversation, R$100 = ~333 conversations. FR107 defines R$100 value threshold, not 100-conversation count.
- [ ] Task 3: API route — usage settings PATCH (AC: #6)
  - [ ] Add `PATCH /api/usage/settings` to `apps/api/src/routes/usage.ts`
  - [ ] Body: `{ bloquear_ao_atingir_limite?: boolean; notificar_overage_a_cada?: number }`
  - [ ] Validates role: owner only (RBAC check)
  - [ ] Merges values into `tenants.config` jsonb: `UPDATE tenants SET config = config || '{"bloquear_ao_atingir_limite": true}'::jsonb WHERE id = ? AND tenant_id = ?`
  - [ ] Returns updated config
- [ ] Task 4: Usage settings UI (AC: #6)
  - [ ] Create `apps/dashboard/app/(dashboard)/settings/usage/page.tsx`
  - [ ] Two `Switch` components (shadcn/ui) for each toggle
  - [ ] `useMutation` (TanStack Query) calling `PATCH /api/usage/settings` on toggle change
  - [ ] Show current overage cost summary: "Você tem X conversas excedentes este mês (R$ Y,00)"
  - [ ] Link from Usage widget "Ver histórico" → `/usage` already exists (Story 16.2); add link to settings from usage page: "Configurar alertas →"
- [ ] Task 5: Block banner in dashboard layout (AC: #5)
  - [ ] In `apps/dashboard/app/(dashboard)/layout.tsx` (the shared dashboard layout):
    - Fetch `GET /api/usage/current` (Story 16.2, already exists)
    - If `blocked = true` in response (add this field to the response when limit reached + block enabled):
    - Render a non-dismissible red banner at top of content area with the message and upgrade CTA
  - [ ] `blocked` flag: add to `GET /api/usage/current` response: `blocked: boolean` (true when `bloquear = true AND conversas_usadas >= conversas_limite`)
- [ ] Task 6: Tests (AC: #1, #2, #4, #5, #7)
  - [ ] Unit: `incrementUsage` returns `{ blocked: true }` when limit reached + block enabled
  - [ ] Unit: `incrementUsage` continues to increment overage when limit reached + block disabled
  - [ ] Unit: overage notification fires at exactly 100, 200, 300 (not at 50, 101)
  - [ ] Unit: PATCH settings merges into config jsonb without overwriting other config keys
  - [ ] Unit: block banner renders when `blocked = true` in layout data
  - [ ] Unit: `create-conversation-window` does not insert row when `incrementUsage` returns `{ blocked: true }`

## Dev Notes

- **Files to create:** `apps/dashboard/app/(dashboard)/settings/usage/page.tsx`
- **Files to modify:** `packages/usage/src/use-cases/increment-usage.ts` (add block check + overage milestone notification), `apps/api/src/routes/usage.ts` (add PATCH /settings + update /current to include `blocked` flag), `apps/api/src/use-cases/messaging/create-conversation-window.ts` (check block before inserting), `apps/dashboard/app/(dashboard)/layout.tsx` (add banner)
- **`tenants.config` defaults:** When reading `bloquear_ao_atingir_limite`, use `config?.bloquear_ao_atingir_limite ?? false`. When reading `notificar_overage_a_cada`, use `config?.notificar_overage_a_cada ?? 100`. Never assume keys exist.
- **Owner-only RBAC for settings PATCH:** Use `requireRole(['owner'])` middleware from `@leedi/auth`.
- **Incremental upsert order matters:** Call `incrementUsage()` BEFORE creating the window row. If block is detected, the window must not be created. If increment succeeds (no block), create window and inbox_assignment as normal.
- **`notificar_overage_a_cada`:** FR107 says "notify each R$100 overage". At R$0.30/conversation, 100 conversations = R$30.00 overage. But FR107 means every R$100 in overage value, which is 100/0.30 = ~333 conversations. Interpretation: fire notification when `overage_valor` crosses multiples of R$100 (not every 100 conversations). Implement: `Math.floor(overage_valor / 100) > Math.floor((overage_valor - 0.30) / 100)` = crossed a R$100 milestone.
- **No new npm packages.**

### Testing standards

- Vitest unit tests for all `incrementUsage` code paths (block vs. no block vs. overage vs. milestone).
- Integration test: full message flow where block returns → `create-conversation-window` skips insert → no inbox_assignment created → no agent invocation.

### Pitfalls to avoid

- Do NOT block the current open conversation if already in progress — blocking only applies to NEW window creation.
- The block setting change must be idempotent: toggling OFF when already OFF is a no-op (PATCH merges the value, not replaces).
- Do NOT send the block banner to admin/operator roles — only show to owner (or show to all but link billing only to owner). Actually, all roles should see the banner (it's operational awareness), but the "Fazer upgrade" CTA should only be clickable for owners.
- The `overage_valor` milestone interpretation (R$100 in overage value) is different from R$100 per 100 conversations — see Dev Notes above. Document this clearly in the notification body.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (usage_counters, tenants.config)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.3, FR106, FR107]
- [Source: _bmad-output/implementation-artifacts/16-1-conversation-counting-usage-counter.md] (incrementUsage — extend with block logic)
- [Source: _bmad-output/implementation-artifacts/16-2-usage-dashboard-widget-threshold-alerts.md] (alertas_enviados pattern for deduplication)
- [Source: _bmad-output/implementation-artifacts/14-3-human-takeover-manual-reply-return-to-bot.md] (@leedi/notification stub)
- [Source: _bmad-output/implementation-artifacts/5-5-conversation-window-tracking-24h-billing-unit.md] (create-conversation-window — add block check here)

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
