# Story 3.4: Accessibility Foundations & WCAG AA Compliance

Status: ready-for-dev

## Story

As a user with accessibility needs,
I want the platform to meet WCAG AA standards with keyboard navigation and proper contrast,
so that I can use the platform regardless of my input method.

## Acceptance Criteria

1. **Given** any interactive element (buttons, inputs, links, dropdowns) in the dashboard, **When** a user navigates using only the keyboard, **Then** every interactive element is reachable and operable in a logical order **And** the focused element shows a visible focus ring.
2. **Given** any text/background color combination in the design system, **When** checked against WCAG AA (4.5:1 normal text, 3:1 large text), **Then** all combinations pass in BOTH light and dark themes.
3. **Given** any form field in the dashboard, **When** rendered in the DOM, **Then** every input has an associated label or `aria-label` **And** error messages are linked to the field via `aria-describedby`.

## Tasks / Subtasks

- [ ] Task 1: Global focus-visible ring (AC: #1)
  - [ ] Apply `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` to interactive `@leedi/ui` primitives (Button, Input, links, dropdown triggers)
  - [ ] Use `focus-visible` (NOT `focus`) so the ring shows on keyboard focus, not on mouse click
  - [ ] Ring color references the `--color-primary` token (no hex)
- [ ] Task 2: Skip-to-content link (AC: #1)
  - [ ] Add `<a href="#main-content" class="sr-only focus:not-sr-only">Ir para conteúdo</a>` as the first focusable element in each app shell layout, paired with `id="main-content"` on `<main>` (coordinated with Stories 3.1 and 3.2)
- [ ] Task 3: Accessible form-field primitives (AC: #3)
  - [ ] Ensure `@leedi/ui` `Input` accepts and forwards `aria-label`, `aria-describedby`, and `aria-required`
  - [ ] Create/confirm a `FormField` wrapper: `<FormField>` renders `<Label htmlFor={id}>` + `<Input id={id} aria-describedby={`${id}-error`} aria-invalid={hasError} />` + `<ErrorMessage id={`${id}-error`} />`
  - [ ] Error copy follows UX-DR6 (explains the next action) in plain pt-BR (UX-DR9)
- [ ] Task 4: Live-region announcements (AC: #1)
  - [ ] Provide an `aria-live="polite"` region utility for async operations (AI generating, form saving) so screen readers are notified; AIAssistedTextarea (Story 3.3) hooks into this pattern
- [ ] Task 5: Contrast verification (AC: #2)
  - [ ] Add the `wcag-contrast` npm package; write a test/Storybook story that resolves each token pair (text on surface, primary on background, accent-ai on surface, semantic colors) in both themes
  - [ ] Assert >= 4.5:1 for normal text and >= 3:1 for large text; fail the build on any violation
  - [ ] Confirm dark theme uses `#0A0A0F` off-black (`--color-neutral-950`) as base — assert pure black `#000` is absent
- [ ] Task 6: Automated a11y in CI (AC: #1, #3)
  - [ ] Add `@axe-core/playwright`; run axe against key dashboard pages in the Playwright suite
  - [ ] Fail CI on serious/critical violations (missing labels, insufficient contrast, focus order, ARIA misuse)
- [ ] Task 7: Keyboard + modal verification (AC: #1)
  - [ ] Confirm all overlays use Radix-backed shadcn components so the focus trap and Escape handling are built-in (do not hand-roll)
  - [ ] Playwright: tab through a representative page, asserting every interactive element is reachable and shows the focus ring

## Dev Notes

- Files to create/modify: `@leedi/ui` primitives (`Button`, `Input`, `FormField`, `Label`, `ErrorMessage`), app shell layouts (`apps/dashboard` and `apps/admin` skip links), contrast test/Storybook story, Playwright a11y spec.
- npm dependencies: `wcag-contrast` (contrast assertions), `@axe-core/playwright` (CI a11y). `@tailwindcss/forms` is NOT needed — shadcn handles input styling.
- Architecture pattern: this story is cross-cutting hardening over the components built in Stories 3.1 (shell) and 3.3 (AIAssistedTextarea). It standardizes focus, labels, live regions, and contrast across `@leedi/ui` rather than introducing new feature surfaces.
- Prerequisite: the design-token system (UX-DR1) defines the token pairs being contrast-checked; the contrast test asserts the tokens themselves, so it is the canonical guard that UX-DR7 holds.

### Accessibility requirements (this IS the story)

- Keyboard: every interactive element reachable and operable; logical tab order; visible `focus-visible` ring on all of them (UX-DR8).
- Contrast: 4.5:1 normal, 3:1 large, in BOTH themes (UX-DR7 / NFR11).
- Forms: label or `aria-label` on every input; errors linked via `aria-describedby`; `aria-invalid` on errored fields (NFR13).
- Live regions: `aria-live="polite"` for async state so non-visual users perceive AI/saving activity.
- Skip link in every app layout.

### Pitfalls to avoid

- Do NOT replace shadcn/Radix primitives with custom implementations — Radix already provides keyboard nav, focus traps, and Escape handling. Re-rolling them reintroduces a11y bugs.
- Do NOT use `focus:` for the ring — use `focus-visible:` so mouse clicks don't show a ring.
- Do NOT hardcode hex values for the focus ring or contrast tests — use CSS variable tokens.
- Do NOT allow pure black `#000` in dark theme; base is `#0A0A0F` (`--color-neutral-950`) — the contrast suite must assert this.
- Do NOT treat axe passing as full coverage — automated tools miss focus order and meaningful labels; keep the manual keyboard walkthrough (Task 7).

### Testing standards

- Contrast assertions colocated with the design-token tests (Vitest) or as Storybook stories with a contrast addon.
- `@axe-core/playwright` integrated into the dashboard Playwright project and wired into CI as a gating check.

### Project Structure Notes

- A11y primitives and the `FormField` pattern live in `packages/ui` (shared by all apps), exported via `src/index.ts`.
- Skip links live in each app's shell layout (`apps/dashboard`, `apps/admin`).
- Contrast and axe gates run in CI alongside lint/typecheck.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4: Accessibility Foundations & WCAG AA Compliance]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3: Design System & UI Shell] (NFR11, NFR12, NFR13; UX-DR6, UX-DR7, UX-DR8, UX-DR9)
- [Source: docs/01-leedi-arquitetura.md#2.1 Modularidade por contrato]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
