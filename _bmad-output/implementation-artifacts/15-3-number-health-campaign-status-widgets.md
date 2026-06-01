---
baseline_commit: 9ea8a05
---

# Story 15.3: Number Health & Campaign Status Widgets

Status: ready-for-dev

## Story

As a tenant operator,
I want to see my WhatsApp number health and active campaign status on the dashboard,
so that I can spot operational issues without navigating to separate settings pages.

## Acceptance Criteria

1. **Given** the tenant has a connected WhatsApp number (`whatsapp_connections.status = 'conectado'`), **When** the dashboard loads, **Then** a "Saúde do número" widget shows: connection status badge ("Conectado" in green), quality rating badge ("Verde" / "Amarelo" / "Vermelho" based on `quality_rating`), and messaging tier label (e.g., "Tier 10k").
2. **Given** `whatsapp_connections.quality_rating = 'yellow'` or `'red'`, **When** the dashboard renders the number health widget, **Then** the widget displays in a warning or error visual state (amber border for yellow, red border for red) with an alert message: "Qualidade do número em queda. Verifique em Configurações → WhatsApp." that links to `/settings/whatsapp`.
3. **Given** the tenant has NO connected WhatsApp number (no row in `whatsapp_connections` or `status != 'conectado'`), **When** the widget renders, **Then** it shows: "Número não conectado." with a CTA button: "Conectar número" linking to `/settings/whatsapp`.
4. **Given** an active campaign exists (`campaigns.status = 'ativa'` for the tenant), **When** the dashboard loads, **Then** a "Campanha ativa" widget shows: campaign name, current phase badge (Aquecimento / Carrinho aberto / Downsell / Encerrada), days remaining until `campaigns.data_fim` (e.g., "3 dias restantes"), and the product being offered in that phase.
5. **Given** the campaign's `data_fim` is in the past or `status = 'encerrada'`, **When** the widget renders, **Then** it shows the campaign as "Encerrada" with a note: "Crie ou ative outra campanha."
6. **Given** NO active campaign exists, **When** the widget renders, **Then** it shows: "Nenhuma campanha ativa." with a CTA: "Criar campanha" linking to `/campanhas/nova`.
7. **Given** multiple active campaigns exist (edge case — normally only one), **When** the widget renders, **Then** only the most recently activated campaign is shown, with a footnote: "(+N outras ativas)".
8. **Given** the widgets are fetched on the dashboard page load, **When** either `whatsapp_connections` or `campaigns` data is unavailable (DB error), **Then** the affected widget shows: "Dados indisponíveis. Tente novamente." with a retry button, without breaking other widgets or metrics.

## Tasks / Subtasks

- [ ] Task 1: API routes for widget data (AC: #1, #3, #4, #6, #7, #8)
  - [ ] Add `GET /api/analytics/connection-health` to `apps/api/src/routes/analytics.ts`
    - Queries `whatsapp_connections WHERE tenant_id = ? AND status = 'conectado' LIMIT 1`
    - Returns: `{ status, quality_rating, messaging_tier, display_phone } | null`
  - [ ] Add `GET /api/analytics/active-campaign` to `apps/api/src/routes/analytics.ts`
    - Queries `campaigns WHERE tenant_id = ? AND status = 'ativa' ORDER BY updated_at DESC LIMIT 1`
    - Joins `products` for the product in the current `fase`
    - Returns: `{ id, nome, fase, data_fim, produto: { nome, tipo } } | null`, plus `total_active_count` for footnote
- [ ] Task 2: Dashboard UI — widget components (AC: #1, #2, #3, #4, #5, #6, #7, #8)
  - [ ] Create `apps/dashboard/app/(dashboard)/components/number-health-widget.tsx`
    - Connected state: green badge + quality badge + tier label (AC #1)
    - Yellow/red quality: warning/error border + alert link (AC #2)
    - Not connected: "Número não conectado" + CTA (AC #3)
    - Error state: "Dados indisponíveis" + retry button (AC #8)
  - [ ] Create `apps/dashboard/app/(dashboard)/components/active-campaign-widget.tsx`
    - Active: name + phase badge + days remaining + product name (AC #4)
    - Encerrada or past data_fim: "Encerrada" state (AC #5)
    - None: "Nenhuma campanha ativa" + CTA (AC #6)
    - Multiple: footnote "(+N outras ativas)" (AC #7)
    - Error state: "Dados indisponíveis" + retry (AC #8)
  - [ ] Add both widgets to `apps/dashboard/app/(dashboard)/page.tsx` in a 2-column widget row below the main metrics cards
  - [ ] TanStack Query for each widget independently (separate `useQuery` calls, `refetchInterval: 60000`)
- [ ] Task 3: "Days remaining" calculation (AC: #4)
  - [ ] Compute `daysRemaining = Math.ceil((campaign.data_fim - now()) / (1000 * 60 * 60 * 24))`
  - [ ] Handle negative (past data_fim) → show encerrada state
  - [ ] Handle null `data_fim` → show "Sem data de encerramento"
- [ ] Task 4: Tests (AC: #1, #4, #6, #8)
  - [ ] Unit: connection-health route returns null when no connected WhatsApp
  - [ ] Unit: active-campaign route returns most recent when multiple exist
  - [ ] Unit: days remaining computed correctly (edge: today, tomorrow, past)
  - [ ] Unit: both routes return graceful null (not 500) when tables are empty

## Dev Notes

- **Files to create:** `apps/dashboard/app/(dashboard)/components/number-health-widget.tsx`, `apps/dashboard/app/(dashboard)/components/active-campaign-widget.tsx`
- **Files to modify:** `apps/api/src/routes/analytics.ts` (add 2 new endpoints), `apps/dashboard/app/(dashboard)/page.tsx` (add widgets)
- **Phase label mapping:** `aquecimento` → "Aquecimento", `carrinho_aberto` → "Carrinho aberto", `downsell` → "Downsell", `encerrada` → "Encerrada". Use a const map in the widget component.
- **Tier label mapping:** `tier_1k` → "Tier 1k", `tier_10k` → "Tier 10k", `tier_100k` → "Tier 100k", `unlimited` → "Ilimitado".
- **Error boundaries:** Each widget should be wrapped in a React error boundary so a failure in one does not affect others. Use a simple `ErrorBoundary` HOC from `@leedi/ui` or inline.
- **No new npm packages.**
- **Widget placement:** Below the 6 metric cards from Story 15.1, in a 2-column grid (number health left, campaign status right). On mobile, stack vertically.

### Testing standards

- Vitest unit tests for route handlers (mocked DB).
- Component render tests for each widget state (connected/yellow/red/not-connected, active-campaign/none/encerrada).

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
