# Impersonation Full-Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every `(shell)` dashboard page through the impersonation-aware `getCurrentTenantContext()` helper so a super_admin can configure a customer tenant end-to-end under impersonation.

**Architecture:** ~31 dashboard pages + 1 server action currently re-implement tenant resolution inline (`listUserTenants(session.user.id)` + `x-leedi-tenant-id` header). Under impersonation the super_admin has no membership, so that path resolves nothing. Replace each inline block with a call to the already-impersonation-aware `getCurrentTenantContext()` (returns an `owner`-role context for a valid impersonation overlay). A guard test prevents the inline pattern from coming back.

**Tech Stack:** Next.js 15 App Router (Server Components), TypeScript, Vitest, pnpm + turbo monorepo. Dashboard app on `:3001`, admin on `:3002`, login (web) on `:3000`, API on `:3003`.

---

## Background facts (do not re-derive)

- `getCurrentTenantContext()` (`apps/dashboard/lib/tenant-context.ts`) is ALREADY impersonation-aware (commit `6b8b3c0`). It returns `{ userId: string; tenant: UserTenant; role: TenantRole } | null`. `UserTenant = { tenantId; name; slug; logoUrl; role }`. Under a valid impersonation overlay it synthesizes `role: 'owner'`; otherwise it resolves from memberships; returns `null` when neither yields a tenant.
- `requireTenantRouteAccess(route)` wraps `getCurrentTenantContext()` and redirects to `/403` on insufficient/absent role. Pages under `/settings/*` already use it — DO NOT touch them.
- `layout.tsx` has its OWN impersonation handling and uses `listUserTenants` only to populate the tenant switcher — DO NOT touch it; it is the one legitimate `listUserTenants` user under `(shell)`.
- The middleware redirects unauthenticated users to login before any page renders, so the per-page `if (!session) return <Sessão expirada>` branch is effectively dead; it collapses into the single "Nenhum workspace encontrado" fallback.
- Writes under impersonation through `/api/tenants/*` proxies are already audited by `requireTenantSession`. This plan touches only the page read/resolution layer (+ one server action's owner re-validation).

## File structure

**Test (create):**
- `apps/dashboard/lib/__tests__/no-inline-tenant-resolution.test.ts` — guard test (regression net).

**Modify — 31 page files** (replace inline resolution with `getCurrentTenantContext()`):
- `apps/dashboard/app/(shell)/page.tsx`
- `apps/dashboard/app/(shell)/leads/page.tsx`
- `apps/dashboard/app/(shell)/leads/[id]/page.tsx`
- `apps/dashboard/app/(shell)/leads/import/page.tsx`
- `apps/dashboard/app/(shell)/conversas/page.tsx`
- `apps/dashboard/app/(shell)/conversas/[windowId]/page.tsx`
- `apps/dashboard/app/(shell)/agente/configuracoes/page.tsx`
- `apps/dashboard/app/(shell)/agente/metodo/page.tsx`
- `apps/dashboard/app/(shell)/agente/playground/page.tsx`
- `apps/dashboard/app/(shell)/conhecimento/faq/page.tsx`
- `apps/dashboard/app/(shell)/conhecimento/objecoes/page.tsx`
- `apps/dashboard/app/(shell)/conhecimento/produtos/page.tsx`
- `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/page.tsx`
- `apps/dashboard/app/(shell)/conhecimento/produtos/novo/page.tsx`
- `apps/dashboard/app/(shell)/templates/page.tsx`
- `apps/dashboard/app/(shell)/templates/new/page.tsx`
- `apps/dashboard/app/(shell)/templates/biblioteca/page.tsx`
- `apps/dashboard/app/(shell)/templates/[id]/page.tsx`
- `apps/dashboard/app/(shell)/campanhas/page.tsx`
- `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx`
- `apps/dashboard/app/(shell)/disparos/page.tsx`
- `apps/dashboard/app/(shell)/disparos/new/page.tsx`
- `apps/dashboard/app/(shell)/disparos/[id]/page.tsx`
- `apps/dashboard/app/(shell)/disparos/regras/page.tsx`
- `apps/dashboard/app/(shell)/disparos/regras/new/page.tsx`
- `apps/dashboard/app/(shell)/disparos/segmentos/page.tsx`
- `apps/dashboard/app/(shell)/disparos/segmentos/new/page.tsx`
- `apps/dashboard/app/(shell)/configuracoes/notificacoes/page.tsx`
- `apps/dashboard/app/(shell)/configuracoes/cobranca/page.tsx`
- `apps/dashboard/app/(shell)/configuracoes/uso/page.tsx`
- `apps/dashboard/app/(shell)/uso/page.tsx`

**Modify — 1 server action** (owner re-validation via context, not membership):
- `apps/dashboard/app/(shell)/settings/whatsapp/actions.ts`

---

## Task 1: Guard test (regression net) — write first, watch it fail

**Files:**
- Create: `apps/dashboard/lib/__tests__/no-inline-tenant-resolution.test.ts`

This test fails NOW (32 files still import `listUserTenants`) and turns green only after every file is migrated. **Do not commit it until it is green** (committing a red test breaks the build). It exists from the start to prove the problem and bound the work.

- [ ] **Step 1: Write the guard test**

```ts
// apps/dashboard/lib/__tests__/no-inline-tenant-resolution.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// (shell) pages must resolve the active tenant via the shared, impersonation-aware
// getCurrentTenantContext()/requireTenantRouteAccess() helper — never via an inline
// listUserTenants(session.user.id) lookup, which is blind to impersonation (the
// super_admin has no membership). layout.tsx is the ONE allowed exception: it uses
// listUserTenants only to populate the tenant switcher.
const here = dirname(fileURLToPath(import.meta.url));
const SHELL_DIR = join(here, '..', '..', 'app', '(shell)');
const ALLOWED = new Set(['layout.tsx']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !ALLOWED.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('(shell) tenant resolution', () => {
  it('no (shell) file (except layout.tsx) imports listUserTenants', () => {
    const offenders = walk(SHELL_DIR).filter((f) =>
      readFileSync(f, 'utf8').includes('listUserTenants')
    );
    expect(offenders.map((f) => f.replace(SHELL_DIR, '(shell)'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the guard test — expect FAIL listing the offenders**

Run: `pnpm --filter @leedi/dashboard exec vitest run lib/__tests__/no-inline-tenant-resolution.test.ts`
Expected: FAIL — the assertion prints the ~32 offending files. This confirms the test detects the inline pattern. Leave it uncommitted.

---

## The canonical page transform (apply in Tasks 2–6)

Every page in the list shares this exact inline block (whitespace/quotes may vary between `"` and `'`):

```ts
import { headers } from "next/headers";              // or 'next/headers'
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
// ...
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) {
    return <...>Sessão expirada<...>;               // some pages; others omit
  }
  const tenants = await listUserTenants(session.user.id);
  const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
  const currentTenant =
    tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];
  if (!currentTenant) {
    return <...>Nenhum workspace encontrado<...>;
  }
  // ...uses currentTenant.tenantId
```

**Replace with:**

```ts
import { getCurrentTenantContext } from "../../lib/tenant-context"; // adjust depth per file
// ...
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return <...>Nenhum workspace encontrado<...>;   // keep the page's existing JSX/markup for this fallback
  }
  const currentTenant = ctx.tenant;
  // ...uses currentTenant.tenantId  (unchanged downstream)
```

**Rules for every page:**
1. Add the `getCurrentTenantContext` import. The relative path depends on directory depth:
   - depth `(shell)/x/page.tsx` → `"../../lib/tenant-context"`
   - depth `(shell)/x/y/page.tsx` → `"../../../lib/tenant-context"`
   - depth `(shell)/x/y/z/page.tsx` → `"../../../../lib/tenant-context"`
   - `(shell)/page.tsx` (root) → `"../../lib/tenant-context"`
   (Match the import depth already used by sibling files such as `settings/whatsapp/page.tsx` which imports `'../../../../lib/tenant-context'`.)
2. Keep `const currentTenant = ctx.tenant;` so the rest of the page body (which uses `currentTenant.tenantId`, and rarely `.name`/`.slug`) needs no further edits. If a page used `currentTenant.role`, it maps to `ctx.role` — but no in-scope page does (verified).
3. Preserve the page's existing "Nenhum workspace encontrado" JSX exactly (markup differs per page — keep each page's own).
4. Drop the now-unused `if (!session) … Sessão expirada` branch.
5. Remove now-unused imports: `getSession`, `listUserTenants`, and `headers` IF it is no longer referenced anywhere else in the file (some pages also use `headers()`/`requestHeaders` for `searchParams` — leave `headers` if still used). Keep `params`/`searchParams` handling untouched.
6. Do NOT change any other logic, data fetching, or JSX.

After each batch: run typecheck + the guard test (it will list fewer offenders as you go).

---

## Task 2: Migrate batch A — home, leads, conversas (6 files)

**Files (modify):**
- `apps/dashboard/app/(shell)/page.tsx`
- `apps/dashboard/app/(shell)/leads/page.tsx`
- `apps/dashboard/app/(shell)/leads/[id]/page.tsx`
- `apps/dashboard/app/(shell)/leads/import/page.tsx`
- `apps/dashboard/app/(shell)/conversas/page.tsx`
- `apps/dashboard/app/(shell)/conversas/[windowId]/page.tsx`

- [ ] **Step 1: Apply the canonical transform to all 6 files**

Apply "The canonical page transform" above to each. Examples of the import path per file:
- `(shell)/page.tsx` → `import { getCurrentTenantContext } from "../../lib/tenant-context";`
- `(shell)/leads/page.tsx` → `"../../../lib/tenant-context"`
- `(shell)/leads/[id]/page.tsx` → `"../../../../lib/tenant-context"`
- `(shell)/leads/import/page.tsx` → `"../../../../lib/tenant-context"`
- `(shell)/conversas/page.tsx` → `"../../../lib/tenant-context"`
- `(shell)/conversas/[windowId]/page.tsx` → `"../../../../lib/tenant-context"`

For reference, `(shell)/conversas/page.tsx` becomes:

```ts
import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { ConversasClient } from './components/conversas-client';

export default async function ConversasPage() {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }
  return <ConversasClient tenantId={ctx.tenant.tenantId} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: Done (no errors). Fix any unused-import or path errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/app/(shell)/page.tsx" "apps/dashboard/app/(shell)/leads" "apps/dashboard/app/(shell)/conversas"
git commit -m "refactor(dashboard): route home/leads/conversas tenant resolution through getCurrentTenantContext (impersonation)"
```

---

## Task 3: Migrate batch B — agente + conhecimento (8 files)

**Files (modify):**
- `apps/dashboard/app/(shell)/agente/configuracoes/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/agente/metodo/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/agente/playground/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/conhecimento/faq/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/conhecimento/objecoes/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/conhecimento/produtos/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/page.tsx` → `"../../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/conhecimento/produtos/novo/page.tsx` → `"../../../../../lib/tenant-context"`

- [ ] **Step 1: Apply the canonical page transform to all 8 files** (see "The canonical page transform"). Preserve each page's own "Nenhum workspace encontrado" JSX, `params`/`searchParams`, and data fetching.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: Done.

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/app/(shell)/agente" "apps/dashboard/app/(shell)/conhecimento"
git commit -m "refactor(dashboard): route agente/conhecimento tenant resolution through getCurrentTenantContext"
```

---

## Task 4: Migrate batch C — templates + campanhas (6 files)

**Files (modify):**
- `apps/dashboard/app/(shell)/templates/page.tsx` → `"../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/templates/new/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/templates/biblioteca/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/templates/[id]/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/campanhas/page.tsx` → `"../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx` → `"../../../../lib/tenant-context"`

- [ ] **Step 1: Apply the canonical page transform to all 6 files.**

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: Done.

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/app/(shell)/templates" "apps/dashboard/app/(shell)/campanhas"
git commit -m "refactor(dashboard): route templates/campanhas tenant resolution through getCurrentTenantContext"
```

---

## Task 5: Migrate batch D — disparos (7 files)

**Files (modify):**
- `apps/dashboard/app/(shell)/disparos/page.tsx` → `"../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/disparos/new/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/disparos/[id]/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/disparos/regras/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/disparos/regras/new/page.tsx` → `"../../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/disparos/segmentos/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/disparos/segmentos/new/page.tsx` → `"../../../../../lib/tenant-context"`

- [ ] **Step 1: Apply the canonical page transform to all 7 files.**

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: Done.

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/app/(shell)/disparos"
git commit -m "refactor(dashboard): route disparos tenant resolution through getCurrentTenantContext"
```

---

## Task 6: Migrate batch E — configuracoes + uso (4 files)

**Files (modify):**
- `apps/dashboard/app/(shell)/configuracoes/notificacoes/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/configuracoes/cobranca/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/configuracoes/uso/page.tsx` → `"../../../../lib/tenant-context"`
- `apps/dashboard/app/(shell)/uso/page.tsx` → `"../../../lib/tenant-context"`

- [ ] **Step 1: Apply the canonical page transform to all 4 files.**

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: Done.

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/app/(shell)/configuracoes" "apps/dashboard/app/(shell)/uso"
git commit -m "refactor(dashboard): route configuracoes/uso tenant resolution through getCurrentTenantContext"
```

---

## Task 7: Migrate the WhatsApp server action (owner re-validation)

**Files:**
- Modify: `apps/dashboard/app/(shell)/settings/whatsapp/actions.ts`

This file is NOT a page render — it re-validates that the caller is an owner of the submitted `tenantId` before connecting WhatsApp / triggering a health check. The membership lookup must use the impersonation-aware context so an impersonating super_admin (synthesized `owner`) passes, while normal members keep their real role.

- [ ] **Step 1: Replace the `connectWhatsapp` owner check**

Change the imports at the top: remove `getSession` from `@leedi/auth` and `listUserTenants` from `@leedi/tenancy` (keep `headers` only if still used elsewhere — it is not, so remove it too), and add:

```ts
import { getCurrentTenantContext } from '../../../../lib/tenant-context';
```

In `connectWhatsapp`, replace this block:

```ts
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) {
    return { status: 'error', error: 'Sessão expirada. Faça login novamente.' };
  }

  const tenantId = formData.get('tenant_id') as string | null;
  if (!tenantId) {
    return { status: 'error', error: 'Tenant não identificado.' };
  }

  // Re-validate: ensure the caller is actually an owner of this tenant
  const tenants = await listUserTenants(session.user.id);
  const membership = tenants.find((t) => t.tenantId === tenantId);
  if (!membership || membership.role !== 'owner') {
    return { status: 'error', error: 'Apenas proprietários podem configurar a conexão WhatsApp.' };
  }
```

with:

```ts
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { status: 'error', error: 'Sessão expirada. Faça login novamente.' };
  }

  const tenantId = formData.get('tenant_id') as string | null;
  if (!tenantId) {
    return { status: 'error', error: 'Tenant não identificado.' };
  }

  // Re-validate: the active context must be THIS tenant and the caller must be an
  // owner (a real owner member, or a super_admin impersonating — both resolve to
  // role 'owner' here). Blocks acting on a tenant other than the active one.
  if (ctx.tenant.tenantId !== tenantId || ctx.role !== 'owner') {
    return { status: 'error', error: 'Apenas proprietários podem configurar a conexão WhatsApp.' };
  }
```

- [ ] **Step 2: Replace the `triggerHealthCheck` access check**

Replace this block:

```ts
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) return null;

  // Validate caller has access to this tenant
  const tenants = await listUserTenants(session.user.id);
  if (!tenants.some((t) => t.tenantId === tenantId)) return null;
```

with:

```ts
  const ctx = await getCurrentTenantContext();
  if (!ctx || ctx.tenant.tenantId !== tenantId) return null;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: Done (no unused-import errors for `getSession`/`listUserTenants`/`headers`).

- [ ] **Step 4: Commit**

```bash
git add "apps/dashboard/app/(shell)/settings/whatsapp/actions.ts"
git commit -m "refactor(dashboard): WhatsApp action re-validates owner via getCurrentTenantContext (impersonation)"
```

---

## Task 8: Turn the guard test green + commit it

**Files:**
- `apps/dashboard/lib/__tests__/no-inline-tenant-resolution.test.ts` (from Task 1, still uncommitted)

- [ ] **Step 1: Run the guard test — expect PASS**

Run: `pnpm --filter @leedi/dashboard exec vitest run lib/__tests__/no-inline-tenant-resolution.test.ts`
Expected: PASS (no offenders). If it lists any file, migrate that file with the canonical transform, then re-run.

- [ ] **Step 2: Run the full dashboard test suite + typecheck**

Run: `pnpm --filter @leedi/dashboard test` then `pnpm --filter @leedi/dashboard typecheck`
Expected: all green; typecheck Done. (Includes the existing `tenant-context.test.ts` impersonation tests.)

- [ ] **Step 3: Commit the guard test**

```bash
git add apps/dashboard/lib/__tests__/no-inline-tenant-resolution.test.ts
git commit -m "test(dashboard): guard against inline listUserTenants resolution in (shell) pages"
```

---

## Task 9: Browser e2e verification under impersonation

No code — empirical confirmation that impersonation now renders every section. Requires the dev servers running (`pnpm dev`; ports 3000/3001/3002/3003).

- [ ] **Step 1: Log in as super_admin and impersonate a cross-workspace tenant**

Via the browser (chrome-devtools/playwright MCP): `:3000/login` as `e2e+superadmin@leedi.test` / `E2ePassw0rd!` → `:3002/clientes` → click "Impersonar" on a tenant (e.g. "Academia Teste J-02") → accept the confirm dialog → lands on `:3001` with the orange impersonation banner.

- [ ] **Step 2: Navigate every menu section and confirm each renders**

Visit, under impersonation, and confirm NONE shows `/403` or "Nenhum workspace encontrado":
`/` (Dashboard), `/conversas`, `/leads`, `/agente/configuracoes`, `/agente/metodo`, `/agente/playground`, `/conhecimento/faq`, `/conhecimento/objecoes`, `/conhecimento/produtos`, `/templates`, `/templates/biblioteca`, `/campanhas`, `/disparos`, `/disparos/regras`, `/disparos/segmentos`, `/configuracoes/notificacoes`, `/configuracoes/cobranca`, `/configuracoes/uso`, `/settings/whatsapp`.
Expected: each renders its real content (data may be empty-state — that is fine; the point is the page resolves the tenant and renders, not 403/empty-workspace).

- [ ] **Step 3: Confirm the non-impersonation path is unaffected**

Stop impersonation ("Sair do modo suporte"). Log in as the owner seed (`e2e+owner@leedi.test` / `E2ePassw0rd!`) and confirm the same pages still render their tenant normally (regression check).

- [ ] **Step 4: Record the result**

Update the F-30 entry / PL-10 note in `_bmad-output/implementation-artifacts/roteiro-testes-usabilidade.md` and `pendencias-pre-launch.md` to reflect that the 33-page limitation is resolved (full dashboard renders under impersonation). Commit the docs.

```bash
git add _bmad-output/implementation-artifacts/roteiro-testes-usabilidade.md _bmad-output/implementation-artifacts/pendencias-pre-launch.md
git commit -m "docs(testing): impersonation renders full dashboard — close PL-10 33-page limitation"
```

---

## Self-review notes (author)

- **Spec coverage:** every spec component maps to a task — shared helper (no change, used by Tasks 2–7), 32 inline files (Tasks 2–7), guard test (Tasks 1 & 8), e2e (Task 9), handover (no code — verified existing layout redirect). `/settings/*` and `layout.tsx` explicitly excluded.
- **Type consistency:** all tasks use `getCurrentTenantContext(): { userId; tenant: UserTenant; role } | null` and `ctx.tenant.tenantId`. The action uses `ctx.role === 'owner'` and `ctx.tenant.tenantId`.
- **Out of scope (per spec):** onboarding wizard trigger; 1h-window change; direct-server-action audit coverage; `onboarding/page.tsx` (customer-facing, membership path correct).
