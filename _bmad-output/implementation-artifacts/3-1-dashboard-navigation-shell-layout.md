---
baseline_commit: 992b8421baa46b95ff2bdc69d31ad25932927f0c
---

# Story 3.1: Dashboard Navigation Shell & Layout

Status: review

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

- [x] Task 1: Theme provider + FOUC prevention (AC: #2, #3)
  - [x] Install `next-themes` in `apps/dashboard`
  - [x] Wrap the root layout with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="leedi-theme">`
  - [x] Add `suppressHydrationWarning` to the `<html>` tag in `apps/dashboard/app/layout.tsx` (next-themes injects the theme class before hydration to prevent FOUC)
  - [x] Confirm the dark base uses the design token `--color-neutral-950` (`#0A0A0F` off-black), never pure black `#000`
- [x] Task 2: App shell layout (AC: #1, #4)
  - [x] Create route group `apps/dashboard/app/(shell)/layout.tsx` composing `<Sidebar />` + `<Header />` + `<main id="main-content">{children}</main>`
  - [x] Lay out shell with spacious default spacing; honor compact mode via `body[data-compact="true"]` Tailwind data-attribute variants (UX-DR5)
- [x] Task 3: Sidebar component (AC: #1, #4)
  - [x] Create `apps/dashboard/components/shell/Sidebar.tsx`
  - [x] Drive nav items from a typed array of `{ href, icon, labelKey }`; resolve labels via next-intl (`useTranslations('nav')`) — no hardcoded strings
  - [x] Icons from `lucide-react`; highlight active item by comparing `usePathname()` against each `href`
  - [x] Responsive: icon-only collapse on `md`; hamburger-driven drawer (shadcn/ui `Sheet`) on small screens
- [x] Task 4: Header component (AC: #1, #2)
  - [x] Create `apps/dashboard/components/shell/Header.tsx` with tenant switcher (shadcn/ui `DropdownMenu` or `Combobox`), dark/light toggle, and user menu
  - [x] Toggle uses `useTheme()` from next-themes; render a sun/moon `lucide-react` icon; mount-guard to avoid hydration mismatch (`useEffect` + `mounted` flag)
- [x] Task 5: i18n message keys (AC: #1)
  - [x] Add `nav.*` keys (dashboard, conversas, leads, agente, conhecimento, campanhas, templates, disparos, relatorios, configuracoes) to the pt-BR messages file
- [x] Task 6: Tests (AC: #1, #2, #3, #4)
  - [x] Component test (Vitest + Testing Library): active route highlight given a mocked `usePathname`
  - [x] Playwright E2E: toggle theme persists across reload; assert `localStorage['leedi-theme']` and `<html class>`
  - [x] Playwright: assert no FOUC by checking the dark class is present before first paint when `prefers-color-scheme: dark`
  - [x] Playwright: resize to mobile, assert sidebar collapses and hamburger drawer opens

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

- ThemeProvider `storageKey="leedi-theme"` added as default in `@leedi/ui/theme/provider.tsx`; root layout simplified to minimal wrapper with ThemeProvider + NextIntlClientProvider
- Route group `(dashboard)` renamed to `(shell)` with full server layout that fetches session/tenant/impersonation and composes Sidebar + Header + main
- SidebarProvider context created for mobile open/close state; Sidebar manages mobile drawer with translate transform (no tailwindcss-animate needed)
- Header includes hamburger (mobile), ThemeToggle with `mounted` guard against hydration mismatch, TenantSwitcher
- 10 nav items driven from typed array with lucide-react icons + next-intl labels; active route uses `aria-current="page"` + primary background
- Vitest configured in dashboard app; 4 component tests for Sidebar pass; Playwright E2E spec created in `e2e/shell.spec.ts` (requires running server)
- `lucide-react@1.17` and `next-themes@0.4` added to dashboard dependencies; `@radix-ui/react-dropdown-menu` added to `@leedi/ui`

### File List

- packages/ui/src/theme/provider.tsx (modified — added storageKey="leedi-theme")
- apps/dashboard/app/layout.tsx (modified — simplified root layout, removed inline header)
- apps/dashboard/app/(shell)/layout.tsx (created — shell with Sidebar + Header + main)
- apps/dashboard/app/(shell)/page.tsx (created — home page moved from app/page.tsx)
- apps/dashboard/app/(shell)/settings/team/page.tsx (created — moved from (dashboard))
- apps/dashboard/app/(shell)/settings/team/invite-form.tsx (created — moved from (dashboard))
- apps/dashboard/components/shell/sidebar-context.tsx (created)
- apps/dashboard/components/shell/Sidebar.tsx (created)
- apps/dashboard/components/shell/Header.tsx (created)
- apps/dashboard/components/shell/Sidebar.test.tsx (created)
- apps/dashboard/e2e/shell.spec.ts (created)
- apps/dashboard/messages/pt-BR.json (modified — added nav.* keys)
- apps/dashboard/vitest.config.ts (created)
- apps/dashboard/package.json (modified — added test script, lucide-react, next-themes, vitest deps)
