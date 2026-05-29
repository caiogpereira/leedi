# Story 1.5: Set Up Shared UI Package (shadcn/ui + Leedi Design Tokens)

Status: review

## Story

As a tenant operator,
I want every app to use Leedi design tokens (indigo primary, violet AI accent, neutral grays) with dark/light theme support,
so that the platform looks consistent from the very first screen.

## Acceptance Criteria

1. **Given** `packages/ui` exports a Tailwind config with Leedi design tokens, **When** any app imports the config from `@leedi/ui`, **Then** CSS classes `bg-primary`, `text-accent-ai`, `bg-neutral-50` resolve to correct Leedi brand colors.
2. **Given** shadcn/ui components are installed in `packages/ui`, **When** a developer uses `<Button>`, `<Input>`, or `<Dialog>` from `@leedi/ui`, **Then** components render with Leedi tokens **And** pass WCAG AA contrast in both themes.
3. **Given** dark mode is toggled, **When** the app re-renders, **Then** all components switch themes without a page reload **And** the dark mode base is off-black (not pure `#000`).

## Tasks / Subtasks

- [ ] Task 1: Define the design token system in the shared Tailwind config (AC: #1)
  - [ ] In `tooling/tailwind-config/index.js` (named `@leedi/tailwind-config`), define the token scales: `neutral-50â€¦950` (12 gray tones), `primary` indigo (10 tones), `accent-ai` violet (10 tones, reserved for AI badges/indicators ONLY), semantic `success`/`warning`/`error`/`info`, and a single `whatsapp` green (used ONLY on the channel icon)
  - [ ] Set the dark-mode base background to off-black `#0A0A0F` (NOT `#000`)
  - [ ] Configure `darkMode: "class"`, `content` globs covering apps + `packages/ui`, and map tokens to CSS variables (HSL) so shadcn theming works
  - [ ] Export the config as a Tailwind preset so apps consume it via `presets: [require('@leedi/tailwind-config')]`
- [ ] Task 2: Define the CSS variable theme layer (AC: #1, #3)
  - [ ] Create `packages/ui/src/styles/globals.css` declaring CSS custom properties for light (`:root`) and dark (`.dark`) â€” both the shadcn semantic vars (`--background`, `--foreground`, `--primary`, etc.) and the Leedi token vars
  - [ ] Verify color choices meet WCAG AA contrast (>= 4.5:1 for normal text) in BOTH themes; document the contrast pairs checked
- [ ] Task 3: Install shadcn/ui components into `packages/ui` (AC: #2)
  - [ ] Initialize shadcn/ui in `packages/ui` (configure `components.json` with the alias pointing at `src/components/ui`, the shared Tailwind preset, and `globals.css`)
  - [ ] Add the baseline components required by the AC: `Button`, `Input`, `Dialog` (plus their primitive deps, e.g. Radix)
  - [ ] Re-export every component from `packages/ui/src/index.ts` (public API contract) and export `cn`, the theme provider, and `globals.css` path
- [ ] Task 4: Theme provider + toggle (AC: #3)
  - [ ] Add a `ThemeProvider` (next-themes) wrapper and a `ThemeToggle` component, exported from `src/index.ts`, toggling the `.dark` class on `<html>` with no page reload
- [ ] Task 5: Tailwind preset consumption wiring (AC: #1)
  - [ ] Document (and stub) how each app's `tailwind.config` imports the preset and includes `@leedi/ui` in its `content`; full app wiring happens in Story 1.6 but the preset must be ready and resolvable
- [ ] Task 6: Tests / verification (AC: #1, #2, #3)
  - [ ] Add a minimal render test (Vitest + React Testing Library) for `Button` rendering with the primary token class
  - [ ] Manually verify (or with an automated contrast check) that `primary` on `background` and `accent-ai` on `background` pass WCAG AA in light and dark
  - [ ] Verify toggling theme flips `.dark` and re-renders without reload (covered when an app exists in 1.6; note the dependency)

## Dev Notes

- Token system rules from the story spec (treat as hard constraints):
  - `accent-ai` (violet) is reserved EXCLUSIVELY for AI badges/indicators â€” do not use it for generic primary actions.
  - `whatsapp` green appears ONLY on the channel icon â€” never as a general accent.
  - Dark base is off-black `#0A0A0F`, never pure black.
  - `primary` is indigo; neutrals are a 12-tone gray ramp `50â€¦950`.
- Architecture: `packages/ui` is the design system (shadcn/ui + Leedi tokens). The Tailwind base lives in `tooling/tailwind-config`; `packages/ui` consumes it and re-exports components. `src/index.ts` is the only public entry (contract).
- Dependencies: `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `next-themes`, Radix primitives pulled in by shadcn, and dev: `vitest`, `@testing-library/react`, `jsdom`.
- i18n note: components must not hardcode user-facing strings (Architecture: next-intl, no hardcoded UI strings). For these primitives, keep them label-agnostic (labels passed as props/children).
- Testing standards: a render smoke test for at least one component + a contrast verification. Visual/E2E theme testing is deferred (Architecture 11: E2E is V1.5).

### Pitfalls to avoid

- Do NOT define tokens in two places. Single source of truth = `tooling/tailwind-config` preset + the matching CSS variables in `packages/ui/globals.css`. Drift here causes `bg-primary` to render the wrong color.
- Do NOT use `accent-ai` violet for buttons/links â€” it is AI-only. A reviewer will reject misuse.
- Do NOT set dark background to `#000`; AC #3 explicitly requires off-black `#0A0A0F`.
- shadcn components copy source INTO the repo; make sure they import `cn` from the package's own util, and that the package's `content` glob includes them or Tailwind purges their classes.
- Ensure the Tailwind config is exported as a CommonJS/ESM module compatible with how apps' `tailwind.config` import it (preset usage). Mismatched module formats break the build silently (classes resolve to nothing).
- Verify contrast with actual computed values, not by eye â€” AC #2 requires WCAG AA in BOTH themes.

### Project Structure Notes

- Token preset: `tooling/tailwind-config/index.js`.
- UI package files: `packages/ui/components.json`, `packages/ui/src/components/ui/*` (shadcn), `packages/ui/src/styles/globals.css`, `packages/ui/src/lib/utils.ts` (`cn`), `packages/ui/src/theme/` (provider + toggle), `packages/ui/src/index.ts` (barrel).
- `packages/ui` is an infra/design package â€” not the domain anatomy.

### References

- [Source: docs/01-leedi-arquitetura.md#4. Estrutura do monorepo] (packages/ui, tooling/tailwind-config)
- [Source: docs/01-leedi-arquitetura.md#3.1 Tabela-resumo] (shadcn/ui)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
