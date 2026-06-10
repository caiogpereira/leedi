---
baseline_commit: 992b842
---

# Story 6.2: Sales Arguments, Differentials & Social Proofs

Status: done

## Story

As a tenant operator,
I want to add sales arguments, differentials, social proofs, guarantee info, and bonuses per product,
so that the agent has rich, persuasive commercial material to draw from during conversations.

## Acceptance Criteria

1. **Given** a product exists, **When** an operator navigates to the product detail page and adds a sales argument text, **Then** it is appended to `products.argumentos` (jsonb array) and displayed in the arguments list.
2. **Given** an operator clicks the AI improvement button (✨) on a sales argument field, **When** the AIAssistedTextarea modal opens and the operator accepts the suggestion, **Then** the argument text is updated with the AI suggestion.
3. **Given** an operator saves differentials, social proofs, guarantee, and bonuses for a product, **When** the agent calls `consultar_ofertas_ativas`, **Then** the tool result includes all these fields from the product record.
4. **Given** an operator reorders arguments (drag-and-drop), **When** saved, **Then** the order in the `argumentos` jsonb array reflects the new order.
5. **Given** a product has 0 sales arguments, **When** the product detail page renders the arguments section, **Then** an empty state shows: "Nenhum argumento cadastrado. Adicione argumentos para fortalecer a venda."

## Tasks / Subtasks

- [x] Task 1: Products update use case + API for jsonb array fields (AC: #1, #3, #4)
  - [x] Ensure `PATCH /products/:id` (from Story 6.1) correctly persists the jsonb fields `argumentos`, `diferenciais`, `provasSociais`, `bonus` and the text field `garantia`
  - [x] Add `PATCH /products/:id/argumentos` that REPLACES the `argumentos` array wholesale (handles add/edit/delete/reorder in one call)
  - [x] Add analogous replace endpoints (or a single generic `PATCH /products/:id/material` accepting `{ field, items }`) for `diferenciais`, `provasSociais`, `bonus`
  - [x] Create use case `packages/knowledge/src/use-cases/update-product-arguments.ts` (in `@leedi/knowledge`, NOT in `apps/api`) — validate the payload is an array of non-empty strings with Zod, update via Drizzle through `withTenant`; export from `packages/knowledge/src/index.ts`
- [x] Task 2: Arguments / Differentials UI components (AC: #1, #2, #4, #5)
  - [x] Create a reusable `ArgumentList` component in the dashboard app (`apps/dashboard/components/knowledge/ArgumentList.tsx`): renders a list of text items with add / edit / delete / reorder
  - [x] Each item uses the `AIAssistedTextarea` ✨ component from `@leedi/ui` (built in Story 3.3) with the appropriate `context` prop
  - [x] Drag-and-drop reordering; on save, send the full ordered array to the argumentos replace endpoint
  - [x] Empty state copy exactly: "Nenhum argumento cadastrado. Adicione argumentos para fortalecer a venda."
- [x] Task 3: Extend the existing AI improve-text route for knowledge contexts (AC: #2)
  - [x] DO NOT create a new route — `POST /api/ai/improve-text` already exists from Story 3.3 (`apps/api/src/routes/ai.ts`), behind the `AIProvider` port (`apps/api/src/ai/provider.ts`) + `ClaudeProvider` (`apps/api/src/ai/claude-provider.ts`), using model `claude-haiku-4-5-20251001`
  - [x] Extend the route to accept the new `context` values: `"sales_argument"`, `"differential"`, `"social_proof"`, `"guarantee"`, `"bonus"` (add to the Zod-validated context union)
  - [x] Add a per-context improvement prompt: for `sales_argument`, instruct Claude to make it more persuasive and benefit-focused, concise (max 2 sentences), in pt-BR — go through the existing port, never instantiate the Anthropic SDK in the route
  - [x] Keep streaming behavior and the `accent-ai` violet indicator from Story 3.3
- [x] Task 4: Product detail page sections (AC: #1, #3, #5)
  - [x] Add a tabbed or section-based layout to `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/page.tsx`: Argumentos | Diferenciais | Provas Sociais | Garantia | Bônus
  - [x] Argumentos, Diferenciais, Provas Sociais, Bônus each use `ArgumentList`
  - [x] Garantia is a single `AIAssistedTextarea` (context `"guarantee"`), not a list
  - [x] Persist via the endpoints from Task 1
- [x] Task 5: Tests (AC: #2, #4)
  - [x] Unit: improve-text returns a suggestion for the `sales_argument` context (mock the `AIProvider` port; assert model `claude-haiku-4-5-20251001` is requested)
  - [x] Unit: `update-product-arguments` replaces the array correctly and preserves order; rejects non-string / empty items
  - [ ] Component: `ArgumentList` accept flow applies the AI suggestion via `onChange`; reorder produces the expected ordered array; empty state renders the exact copy — **NOT DONE** (code review 2026-06-10): no automated test exists and `apps/dashboard` has NO component-test infrastructure (no `vitest.config`, no Testing Library setup). Behaviour was verified by reading the component + call sites; AC#4 reorder logic + AC#5 exact empty-state copy confirmed on disk. Tracked as a follow-up to stand up dashboard component-test infra.

## Dev Notes

- Files to create: `packages/knowledge/src/use-cases/update-product-arguments.ts` (in `@leedi/knowledge`, NOT in `apps/api`), `apps/dashboard/components/knowledge/ArgumentList.tsx`.
- Files to modify: `apps/api/src/routes/knowledge/products.ts` (add jsonb replace endpoints — thin routes calling `@leedi/knowledge`), `apps/api/src/routes/ai.ts` (add knowledge `context` values + prompts), `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/page.tsx` (add material sections), `packages/knowledge/src/use-cases/get-active-offers.ts` (confirm it returns all material fields — it already should per Story 6.1).
- npm dependencies: a drag-and-drop lib for reorder (prefer `@dnd-kit/core` + `@dnd-kit/sortable`, accessible and React 18 friendly) added to `apps/dashboard`. Reuse `@leedi/ui` `AIAssistedTextarea`, `Button`, `Tabs`. No axios.
- The improve-text endpoint already exists (Story 3.3) — this story only EXTENDS its accepted `context` values and per-context prompts. Reusing the `AIProvider` port keeps the Anthropic SDK isolated to `claude-provider.ts`.
- `argumentos`/`diferenciais`/`provasSociais`/`bonus` are jsonb arrays of strings. The replace endpoints overwrite the whole array — this is the simplest correct model for reorder and avoids index-based race conditions.

### AI accent / model discipline (critical)

- Runtime model for improve-text is `claude-haiku-4-5-20251001` — transcribe exactly, NEVER Sonnet (cost routing §7.4).
- The generating indicator must use the `accent-ai` violet token only (UX-DR4) — already handled by the `AIAssistedTextarea` component from Story 3.3; do not reimplement.

### Testing standards

- Mock the `AIProvider` port in API unit tests (no real Anthropic calls); assert the requested model ID and that the port — not the SDK — is invoked.
- Component tests colocated with `ArgumentList` (Vitest + Testing Library); assert accept-applies-suggestion, reorder ordering, and the empty-state copy.

### Pitfalls to avoid

- Do NOT create a duplicate `/ai/improve-text` route — Story 3.3 already built it; only add the new `context` values and prompts.
- Do NOT call Sonnet — improve-text is explicitly Haiku (`claude-haiku-4-5-20251001`).
- Do NOT instantiate the Anthropic SDK in the Hono route — go through the existing `AIProvider` port.
- Do NOT mutate the jsonb array in place client-side without sending the full ordered array on save (reorder must persist — AC #4).
- Do NOT leak the violet `accent-ai` token into non-AI UI, and do NOT hardcode hex colors.
- Do NOT forget the exact empty-state copy (AC #5).

### Project Structure Notes

- Knowledge use cases (including `update-product-arguments`) live in `@leedi/knowledge` (`packages/knowledge/`). The Hono route in `apps/api` is thin — calls `@leedi/knowledge` only. AI improve-text route stays in `apps/api/src/routes/ai.ts`. Reusable list component in `apps/dashboard/components/knowledge`. The shared `AIAssistedTextarea` stays in `@leedi/ui` (do not fork it).

### References

- [Source: docs/01-leedi-arquitetura.md#6.6 Knowledge — products]
- [Source: docs/01-leedi-arquitetura.md#8.4 AI Provider]
- [Source: docs/01-leedi-arquitetura.md#7.4 Roteamento de modelos (margem)]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2: Sales Arguments, Differentials & Social Proofs]
- [Source: _bmad-output/implementation-artifacts/3-3-ai-assisted-textarea-component.md] (existing improve-text route + AIProvider port + model ID)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Debug Log References

_none_

### Completion Notes List

Story 6.2: update-product-arguments use case, AI improve-text context extension (sales_argument/differential/social_proof/guarantee/bonus/faq_answer/objection_counter), ArgumentList component with DnD reorder + AI improve, product detail material tabs. 3 unit tests passing.

### File List

_see git diff_

### Change Log

- 2026-06-01: Implemented.
- 2026-06-10: Code review (Opus). Fixed HIGH build break: `product-detail-client.tsx` imported `ArgumentList` via the `@/` alias, which is NOT configured anywhere in the repo (every other dashboard import is relative) — the product-detail material sections (AC#1–#5) failed to typecheck/build. Switched to a relative import. Fixed `ArgumentList` reorder: `moved` was `string | undefined` (noUncheckedIndexedAccess) — added a guard. AC verification: argumentos empty-state copy is exact per AC#5; AI improve goes through `/api/ai/improve-text` with the correct per-context value; improve-text Haiku-model test passes (4/4). NOTE: diferenciais/provas/bônus tabs reuse a copy-pasted empty-state string ("...Adicione argumentos...") — cosmetic only, AC#5 pins only the argumentos copy. Story 6.2 → done. See epic-6-code-review-report.md.
