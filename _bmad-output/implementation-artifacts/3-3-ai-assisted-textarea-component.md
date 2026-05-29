# Story 3.3: AIAssistedTextarea Component

Status: ready-for-dev

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

- [ ] Task 1: Component scaffold + public export (AC: #1, #2, #3)
  - [ ] Create `packages/ui/src/components/AIAssistedTextarea.tsx`
  - [ ] Props: `value: string`, `onChange: (v: string) => void`, `context: string` (what the field is — "agent persona", "sales argument", "objection", "template body"), `placeholder?: string`, `rows?: number`
  - [ ] Render the base shadcn/ui `Textarea` plus a "✨ Melhorar com IA" trigger button
  - [ ] Export ONLY through `packages/ui/src/index.ts` (no deep imports by consumers)
- [ ] Task 2: Suggestion modal (AC: #1, #2, #3, #5)
  - [ ] Use shadcn/ui `Dialog` (Radix) with two panes: original (left, read-only) | suggestion (right)
  - [ ] Loading state: violet `accent-ai` spinner/pulse animation while generating
  - [ ] "Aceitar" calls `onChange(suggestion)` then closes; "Editar antes de aceitar" swaps the suggestion pane to an editable `Textarea`
  - [ ] Escape / `onOpenChange(false)` closes WITHOUT calling `onChange` — original value preserved
- [ ] Task 3: improve-text API route via AI Provider port (AC: #1, #4)
  - [ ] Add Hono route `POST /api/ai/improve-text` in `apps/api` accepting `{ text, context }`
  - [ ] Call Claude through the AI Provider adapter/port (Architecture §8.4) — do NOT instantiate the Anthropic SDK inline in the route
  - [ ] Runtime model is Claude Haiku for cost optimization: `claude-haiku-4-5-20251001` (NOT Sonnet)
  - [ ] Stream the response (token stream) back to the client
  - [ ] Apply tenant rate limiting (Upstash Redis) and validate input with Zod
- [ ] Task 4: Client streaming wiring (AC: #1)
  - [ ] Consume the streamed response and append tokens progressively into the suggestion pane so the user sees text build up in real time
  - [ ] While streaming, keep the `accent-ai` indicator active; switch to the static suggestion (with Aceitar / Editar) once the stream completes
- [ ] Task 5: Error + retry state (AC: #4)
  - [ ] On request failure, render a red error banner with actionable pt-BR copy (UX-DR6) and a "Tentar novamente" button that re-issues the request with the same `text`/`context`
- [ ] Task 6: Tests (AC: #1–#5)
  - [ ] Component tests (Vitest + Testing Library): accept applies suggestion via `onChange`; edit-before-accept applies edited text; Escape preserves original (no `onChange`)
  - [ ] Mock the API to assert error banner + retry path
  - [ ] API unit test: route passes `claude-haiku-4-5-20251001` to the AI Provider port and streams output
  - [ ] Playwright E2E in a host app: open modal → suggestion streams → Aceitar updates the field

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

### File List
