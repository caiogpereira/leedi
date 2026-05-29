# Story 1.6: Create Application Shells (web, dashboard, admin, api)

Status: review

## Story

As a developer,
I want all four apps scaffolded with a working health route and shared packages wired,
so that each app compiles, serves locally, and confirms monorepo wiring end-to-end.

## Acceptance Criteria

1. **Given** all apps are scaffolded, **When** a developer runs `pnpm dev`, **Then** `apps/web` serves on 3000, `apps/dashboard` on 3001, `apps/admin` on 3002, and `apps/api` (Hono) on 3003.
2. **Given** `apps/api` is a Hono app, **When** a GET request is made to `/health`, **Then** it responds `200 OK` with `{ status: "ok", env: "development" }`.

## Tasks / Subtasks

- [ ] Task 1: Scaffold the three Next.js 15 apps (AC: #1)
  - [ ] Convert the stubs `apps/web`, `apps/dashboard`, `apps/admin` into Next.js 15 App Router apps (TypeScript, no `src/pages`)
  - [ ] Each app's `tsconfig.json` extends `@leedi/tsconfig/nextjs.json`; each `eslint.config.js` imports the `next` variant from `@leedi/eslint-config`
  - [ ] Each app's `tailwind.config.ts` uses the `@leedi/tailwind-config` preset and includes `@leedi/ui` in `content`; import `@leedi/ui` `globals.css` in the root layout
  - [ ] Wrap each root layout with the `ThemeProvider` from `@leedi/ui`
- [ ] Task 2: Configure dev ports (AC: #1)
  - [ ] Set dev scripts: `web` â†’ `next dev -p 3000`, `dashboard` â†’ `next dev -p 3001`, `admin` â†’ `next dev -p 3002`
  - [ ] Confirm `pnpm dev` (turbo) runs all apps in parallel and `turbo.json` `dev` task is `"persistent": true, "cache": false`
- [ ] Task 3: Configure next-intl for pt-BR (AC: #1)
  - [ ] Install and configure `next-intl` in each Next.js app with default locale `pt-BR`
  - [ ] Create a minimal `messages/pt-BR.json` per app and render one localized string on the index page (no hardcoded UI strings â€” Architecture rule)
- [ ] Task 4: Scaffold the Hono API app (AC: #1, #2)
  - [ ] Convert `apps/api` into a Hono app (NOT Next.js). Entry `src/index.ts`; `tsconfig.json` extends `@leedi/tsconfig/node.json`; `eslint.config.js` imports the `node` variant
  - [ ] Import `@leedi/config` at the very top of the entry so env validation runs before routes register (Story 1.3 contract)
  - [ ] Extend the Zod env schema in `@leedi/config` to add `API_PORT` (`z.coerce.number().default(3003)`)
  - [ ] Implement `GET /health` returning status 200 with JSON `{ status: "ok", env: env.NODE_ENV }`
  - [ ] Serve with `@hono/node-server` listening on `env.API_PORT` (default 3003); dev script uses `tsx watch src/index.ts`
- [ ] Task 5: Wire shared packages end-to-end (AC: #1)
  - [ ] Each app declares `workspace:*` deps on the packages it uses (`@leedi/ui`, `@leedi/config`, and for api also `@leedi/db` import smoke if desired)
  - [ ] Confirm `pnpm build` builds all four apps with zero errors and Turborepo caching is exercised
- [ ] Task 6: Verify acceptance (AC: #1, #2)
  - [ ] Run `pnpm dev`; confirm each app responds on its assigned port
  - [ ] `curl http://localhost:3003/health` returns `200` and `{ "status": "ok", "env": "development" }`
- [ ] Task 7: Tests (AC: #2)
  - [ ] Add a Vitest test for the Hono app using `app.request('/health')` asserting status 200 and the exact JSON body (`app` exported separately from the server bootstrap so it is importable without binding a port)

## Dev Notes

- App roles (Architecture 4): `web` = landing + login/signup; `dashboard` = tenant panel; `admin` = super-admin panel; `api` = Hono backend for webhooks/agent/jobs. Only shells + health here â€” NO auth, NO business routes (those come in later epics).
- `apps/api` is explicitly Hono, NOT Next.js. Use `@hono/node-server` for local serving (Vercel deploy config can come later). Entry point `src/index.ts`, port from `env.API_PORT` defaulting to 3003.
- The `/health` body uses `env.NODE_ENV` from `@leedi/config`, so when run in development it returns `"env": "development"` (matches AC #2 example).
- Export the Hono `app` instance separately from the `serve()` call so it can be imported in tests via `app.request(...)` without opening a socket.
- next-intl with pt-BR default and no hardcoded UI strings is an Architecture rule â€” even the placeholder index text goes through a messages file.
- Each app reads validated env from `@leedi/config`; do not access `process.env` directly (ESLint ban from 1.3).
- Dependencies: `next@15`, `react`, `react-dom`, `next-intl` (web/dashboard/admin); `hono`, `@hono/node-server`, `tsx` (api). Dev: `vitest` for the api.
- Testing standards: a Hono `/health` request test is the concrete acceptance test for AC #2. Next.js apps only need to build and serve in this story.

### Pitfalls to avoid

- Do NOT scaffold `apps/api` as a Next.js route handler â€” it must be a standalone Hono server (Architecture explicitly separates the backend).
- Do NOT register routes before importing `@leedi/config` â€” env validation must fail-fast first (Story 1.3 AC). Put the config import as the first line of the entry.
- Do NOT bind a port inside the module that exports `app`, or the Vitest `app.request` test will start a real server. Separate `app.ts` (export app) from `index.ts` (calls `serve`).
- Watch Next.js 15 specifics: App Router, `next.config.ts` (TS config supported), and `transpilePackages: ["@leedi/ui"]` so the workspace UI package is transpiled by each app.
- Hardcoding port numbers in code instead of reading `env.API_PORT` will fail the config contract; use the schema default.
- Ensure each Next app's Tailwind `content` includes `../../packages/ui/src/**` or the design tokens get purged and the UI renders unstyled.

### Project Structure Notes

- Next apps: `apps/{web,dashboard,admin}/` with `app/layout.tsx`, `app/page.tsx`, `next.config.ts`, `tailwind.config.ts`, `messages/pt-BR.json`, `i18n` setup.
- Hono api: `apps/api/src/app.ts` (exports `app`), `apps/api/src/index.ts` (serve), `apps/api/src/routes/health.ts`.
- `API_PORT` added to `packages/config` schema in this story.

### References

- [Source: docs/01-leedi-arquitetura.md#4. Estrutura do monorepo] (app roles)
- [Source: docs/01-leedi-arquitetura.md#3.1 Tabela-resumo] (Next.js 15, Hono, next-intl)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
