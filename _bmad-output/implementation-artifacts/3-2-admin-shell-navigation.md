# Story 3.2: Admin Shell & Navigation

Status: ready-for-dev

## Story

As a super-admin,
I want a separate app shell for `apps/admin` with workspace-level navigation,
so that I can manage the SaaS business separately from the tenant dashboard.

## Acceptance Criteria

1. **Given** a super-admin is logged in to `apps/admin`, **When** they view any page, **Then** a persistent sidebar shows: Visão Geral, Clientes, Financeiro, Operacional, Configurações **And** the item matching the current route is highlighted as active.
2. **Given** the admin shell loads, **When** a super-admin views the interface, **Then** a header banner visually distinguishes the admin interface from the tenant dashboard (distinct brand treatment / "ADMIN" indicator) **And** no tenant switcher is present in the header.
3. **Given** a user who is NOT in `workspace_admins` attempts to load any `apps/admin` route, **When** the auth guard runs, **Then** they are redirected to login and never see admin content.

## Tasks / Subtasks

- [ ] Task 1: Admin auth guard (AC: #3)
  - [ ] In `apps/admin/app/(shell)/layout.tsx`, resolve the session server-side and verify membership in `workspace_admins`
  - [ ] If not a workspace admin, `redirect('/login')` before rendering any shell content (guard runs in the layout, not per-page)
- [ ] Task 2: Admin shell layout (AC: #1, #2)
  - [ ] Create `apps/admin/app/(shell)/layout.tsx` composing `<AdminSidebar />` + `<AdminHeader />` + `<main id="main-content">{children}</main>`
  - [ ] Reuse the `next-themes` `ThemeProvider` config established in Story 3.1 (same `storageKey="leedi-theme"`, `suppressHydrationWarning` on `<html>`)
- [ ] Task 3: Admin sidebar (AC: #1)
  - [ ] Create `apps/admin/components/shell/AdminSidebar.tsx` with nav items: Visão Geral, Clientes, Financeiro, Operacional, Configurações
  - [ ] Labels via next-intl (`adminNav.*`); icons from `lucide-react`; active item via `usePathname()` with `aria-current="page"`
  - [ ] Routes prefixed under `/admin/*`
- [ ] Task 4: Admin header with visual distinction (AC: #2)
  - [ ] Create `apps/admin/components/shell/AdminHeader.tsx` with dark/light toggle + user menu; NO tenant switcher
  - [ ] Apply admin distinction using a more saturated indigo token variant and/or an "ADMIN" badge — drive it from a token, not a hex literal
- [ ] Task 5: Admin Tailwind config extension (AC: #2)
  - [ ] Extend the shared `tooling/tailwind-config` in `apps/admin` to expose the admin header accent (e.g. mapped to a deeper indigo token); do not fork the token system
- [ ] Task 6: i18n + tests (AC: #1, #2, #3)
  - [ ] Add `adminNav.*` keys to the pt-BR messages file
  - [ ] Unit/integration test: non-`workspace_admins` user is redirected (mock session)
  - [ ] Playwright E2E: admin sidebar renders the five items, active highlight works, and no tenant switcher exists in the header

## Dev Notes

- Files to create/modify: `apps/admin/app/(shell)/layout.tsx`, `apps/admin/app/layout.tsx` (ThemeProvider), `apps/admin/components/shell/AdminSidebar.tsx`, `apps/admin/components/shell/AdminHeader.tsx`, `apps/admin` Tailwind config extension, pt-BR messages (`adminNav.*`).
- npm dependencies: `next-themes`, `lucide-react` (mirrors Story 3.1). shadcn/ui, Tailwind, next-intl assumed from Epic 1.
- Architecture pattern: same `@leedi/ui` components as the dashboard; the admin "feel" is achieved purely through Tailwind config extension + token mapping, not by duplicating components. The auth guard belongs in the shell layout so every admin route inherits it.
- Cross-story dependency: this story reuses the `ThemeProvider` and theming conventions established in Story 3.1. Build 3.1 first or keep the provider config identical.
- RBAC source of truth: `workspace_admins` is the workspace-level admin role (Architecture §5.3 RBAC). Admins operate workspace-wide, so there is intentionally no tenant context/switcher here.

### Accessibility requirements

- Skip-to-content link as the first focusable element, paired with `id="main-content"` on `<main>` (same pattern as 3.1).
- Admin sidebar is `<nav aria-label="Navegação administrativa">`; active item gets `aria-current="page"`.
- The visual admin distinction (color/badge) must still meet WCAG AA contrast in both themes — do not rely on color alone to convey "this is admin"; include the textual "ADMIN" indicator.

### Pitfalls to avoid

- Do NOT use pure black `#000` in dark theme; off-black `#0A0A0F` via `--color-neutral-950` is the dark base.
- Do NOT hardcode hex colors for the admin accent — extend the token system in Tailwind config and reference CSS variables.
- Do NOT add a tenant switcher to the admin header (AC #2) — admins are workspace-wide.
- Do NOT enforce the admin role only at the page level; guard in the layout so child routes cannot bypass it.
- Do NOT fork `@leedi/ui` or `tooling/tailwind-config` — extend, don't duplicate.

### Testing standards

- Auth-guard test colocated near the layout or as an integration test with a mocked session (Vitest).
- E2E in the `apps/admin` Playwright project.

### Project Structure Notes

- Admin shell lives entirely in `apps/admin`; routes are prefixed `/admin/*`.
- Shared primitives remain in `@leedi/ui`; shared token base remains in `tooling/tailwind-config` (extended, not copied).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2: Admin Shell & Navigation]
- [Source: docs/01-leedi-arquitetura.md#5.3 Papéis (RBAC)]
- [Source: docs/01-leedi-arquitetura.md#2.1 Modularidade por contrato]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
