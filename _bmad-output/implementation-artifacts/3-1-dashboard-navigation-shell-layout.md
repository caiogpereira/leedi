# Story 3.1: Dashboard Navigation Shell & Layout

Status: ready-for-dev

## Story

As a tenant operator,
I want a consistent app shell with sidebar navigation, header with tenant switcher, and dark/light toggle,
so that I can navigate between all sections of the platform efficiently.

## Acceptance Criteria

1. **Given** a tenant user is logged in to `apps/dashboard`, **When** they view any page, **Then** a persistent sidebar shows: Dashboard, Conversas, Leads, Agente, Conhecimento, Campanhas, Templates, Disparos, Relatórios, Configurações **And** the item matching the current route is visually highlighted as active.
2. **Given** the user clicks the dark/light toggle in the header, **When** the toggle fires, **Then** the theme switches immediately without a page reload **And** the preference is persisted to localStorage under key `leedi-theme`.
3. **Given** a new user visits with system dark mode active, **When** the page loads, **Then** dark theme is applied automatically with no flash of light theme (no FOUC).
4. **Given** the viewport is narrowed to mobile width, **When** the shell renders, **Then** the sidebar collapses to icon-only **And** a hamburger menu toggles a full nav drawer on very small screens.

## Tasks / Subtasks

- [ ] Task 1: Theme provider + FOUC prevention (AC: #2, #3)
  - [ ] Install `next-themes` in `apps/dashboard`
  - [ ] Wrap the root layout with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="leedi-theme">`
  - [ ] Add `suppressHydrationWarning` to the `<html>` tag in `apps/dashboard/app/layout.tsx` (next-themes injects the theme class before hydration to prevent FOUC)
  - [ ] Confirm the dark base uses the design token `--color-neutral-950` (`#0A0A0F` off-black), never pure black `#000`
- [ ] Task 2: App shell layout (AC: #1, #4)
  - [ ] Create route group `apps/dashboard/app/(shell)/layout.tsx` composing `<Sidebar />` + `<Header />` + `<main id="main-content">{children}</main>`
  - [ ] Lay out shell with spacious default spacing; honor compact mode via `body[data-compact="true"]` Tailwind data-attribute variants (UX-DR5)
- [ ] Task 3: Sidebar component (AC: #1, #4)
  - [ ] Create `apps/dashboard/components/shell/Sidebar.tsx`
  - [ ] Drive nav items from a typed array of `{ href, icon, labelKey }`; resolve labels via next-intl (`useTranslations('nav')`) — no hardcoded strings
  - [ ] Icons from `lucide-react`; highlight active item by comparing `usePathname()` against each `href`
  - [ ] Responsive: icon-only collapse on `md`; hamburger-driven drawer (shadcn/ui `Sheet`) on small screens
- [ ] Task 4: Header component (AC: #1, #2)
  - [ ] Create `apps/dashboard/components/shell/Header.tsx` with tenant switcher (shadcn/ui `DropdownMenu` or `Combobox`), dark/light toggle, and user menu
  - [ ] Toggle uses `useTheme()` from next-themes; render a sun/moon `lucide-react` icon; mount-guard to avoid hydration mismatch (`useEffect` + `mounted` flag)
- [ ] Task 5: i18n message keys (AC: #1)
  - [ ] Add `nav.*` keys (dashboard, conversas, leads, agente, conhecimento, campanhas, templates, disparos, relatorios, configuracoes) to the pt-BR messages file
- [ ] Task 6: Tests (AC: #1, #2, #3, #4)
  - [ ] Component test (Vitest + Testing Library): active route highlight given a mocked `usePathname`
  - [ ] Playwright E2E: toggle theme persists across reload; assert `localStorage['leedi-theme']` and `<html class>`
  - [ ] Playwright: assert no FOUC by checking the dark class is present before first paint when `prefers-color-scheme: dark`
  - [ ] Playwright: resize to mobile, assert sidebar collapses and hamburger drawer opens

## Dev Notes

- Files to create/modify: `apps/dashboard/app/layout.tsx` (ThemeProvider + `suppressHydrationWarning`), `apps/dashboard/app/(shell)/layout.tsx`, `apps/dashboard/components/shell/Sidebar.tsx`, `apps/dashboard/components/shell/Header.tsx`, pt-BR messages file (`nav.*`).
- npm dependencies: `next-themes`, `lucide-react`. shadcn/ui (`Sheet`, `DropdownMenu`, `Button`), Tailwind, and next-intl are assumed installed from Epic 1.
- Architecture pattern: shell composition only — pages remain children of `(shell)/layout.tsx`. UI primitives come from `@leedi/ui`; do not re-implement shadcn primitives in the app.
- The design-token system (UX-DR1) is a prerequisite: this story consumes `--color-*` CSS variables and the `neutral-950` off-black dark base. If tokens are not yet wired into Tailwind, that must land first.
- Theme provider established here is reused by Story 3.2 (admin shell) — keep `storageKey` and provider config consistent so both apps share theming behavior.

### Accessibility requirements

- Add a skip-to-content link as the first focusable element in `(shell)/layout.tsx`: `<a href="#main-content" class="sr-only focus:not-sr-only">Ir para conteúdo</a>` (paired with `id="main-content"` on `<main>`).
- Sidebar nav must be a `<nav aria-label="Navegação principal">`; active item gets `aria-current="page"`.
- Theme toggle and tenant switcher must be keyboard operable with visible focus rings (Story 3.4 defines the ring tokens).
- WCAG AA contrast must hold in both themes (verified centrally in Story 3.4).

### Pitfalls to avoid

- Do NOT use pure black `#000` anywhere in dark theme — the dark base is `#0A0A0F` via `--color-neutral-950`.
- Do NOT hardcode any hex color in component code — use CSS variable tokens (`--color-primary`, `--color-neutral-*`) only.
- Do NOT hardcode nav labels — route every string through next-intl.
- Do NOT render the theme toggle icon before mount without a guard, or you will get a hydration mismatch warning.
- Do NOT forget `suppressHydrationWarning` on `<html>` — without it, next-themes' pre-hydration class injection logs a warning and may flash.

### Testing standards

- Component tests colocated under `apps/dashboard/components/shell/*.test.tsx` (Vitest + Testing Library).
- E2E in `apps/dashboard` Playwright project; assert localStorage persistence and the absence of FOUC.

### Project Structure Notes

- Shell lives entirely in `apps/dashboard` (tenant surface). Reusable primitives stay in `@leedi/ui`.
- Compact-mode toggle wiring (the control that sets `body[data-compact]`) lives in app settings; this story only ensures the layout responds to the attribute.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1: Dashboard Navigation Shell & Layout]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3: Design System & UI Shell] (UX-DR2, UX-DR5, UX-DR9; NFR14)
- [Source: docs/01-leedi-arquitetura.md#2.1 Modularidade por contrato]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
