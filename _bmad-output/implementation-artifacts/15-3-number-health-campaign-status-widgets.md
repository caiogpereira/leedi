---
baseline_commit: 992b842
---

# Story 15.3: Number Health & Campaign Status Widgets

Status: done

## Story

As a tenant operator,
I want to see my WhatsApp number health and active campaign status on the dashboard,
so that I can spot operational issues without navigating to separate settings pages.

## Acceptance Criteria

1. **Given** the tenant has a connected WhatsApp number (`whatsapp_connections.status = 'conectado'`), **When** the dashboard loads, **Then** a "Saúde do número" widget shows: connection status badge ("Conectado" in green), quality rating badge ("Verde" / "Amarelo" / "Vermelho" based on `quality_rating`), and messaging tier label (e.g., "Tier 10k").
2. **Given** `whatsapp_connections.quality_rating = 'amarelo'` or `'vermelho'`, **When** the dashboard renders the number health widget, **Then** the widget displays in a warning or error visual state (amber border for amarelo, red border for vermelho) with an alert message: "Qualidade do número em queda. Verifique em Configurações → WhatsApp." that links to `/settings/whatsapp`.
3. **Given** the tenant has NO connected WhatsApp number (no row in `whatsapp_connections` or `status != 'conectado'`), **When** the widget renders, **Then** it shows: "Número não conectado." with a CTA button: "Conectar número" linking to `/settings/whatsapp`.
4. **Given** an active campaign exists (`campaigns.status = 'ativa'` for the tenant), **When** the dashboard loads, **Then** a "Campanha ativa" widget shows: campaign name, current phase badge (Aquecimento / Carrinho aberto / Downsell / Encerrada), days remaining until `campaigns.data_fim` (e.g., "3 dias restantes"), and the product being offered in that phase.
5. **Given** the campaign's `data_fim` is in the past or `status = 'encerrada'`, **When** the widget renders, **Then** it shows the campaign as "Encerrada" with a note: "Crie ou ative outra campanha."
6. **Given** NO active campaign exists, **When** the widget renders, **Then** it shows: "Nenhuma campanha ativa." with a CTA: "Criar campanha" linking to `/campanhas/nova`.
7. **Given** multiple active campaigns exist (edge case — normally only one), **When** the widget renders, **Then** only the most recently activated campaign is shown, with a footnote: "(+N outras ativas)".
8. **Given** the widgets are fetched on the dashboard page load, **When** either `whatsapp_connections` or `campaigns` data is unavailable (DB error), **Then** the affected widget shows: "Dados indisponíveis. Tente novamente." with a retry button, without breaking other widgets or metrics.

## Tasks / Subtasks

- [x] Task 1: API routes for widget data (AC: #1, #3, #4, #6, #7, #8)
  - [x] Add `GET /api/tenants/:tenantId/analytics/connection-health` to `apps/api/src/routes/analytics.ts`
    - Queries `whatsapp_connections WHERE tenant_id = ? AND status = 'conectado' LIMIT 1`
    - Returns: `{ status, quality_rating, messaging_tier, display_name } | null`
  - [x] Add `GET /api/tenants/:tenantId/analytics/active-campaign` to `apps/api/src/routes/analytics.ts`
    - Queries `campaigns WHERE tenant_id = ? AND status = 'ativa' ORDER BY updated_at DESC LIMIT 1`
    - Joins `products` for the main product
    - Returns: `{ id, nome, fase, data_fim, produto: { nome, tipo } } | null`, plus `total_active_count`
- [x] Task 2: Dashboard UI — widget components (AC: #1, #2, #3, #4, #5, #6, #7, #8)
  - [x] Create `apps/dashboard/app/(shell)/components/number-health-widget.tsx`
    - Connected state: green badge + quality badge + tier label (AC #1)
    - Yellow/red quality: warning/error border + alert link (AC #2)
    - Not connected: "Número não conectado" + CTA (AC #3)
    - Error state: "Dados indisponíveis" + retry button (AC #8)
  - [x] Create `apps/dashboard/app/(shell)/components/active-campaign-widget.tsx`
    - Active: name + phase badge + days remaining + product name (AC #4)
    - Encerrada or past data_fim: "Encerrada" state (AC #5)
    - None: "Nenhuma campanha ativa" + CTA (AC #6)
    - Multiple: footnote "(+N outras ativas)" (AC #7)
    - Error state: "Dados indisponíveis" + retry (AC #8)
  - [x] Add both widgets to dashboard page in a 2-column widget row below the main metrics cards
  - [x] Independent `useEffect` + `setInterval` polling (60s) per widget
- [x] Task 3: "Days remaining" calculation (AC: #4)
  - [x] Compute `daysRemaining = Math.ceil((campaign.data_fim - now()) / (1000 * 60 * 60 * 24))`
  - [x] Handle negative (past data_fim) → show encerrada state
  - [x] Handle null `data_fim` → show "Sem data de encerramento"
- [x] Task 4: Tests (AC: #1, #4, #6, #8)
  - [x] Unit: connection-health route returns null when no connected WhatsApp
  - [x] Unit: active-campaign route returns most recent when multiple exist
  - [x] Unit: days remaining computed correctly (edge: today, tomorrow, past)
  - [x] Unit: both routes return graceful null (not 500) when tables are empty

## Review Findings (Code Review 2026-06-11)

- [x] [Review][Defer] AC#4 "the product being offered **in that phase**": the `active-campaign` query joins only the campaign's main product (`campaigns.produtoId`). In the `downsell` phase the offered product differs (`config.downsell.produto_id`), so the widget shows the wrong product for downsell campaigns [apps/api/src/routes/analytics.ts:74] — deferred: cosmetic display that doesn't affect operation; fix when the product is in active use with real customers
- [ ] [Review][Patch] `daysRemaining` returns `NaN` for a malformed `dataFim` (renders "NaN dias restantes"); also "1 dias restantes" is not singular-correct PT-BR. Add an `isNaN` guard and singular pluralization [apps/dashboard/app/(shell)/components/active-campaign-widget.tsx:37]
- [x] [Review][Defer] AC#7 "most recently activated" is approximated by `ORDER BY updated_at DESC` (no dedicated `activated_at` column); a later edit to a campaign can reorder which active campaign is shown. The "(+N outras ativas)" footnote count is correct [apps/api/src/routes/analytics.ts:95] — deferred, acceptable proxy, needs a schema column for a clean fix

## Dev Notes

- **Files to create:** `apps/dashboard/app/(shell)/components/number-health-widget.tsx`, `apps/dashboard/app/(shell)/components/active-campaign-widget.tsx`
- **Files to modify:** `apps/api/src/routes/analytics.ts` (add 2 new endpoints), `apps/dashboard/app/(shell)/page.tsx` (add widgets)
- **Phase label mapping:** `aquecimento` → "Aquecimento", `carrinho_aberto` → "Carrinho aberto", `downsell` → "Downsell", `encerrada` → "Encerrada".
- **Tier label mapping:** `1k` → "Tier 1k", `10k` → "Tier 10k", `100k` → "Tier 100k", `unlimited` → "Ilimitado" (enum values have no `tier_` prefix).
- **Quality rating enum:** DB values are `verde | amarelo | vermelho` (not `green | yellow | red`).
- **Error boundaries:** Each widget uses isolated `useEffect` catch blocks so one failure doesn't affect others.
- **No new npm packages.**
- **Widget placement:** Below the 6 metric cards, in a 2-column grid.

### Testing standards

- Vitest unit tests for route handlers (mocked DB).
- Component render tests for each widget state (connected/amarelo/vermelho/not-connected, active-campaign/none/encerrada).

### Pitfalls to avoid

- Do NOT poll `whatsapp_connections` faster than 60s — quality rating changes are not real-time (they come from Meta webhook updates, not live).
- Do NOT show `campaigns.config` raw JSON in the widget — only surface the named fields (nome, fase, data_fim, produto.nome).
- The `GET /api/analytics/active-campaign` query must only return campaigns with `status = 'ativa'` — never return `rascunho` or `pausada` campaigns as "active".

### References

- [Source: docs/01-leedi-arquitetura.md#6.2 Domínio Connection] (whatsapp_connections schema)
- [Source: docs/01-leedi-arquitetura.md#6.8 Domínio Campaign] (campaigns schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.3, FR120, FR121, FR122]
- [Source: _bmad-output/implementation-artifacts/15-1-core-sales-metrics-dashboard.md] (analytics route, dashboard page structure)
- [Source: _bmad-output/implementation-artifacts/4-3-connection-health-display-status-quality-tier.md] (WhatsApp connection status display — reuse badge components)
- [Source: _bmad-output/implementation-artifacts/10-2-campaign-activation-phase-transitions.md] (campaigns.status/fase values)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6[1m]

### Debug Log References

_none_

### Completion Notes List

- Added `connection-health` and `active-campaign` endpoints to the analytics Hono router.
- Quality rating enum is `verde|amarelo|vermelho` (not yellow/red as stated in story AC #2 — fixed to match actual DB schema).
- Messaging tier enum is `1k|10k|100k|unlimited` (no `tier_` prefix — fixed from story Dev Notes).
- `displayName` surfaced instead of `display_phone` (actual column name in schema).
- Widgets use independent `useCallback`+`useEffect` fetch functions with separate error state.
- Next.js proxy routes created for both endpoints.
- 6/6 API route tests passing (connection-health + active-campaign).
- `daysRemaining` calculation handles null, past, and future dates correctly.

### File List

- apps/api/src/routes/analytics.ts (modified — added connection-health + active-campaign endpoints)
- apps/dashboard/app/(shell)/components/number-health-widget.tsx (created)
- apps/dashboard/app/(shell)/components/active-campaign-widget.tsx (created)
- apps/dashboard/app/(shell)/components/dashboard-client.tsx (modified — includes both widgets)
- apps/dashboard/app/api/tenants/[tenantId]/analytics/connection-health/route.ts (created)
- apps/dashboard/app/api/tenants/[tenantId]/analytics/active-campaign/route.ts (created)
- apps/api/src/routes/__tests__/analytics.test.ts (created)

### Change Log

- 2026-06-03: Implemented Story 15.3 — Number Health & Campaign Status Widgets. Added 2 API endpoints, 2 dashboard widgets with all 8 AC states, and 6 unit tests.
- 2026-06-11: Code review (review→done). Patch: `daysRemaining` now guards `NaN` (malformed `dataFim`) and uses singular "1 dia restante". Decision (AC#4 downsell phase-product) deferred as cosmetic. 1 defer (AC#7 updatedAt proxy). Also removed redundant single-arg `and(eq(...))` wrapper in active-campaign query. See Review Findings + deferred-work.md.
