---
baseline_commit: 9ea8a05
---

# Story 16.2: Usage Dashboard Widget & Threshold Alerts

Status: ready-for-dev

## Story

As a tenant operator,
I want to see my conversation usage clearly and receive alerts before I hit my limit,
so that I can plan and avoid surprises.

## Acceptance Criteria

1. **Given** a tenant has used 830 of 1,000 conversations in the current month, **When** they view the dashboard (or the Usage section), **Then** a usage widget shows: "830 / 1.000 conversas (83%)" with a labeled progress bar. The bar is styled: 0–79% → `bg-green-500`, 80–94% → `bg-amber-500`, 95–99% → `bg-orange-500`, ≥100% → `bg-red-500`.
2. **Given** overage conversations exist (`overage_conversas > 0`), **When** the widget renders, **Then** it additionally shows in orange: "Conversas excedentes: X (R$ Y,00 extra)" below the progress bar.
3. **Given** the tenant views the Usage section at `/usage` (standalone page) or via the dashboard widget, **When** they click "Ver histórico", **Then** a table shows the last 6 months of `usage_counters` records with: period (formatted "Maio 2026"), `conversas_usadas`, `conversas_limite`, `overage_conversas`, `overage_valor`.
4. **Given** `usage_counters.conversas_usadas` reaches 80% of `conversas_limite` for the first time in a period, **When** the threshold is crossed (detected during `incrementUsage` in Story 16.1), **Then** `notification.send({ tipo: 'alerta_uso', tenantId, userId: 'all_operators', titulo: 'Uso em 80%', corpo: 'Você usou 80% das suas conversas do mês.' })` is called via the `@leedi/notification` stub. The threshold is only triggered once per period per level (80%, 95%, 100%).
5. **Given** usage reaches 95% and then 100%, **When** each threshold is crossed, **Then** a separate notification call is made with the respective percentage in the `corpo` field.
6. **Given** a threshold notification was already sent for a given period and level (e.g., 80% in `'2026-06'`), **When** `incrementUsage` runs again and usage is still ≥ 80%, **Then** no duplicate notification is sent. Deduplication is managed via a `usage_counters.alertas_enviados` JSON field (or Redis set key `usage:alert:{tenantId}:{periodo}:{level}`).
7. **Given** the usage widget is shown on the main dashboard page, **When** the widget API call fails, **Then** it shows: "Dados de uso indisponíveis." without breaking other dashboard widgets.

## Tasks / Subtasks

- [ ] Task 1: Add alert deduplication to `usage_counters` (AC: #6)
  - [ ] Add column `alertas_enviados` (jsonb default `'[]'`) to `usage_counters` in migration
  - [ ] Stores array of already-sent thresholds: `['80', '95', '100']`
  - [ ] Update `packages/db/src/schema/usage.ts` + migration
- [ ] Task 2: Threshold alert logic in `incrementUsage` (AC: #4, #5, #6)
  - [ ] In `packages/usage/src/use-cases/increment-usage.ts` (Story 16.1), after the upsert completes:
    - Re-read updated counter record (or compute pct from upsert result)
    - `pct = (conversas_usadas / conversas_limite) × 100`
    - For each threshold in `[80, 95, 100]`:
      - If `pct >= threshold` AND `threshold` not in `alertas_enviados`:
        - Call `notification.send({ tipo: 'alerta_uso', tenantId, userId: 'all_operators', titulo: \`Uso em ${threshold}%\`, corpo: \`Você usou ${threshold}% das suas conversas do mês.\` })`
        - Update `alertas_enviados` to include the threshold (atomic: `alertas_enviados = alertas_enviados || '["${threshold}"]'::jsonb`)
  - [ ] Import `@leedi/notification` (stub); wrap notification call in try/catch — alert failure must NOT fail the usage increment
- [ ] Task 3: API routes — usage widget + history (AC: #1, #2, #3, #7)
  - [ ] Add `GET /api/usage/current` to `apps/api/src/routes/usage.ts`
    - Calls `getUsageCounter({ tenantId, periodo: currentPeriod })` from `@leedi/usage`
    - Returns: `{ conversasUsadas, conversasLimite, overageConversas, overageValor, pct }` (no `custoIaUsd`)
  - [ ] Add `GET /api/usage/history?limit=6` to same router
    - Queries last 6 `usage_counters` records for tenant ordered by `periodo DESC`
  - [ ] Register `apps/api/src/routes/usage.ts` in `apps/api/src/app.ts`
- [ ] Task 4: Usage widget UI (AC: #1, #2, #7)
  - [ ] Create `apps/dashboard/app/(dashboard)/components/usage-widget.tsx`
  - [ ] Progress bar: color coded per thresholds (AC #1)
  - [ ] Overage row: orange text (AC #2) — only when `overage_conversas > 0`
  - [ ] TanStack Query: `refetchInterval: 60000`
  - [ ] Error state: "Dados de uso indisponíveis." (AC #7)
  - [ ] "Ver histórico" button/link (AC #3)
  - [ ] Add widget to `apps/dashboard/app/(dashboard)/page.tsx` (below campaign widget from Story 15.3)
- [ ] Task 5: Usage history page (AC: #3)
  - [ ] Create `apps/dashboard/app/(dashboard)/usage/page.tsx`
  - [ ] Table with columns: Período (formatted), Conversas usadas, Limite, Excedentes, Valor excedente (formatted as "R$ X,00")
  - [ ] Link from dashboard widget "Ver histórico" → `/usage`
- [ ] Task 6: Tests (AC: #1, #4, #5, #6)
  - [ ] Unit: progress bar color thresholds render correctly at 79, 80, 94, 95, 99, 100
  - [ ] Unit: threshold alert triggered at exactly 80% (not before, not twice)
  - [ ] Unit: `alertas_enviados` prevents duplicate notification at same threshold in same period
  - [ ] Unit: notification failure does not propagate error from `incrementUsage`
  - [ ] Unit: usage history returns correct last 6 periods

## Dev Notes

- **Files to create:** `apps/api/src/routes/usage.ts`, `apps/dashboard/app/(dashboard)/components/usage-widget.tsx`, `apps/dashboard/app/(dashboard)/usage/page.tsx`
- **Files to modify:** `packages/db/src/schema/usage.ts` (add `alertas_enviados` column), migration file, `packages/usage/src/use-cases/increment-usage.ts` (add threshold logic), `apps/api/src/app.ts` (register usage router), `apps/dashboard/app/(dashboard)/page.tsx` (add usage widget)
- **Threshold detection timing:** Threshold detection happens AFTER the upsert, reading the new `conversas_usadas` value. Since the upsert is atomic, the check is always consistent.
- **Alternative deduplication:** If `alertas_enviados` jsonb column feels heavy, use Redis key `usage:alert:{tenantId}:{periodo}:{level}` (SET with NX + TTL 31 days). Either is fine — choose based on simplicity. The jsonb column is recommended (no extra infrastructure).
- **Period formatting in UI:** `'2026-06'` → `"Junho 2026"`. Use `date-fns/locale/pt-BR` with `format(parse(periodo, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR })`.
- **`overage_valor` formatting:** Use `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- **No new npm packages** (date-fns already in stack).

### Testing standards

- Vitest unit tests for `incrementUsage` threshold logic (mock notification stub).
- Component tests for `UsageWidget` at each color threshold.

### Pitfalls to avoid

- Do NOT trigger threshold alerts for `billable = false` increments (playground) — only `billable = true` increments touch `conversas_usadas` and thus can trigger thresholds.
- Do NOT expose `custo_ia_usd` in `/api/usage/current` or `/api/usage/history` tenant-facing endpoints.
- The `alertas_enviados` update MUST be in the same atomic upsert or a separate immediate UPDATE — not eventually consistent. Race condition: two concurrent messages both hit 80% → both check `alertas_enviados = []` → both send notification. Mitigate with Postgres `UPDATE ... WHERE NOT (alertas_enviados @> '["80"]'::jsonb) RETURNING *` — only update and notify if the row was actually updated.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (usage_counters schema)
- [Source: docs/01-leedi-arquitetura.md#6.13 Domínio Notification]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.2, FR104, FR105]
- [Source: _bmad-output/implementation-artifacts/16-1-conversation-counting-usage-counter.md] (incrementUsage use case — extend with threshold logic)
- [Source: _bmad-output/implementation-artifacts/14-3-human-takeover-manual-reply-return-to-bot.md] (@leedi/notification stub — reuse same port)
- [Source: _bmad-output/implementation-artifacts/15-1-core-sales-metrics-dashboard.md] (dashboard page structure — add usage widget)

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
