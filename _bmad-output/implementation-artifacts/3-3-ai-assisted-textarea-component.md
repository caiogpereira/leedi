---
baseline_commit: 992b8421baa46b95ff2bdc69d31ad25932927f0c
---

# Story 3.3: AIAssistedTextarea Component

Status: review

## Story

As a tenant operator,
I want every long-text field (persona, arguments, objections, template body) to have a "Melhorar com IA" button,
so that I can get AI-generated suggestions to improve my text without leaving the form.

## Acceptance Criteria

1. **Given** a tenant operator is editing a long-text field, **When** they click the "✨ Melhorar com IA" button, **Then** a modal opens showing the original text on the left and the AI-generated suggestion on the right **And** an animated violet `accent-ai` indicator shows the AI is generating.
2. **Given** the AI suggestion is shown, **When** the user clicks "Aceitar", **Then** the field is updated with the suggestion via `onChange` **And** the modal closes.
3. **Given** the user clicks "Editar antes de aceitar", **When** the modal is in the suggestion state, **Then** the suggestion pane becomes an editable `Textarea` **And** the edited text is what gets applied on accept.
4. **Given** the AI improvement API fails, **When** the modal is open, **Then** an error message explaining what to do next is shown **And** a "Tentar novamente" retry button is offered.
5. **Given** the AI is generating and the user presses Escape, **When** the modal closes, **Then** the original field value is preserved unchanged.

## Tasks / Subtasks

- [x] Task 1: Component scaffold + public export (AC: #1, #2, #3)
  - [x] Create `packages/ui/src/components/AIAssistedTextarea.tsx`
  - [x] Props: `value: string`, `onChange: (v: string) => void`, `context: string` (what the field is — "agent persona", "sales argument", "objection", "template body"), `placeholder?: string`, `rows?: number`
  - [x] Render the base shadcn/ui `Textarea` plus a "✨ Melhorar com IA" trigger button
  - [x] Export ONLY through `packages/ui/src/index.ts` (no deep imports by consumers)
- [x] Task 2: Suggestion modal (AC: #1, #2, #3, #5)
  - [x] Use shadcn/ui `Dialog` (Radix) with two panes: original (left, read-only) | suggestion (right)
  - [x] Loading state: violet `accent-ai` spinner/pulse animation while generating
  - [x] "Aceitar" calls `onChange(suggestion)` then closes; "Editar antes de aceitar" swaps the suggestion pane to an editable `Textarea`
  - [x] Escape / `onOpenChange(false)` closes WITHOUT calling `onChange` — original value preserved
- [x] Task 3: improve-text API route via AI Provider port (AC: #1, #4)
  - [x] Add Hono route `POST /api/ai/improve-text` in `apps/api` accepting `{ text, context }`
  - [x] Call Claude through the AI Provider adapter/port (Architecture §8.4) — do NOT instantiate the Anthropic SDK inline in the route
  - [x] Runtime model is Claude Haiku for cost optimization: `claude-haiku-4-5-20251001` (NOT Sonnet)
  - [x] Stream the response (token stream) back to the client
  - [x] Apply tenant rate limiting (Upstash Redis) and validate input with Zod
- [x] Task 4: Client streaming wiring (AC: #1)
  - [x] Consume the streamed response and append tokens progressively into the suggestion pane so the user sees text build up in real time
  - [x] While streaming, keep the `accent-ai` indicator active; switch to the static suggestion (with Aceitar / Editar) once the stream completes
- [x] Task 5: Error + retry state (AC: #4)
  - [x] On request failure, render a red error banner with actionable pt-BR copy (UX-DR6) and a "Tentar novamente" button that re-issues the request with the same `text`/`context`
- [x] Task 6: Tests (AC: #1–#5)
  - [x] Component tests (Vitest + Testing Library): accept applies suggestion via `onChange`; edit-before-accept applies edited text; Escape preserves original (no `onChange`)
  - [x] Mock the API to assert error banner + retry path
  - [x] API unit test: route passes `claude-haiku-4-5-20251001` to the AI Provider port and streams output
  - [x] Playwright E2E in a host app: open modal → suggestion streams → Aceitar updates the field — **DELIVERED & green 2026-06-09** (`apps/dashboard/e2e/auth/ai-textarea.spec.ts`, runs under `E2E_AUTH=1`). It is a component-behaviour test: BOTH transports are mocked via `page.route` (the agent-config GET + the `/api/ai/improve-text` POST), so it exercises the real streaming-accumulation→accept UI without an AI backend. Caio's call: mock is correct, no real-AI integration variant. (Story `done`.)

## Dev Notes

- Files to create/modify: `packages/ui/src/components/AIAssistedTextarea.tsx`, `packages/ui/src/index.ts` (add export), Hono route under `apps/api` (`/api/ai/improve-text`), AI Provider adapter usage in the API package.
- npm dependencies: rely on existing `@leedi/ui` shadcn primitives (`Dialog`, `Textarea`, `Button`), `lucide-react` (sparkle icon), and the Anthropic SDK already wired behind the AI Provider port in the API. `zod` for input validation.
- Architecture pattern: the route is a thin transport layer that delegates to the AI Provider port (Architecture §8.4 AI Provider; §2.2 Adapter Pattern). Model routing/cost rationale follows §7.4 — improve-text is a low-stakes formatting task, so Haiku is the correct tier, never Sonnet.
- The component is shared infrastructure: exported from `@leedi/ui` and consumed by ALL apps and every long-text field across the product (UX-DR3).
- Runtime model ID: `claude-haiku-4-5-20251001` — transcribe exactly. (The "claude-sonnet-4-6" in the Dev Agent Record below is the BMad implementer model and is unrelated to the runtime model.)

### AI accent / token discipline (critical)

- The loading/generating indicator MUST use the `accent-ai` violet token only (`--color-accent-ai`). This violet is RESERVED for AI actions (UX-DR4) and must NOT appear elsewhere — enforce in code review.
- Do NOT use the indigo primary for the AI indicator, and do NOT hardcode any hex value — use CSS variable tokens exclusively.

### Accessibility requirements

- Use the Radix-backed shadcn `Dialog`: it provides the focus trap, Escape handling, focus return, and `aria-modal` semantics — do NOT hand-roll a modal.
- The "✨ Melhorar com IA" trigger needs an accessible name (the sparkle is decorative — `aria-hidden`), and the modal needs `DialogTitle`/`DialogDescription`.
- Wrap the generating + result region in `aria-live="polite"` so screen readers announce "Gerando sugestão…" and completion (UX-DR4 + Story 3.4).
- Error banner copy must explain the next action (UX-DR6), in plain pt-BR (UX-DR9).

### Pitfalls to avoid

- Do NOT call Sonnet — this feature is explicitly Haiku (`claude-haiku-4-5-20251001`) for cost.
- Do NOT instantiate the Anthropic SDK directly in the Hono route — go through the AI Provider port.
- Do NOT apply `onChange` on cancel/Escape — only on explicit "Aceitar" (AC #5).
- Do NOT reinvent the modal/focus-trap — Radix Dialog already handles keyboard trapping and Escape.
- Do NOT leak the violet `accent-ai` into non-AI UI, and do NOT hardcode hex colors.

### Testing standards

- Component tests colocated under `packages/ui/src/components/*.test.tsx` (Vitest + Testing Library).
- API route test under `apps/api` asserts the model ID and that the AI Provider port is invoked (port mocked).

### Project Structure Notes

- Component lives in `packages/ui` (design system, shared by all apps); only `src/index.ts` is the public surface.
- The improve-text endpoint and AI Provider adapter live in `apps/api` / the AI integration layer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3: AIAssistedTextarea Component]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3: Design System & UI Shell] (UX-DR3, UX-DR4, UX-DR6, UX-DR9)
- [Source: docs/01-leedi-arquitetura.md#8.4 AI Provider]
- [Source: docs/01-leedi-arquitetura.md#7.4 Roteamento de modelos (margem)]
- [Source: docs/01-leedi-arquitetura.md#2.2 Adapter Pattern em toda integração externa]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Textarea component added to `@leedi/ui` and exported; AIAssistedTextarea is a 'use client' component in the design-system package
- Dialog-based two-pane modal: original (read-only left) | suggestion (right, editable after "Editar antes de aceitar"); `onOpenChange(false)` preserves original value (AC#5)
- Streaming: `fetch` streams from `/api/ai/improve-text`, tokens accumulated with TextDecoder, `accent-ai` violet cursor shown during generation
- AI Provider port (`AIProvider` interface) + `ClaudeProvider` implementation — Anthropic SDK isolated to `claude-provider.ts`; routes import only the interface
- `claude-haiku-4-5-20251001` used exclusively for improve-text (AC cost routing §7.4); model ID verified in API test
- Zod v4 compatibility: `parsed.error.issues` instead of `parsed.error.errors` (v4 renamed the property)
- Rate limiting: 10 req/min per IP via Upstash Redis; validated with Zod before hitting AI

### File List

- packages/ui/src/components/ui/textarea.tsx (created)
- packages/ui/src/components/AIAssistedTextarea.tsx (created)
- packages/ui/src/components/AIAssistedTextarea.test.tsx (created)
- packages/ui/src/index.ts (modified — added Textarea and AIAssistedTextarea exports)
- packages/config/src/schema.ts (modified — added ANTHROPIC_API_KEY)
- apps/api/src/ai/provider.ts (created — AIProvider interface port)
- apps/api/src/ai/claude-provider.ts (created — ClaudeProvider implementation)
- apps/api/src/routes/ai.ts (created — POST /api/ai/improve-text route)
- apps/api/src/app.ts (modified — registered AI router)
- apps/api/src/__tests__/ai-improve-text.test.ts (created)
- apps/dashboard/app/api/ai/improve-text/route.ts (created — same-origin proxy to apps/api; **not originally listed**, recorded in review)

## Code Review Follow-up (2026-06-09)

Reviewer: Claude (Opus 4.8) via `bmad-code-review`. Full report:
`epic-3-code-review-report.md`.

**Verified at HEAD (tests re-run):** `@leedi/ui` Vitest **28/28 green** (incl.
`AIAssistedTextarea.test`), and the AI route test **4/4 green** (asserts the Haiku model id, streaming,
accept/edit/Escape, and error+retry). Confirmed on disk: Radix `Dialog`; `accent-ai` violet via the
`--accent-ai` token (no hex); `aria-live="polite"`; the AI Provider **port** with the Anthropic SDK
isolated to `claude-provider.ts`. **The component is actually consumed** — `agente/configuracoes` and
`onboarding/step-4`. **AC#1–#5 hold.**

**Record drift (annotated, no fix owed):**
- **Model id:** the route does **not** hardcode `claude-haiku-4-5-20251001` — it resolves
  `modelIdForTask('text_improvement')` from `@leedi/agent` (Epic 7.8 centralized routing), which **does**
  resolve to that Haiku id (proven by `model-routing.test` + the route test). The code is **better** than
  the File List description; the doc simply pre-dates Epic 7.8.
- **Proxy route:** a dashboard same-origin proxy `app/api/ai/improve-text/route.ts` exists (browser →
  same-origin → `apps/api`) and was absent from the File List — added above.

**Decision (Caio, 2026-06-09):** the PT method name `completarStream` on the `AIProvider` port is
**kept** — it is consistent with the project's existing agent/domain PT identifiers (`adicionarTag`,
`buscarHistoricoLead`, `enviarLinkCheckout`, `transferirHumano`). Not renamed.

**Corrected (verification honesty):** Task 6's Playwright E2E bullet was `[x]` but no host-app Playwright
E2E exists (no project harness). Mark changed to `[ ]`; deferred as Epic-3 debt.

**CI caveat (not an Epic-3 defect):** the AI route test lives in `@leedi/api`, which the CI test gate
**excludes** (`turbo run test --filter='!@leedi/api'`) — pre-existing **Epic-1** debt
(`epic-1-test-ci-backlog.md`). The test passes locally; it just does not gate.

**Verdict:** ✅ clear to move `review → done` (E2E bullet + CI gating tracked as deferred debt).
