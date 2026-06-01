# Epic 2: Multi-Tenant Identity & Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 8 Epic 2 stories: user auth (registration, login, password recovery), multi-tenant DB schema with RLS, RBAC, team invitations, tenant switching, and super-admin impersonation.

**Architecture:** Better-Auth handles sessions/credentials; Drizzle ORM defines schema in `packages/db`; `withTenant()` enforces PostgreSQL RLS as the cross-tenant isolation guarantee; domain logic lives in `packages/auth` and `packages/tenancy`, never in pages/routes.

**Tech Stack:** Better-Auth, Drizzle ORM + Supabase, Resend + React Email, Hono (API), Next.js 15 (web/dashboard/admin), next-intl (pt-BR strings), Zod + react-hook-form, Vitest (unit), Playwright (E2E).

---

## ⚠️ MANUAL ACTIONS REQUIRED BEFORE STARTING

The following env vars are **missing from `.env`** and block compilation or testing. They must be added by the developer before any task begins.

```bash
# .env additions needed:

# Better-Auth — generate a 32+ char random string
BETTER_AUTH_SECRET=your-random-32-char-secret-here

# Better-Auth URL — app origin (web app, where auth routes live)
BETTER_AUTH_URL=http://localhost:3000

# Resend — email sending (stories 2.1, 2.3, 2.6)
RESEND_API_KEY=re_...

# Upstash Redis — rate limiting + session data (NFR8 + security notes)
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Additionally, for **RLS tests to be meaningful** (Story 2.4 AC #2), the app must connect as a **non-superuser, non-BYPASSRLS Postgres role**:
- In Supabase: add the Supabase **Transaction Pooler** connection string (port 6543) as `DATABASE_URL` for runtime, OR create a dedicated `leedi_app` role with `NOLOGIN BYPASSRLS=false`.
- Tests that run as the Supabase `postgres` superuser silently bypass all RLS policies and produce false positives.

> **Checklist before first task:**
> - [ ] All 5 env vars above are in `.env`
> - [ ] `.env` is `.gitignore`d (verified)
> - [ ] `DATABASE_URL` role is non-superuser (or note the risk explicitly)
> - [ ] Supabase project is reachable: `pnpm --filter @leedi/db migrate` succeeds

---

## Task 0: Foundation — Packages, Config Schema & Better-Auth Adapter

**Files:**
- Modify: `packages/config/src/schema.ts`
- Modify: `packages/auth/package.json`
- Modify: `packages/tenancy/package.json`
- Modify: `packages/notification/package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/dashboard/package.json`

### Step 0.1: Add missing env vars to config schema

```ts
// packages/config/src/schema.ts — add to z.object({...}):
BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
```

Run: `pnpm typecheck` → should pass (env validation is lazy).

### Step 0.2: Install dependencies

```bash
# packages/auth — Better-Auth core
pnpm --filter @leedi/auth add better-auth zod

# packages/notification — Resend + React Email
pnpm --filter @leedi/notification add resend @react-email/components react-email react

# packages/tenancy — Zod only (logic pkg)
pnpm --filter @leedi/tenancy add zod

# apps/web — auth UI + email templates
pnpm --filter @leedi/web add better-auth react-hook-form @hookform/resolvers zod

# apps/dashboard — session middleware, RBAC UI
pnpm --filter @leedi/dashboard add better-auth @upstash/redis

# apps/api — Hono auth middleware
pnpm --filter @leedi/api add better-auth @upstash/redis
```

Run: `pnpm install` at workspace root → verify no resolution errors.

### Step 0.3: Add `@leedi/auth` as a dependency to consuming apps

```bash
pnpm --filter @leedi/web add @leedi/auth@workspace:*
pnpm --filter @leedi/dashboard add @leedi/auth@workspace:*
pnpm --filter @leedi/api add @leedi/auth@workspace:*
pnpm --filter @leedi/tenancy add @leedi/db@workspace:* @leedi/auth@workspace:*
```

### Step 0.4: Verify build

```bash
pnpm typecheck
```
Expected: passes (all stubs, no real code yet).

### Step 0.5: Commit

```bash
git add packages/ apps/ pnpm-lock.yaml
git commit -m "chore: install epic 2 dependencies (better-auth, resend, react-email, upstash)"
```

---

## Task 1 — Story 2.4: Tenant Schema, Workspace & Membership with RLS

**Artifact:** `_bmad-output/implementation-artifacts/2-4-tenant-schema-workspace-membership-with-rls.md`

**Files:**
- Create: `packages/db/src/schema/tenancy.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts` (add `withTenant`, `withUser`, `withServiceRole`)
- Create: `packages/db/migrations/<generated>.sql` (Drizzle Kit)
- Create: `packages/db/src/__tests__/rls.test.ts`

- [ ] **Step 1.1: Define Drizzle schema for all 6 tables**

```ts
// packages/db/src/schema/tenancy.ts
import { pgTable, pgEnum, uuid, text, boolean, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const tenantRoleEnum = pgEnum('tenant_role', ['owner', 'admin', 'operator', 'viewer']);
export const workspaceRoleEnum = pgEnum('workspace_role', ['super_admin', 'support']);
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'trial', 'blocked', 'cancelled']);
export const tenantPlanEnum = pgEnum('tenant_plan', ['starter', 'pro', 'enterprise']);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: tenantStatusEnum('status').default('trial').notNull(),
  plan: tenantPlanEnum('plan').default('starter').notNull(),
  logoUrl: text('logo_url'),
  colors: jsonb('colors'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  role: tenantRoleEnum('role').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueUserTenant: uniqueIndex('memberships_user_tenant_idx').on(t.userId, t.tenantId),
}));

export const workspaceAdmins = pgTable('workspace_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  role: workspaceRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  targetTenantId: uuid('target_tenant_id'),
  acao: text('acao').notNull(),
  detalhes: jsonb('detalhes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 1.2: Export from schema barrel**

```ts
// packages/db/src/schema/index.ts
export * from './tenancy.js';
```

- [ ] **Step 1.3: Generate migration**

```bash
pnpm --filter @leedi/db generate
```

Expected: new file created in `packages/db/migrations/`.

- [ ] **Step 1.4: Add RLS SQL to the migration**

Open the generated migration file and append after the table creation statements:

```sql
-- Enable RLS on tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

-- Tenant isolation: rows visible only when app.tenant_id matches
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- Memberships: accessible by tenant context OR by user context (for login routing pre-tenant)
CREATE POLICY tenant_isolation ON memberships
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR user_id = current_setting('app.user_id', true)::uuid
  );

-- audit_logs: append-only (INSERT + SELECT only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (true);
-- Revoke UPDATE and DELETE at grant level (done in separate GRANT statements)
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
```

- [ ] **Step 1.5: Run migration**

```bash
pnpm --filter @leedi/db migrate:run
```

Expected: migration applied successfully.

- [ ] **Step 1.6: Add `withTenant`, `withUser`, `withServiceRole` helpers to `packages/db/src/index.ts`**

```ts
// packages/db/src/index.ts
export { db } from './client.js';
export * as schema from './schema/index.js';
export { eq, sql, and, or, not, gte, lte, gt, lt, like, isNull, isNotNull } from 'drizzle-orm';

import { db } from './client.js';
import { sql } from 'drizzle-orm';

// Sets app.tenant_id for the duration of a transaction — all tenant-scoped queries must run inside this.
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn();
  });
}

// Sets app.user_id — used for membership bootstrap reads before a tenant is selected (login routing).
export async function withUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn();
  });
}

// Service-role path — bypasses tenant RLS deliberately. Only for workspace admin operations.
// Gate all callers behind requireWorkspaceAdmin before using this.
export async function withServiceRole<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL row_security = off`);
    return fn();
  });
}
```

- [ ] **Step 1.7: Write RLS isolation tests**

```ts
// packages/db/src/__tests__/rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, withTenant, withUser } from '../index.js';
import { schema } from '../index.js';
import { eq } from 'drizzle-orm';

// NOTE: These tests require the migration to be applied and must run as a non-superuser role.
// If DATABASE_URL is the postgres superuser, RLS is bypassed and these tests are meaningless.

let workspaceId: string;
let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  // Create workspace
  const [ws] = await db.insert(schema.workspaces).values({ name: 'Test WS' }).returning();
  workspaceId = ws.id;

  // Create two tenants
  const [ta] = await db.insert(schema.tenants).values({ workspaceId, name: 'Tenant A', slug: `ta-${Date.now()}` }).returning();
  const [tb] = await db.insert(schema.tenants).values({ workspaceId, name: 'Tenant B', slug: `tb-${Date.now()}` }).returning();
  tenantAId = ta.id;
  tenantBId = tb.id;

  // Create two users
  const [ua] = await db.insert(schema.users).values({ email: `ua-${Date.now()}@test.com`, passwordHash: 'hash' }).returning();
  const [ub] = await db.insert(schema.users).values({ email: `ub-${Date.now()}@test.com`, passwordHash: 'hash' }).returning();
  userAId = ua.id;
  userBId = ub.id;

  // Create memberships
  await db.insert(schema.memberships).values({ userId: userAId, tenantId: tenantAId, role: 'owner' });
  await db.insert(schema.memberships).values({ userId: userBId, tenantId: tenantBId, role: 'owner' });
});

it('withTenant: returns only own tenant row', async () => {
  const rows = await withTenant(tenantAId, () =>
    db.select().from(schema.tenants)
  );
  expect(rows.every(r => r.id === tenantAId)).toBe(true);
});

it('withTenant: cross-tenant filter returns zero rows', async () => {
  const rows = await withTenant(tenantAId, () =>
    db.select().from(schema.memberships).where(eq(schema.memberships.tenantId, tenantBId))
  );
  expect(rows).toHaveLength(0);
});

it('withUser: lists memberships for the user regardless of tenant context', async () => {
  const rows = await withUser(userAId, () =>
    db.select().from(schema.memberships).where(eq(schema.memberships.userId, userAId))
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(r => r.userId === userAId)).toBe(true);
});

afterAll(async () => {
  // cleanup — delete test data in reverse FK order
  await db.delete(schema.memberships).where(eq(schema.memberships.tenantId, tenantAId));
  await db.delete(schema.memberships).where(eq(schema.memberships.tenantId, tenantBId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantAId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantBId));
  await db.delete(schema.users).where(eq(schema.users.id, userAId));
  await db.delete(schema.users).where(eq(schema.users.id, userBId));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
});
```

Run: `pnpm --filter @leedi/db test`
Expected: tests pass (if using non-superuser DB role). If using superuser, note the limitation.

- [ ] **Step 1.8: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add tenancy schema (workspaces, tenants, users, memberships, workspace_admins, audit_logs) with RLS policies"
```

---

## Task 2 — Story 2.1: User Registration & Email Verification

**Artifact:** `_bmad-output/implementation-artifacts/2-1-user-registration-email-verification.md`

**Files:**
- Create: `packages/auth/src/index.ts` (Better-Auth instance)
- Create: `packages/auth/src/schemas/password.ts`
- Create: `packages/auth/src/use-cases/register-user.ts`
- Create: `packages/notification/src/adapters/resend.ts`
- Create: `packages/notification/src/index.ts`
- Create: `apps/web/emails/email-verification.tsx`
- Create: `apps/web/app/(auth)/register/page.tsx`
- Create: `apps/web/app/(auth)/verify/route.ts`
- Create: `packages/auth/src/use-cases/register-user.test.ts`

Follow all tasks/subtasks in the artifact. Key invariants:
- `autoSignIn: false` — user must verify email before session
- `requireEmailVerification: true`
- Duplicate email → exact pt-BR message from AC #3
- Never log password_hash or verification tokens
- Rate-limit registration endpoint (Upstash Redis)
- All UI strings via next-intl (no hardcoded pt-BR in JSX)

- [ ] **Step 2.1: Implement (follow artifact tasks 1-6)**
- [ ] **Step 2.2: Run unit tests**

```bash
pnpm --filter @leedi/auth test
```

- [ ] **Step 2.3: Commit**

```bash
git add packages/auth/ packages/notification/ apps/web/
git commit -m "feat(auth): implement user registration and email verification (story 2.1)"
```

---

## Task 3 — Story 2.2: User Login & Persistent Session

**Artifact:** `_bmad-output/implementation-artifacts/2-2-user-login-persistent-session.md`

**Files:**
- Modify: `packages/auth/src/index.ts` (session config, `getSession()` helper)
- Create: `packages/auth/src/use-cases/login-user.ts`
- Create: `packages/auth/src/use-cases/logout-user.ts`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/dashboard/middleware.ts`

Follow all tasks/subtasks in the artifact. Key invariants:
- All credential failure modes map to ONE generic message: "E-mail ou senha incorretos"
- HttpOnly + Secure + SameSite=Lax cookie
- Server-side session invalidation on logout (not just cookie deletion)
- Validate `redirect` param against same-origin before using
- Rate-limit login per IP + per email (Upstash Redis)

- [ ] **Step 3.1: Implement (follow artifact tasks 1-6)**
- [ ] **Step 3.2: Run unit tests**

```bash
pnpm --filter @leedi/auth test
```

- [ ] **Step 3.3: Commit**

```bash
git add packages/auth/ apps/web/ apps/dashboard/
git commit -m "feat(auth): implement login, persistent session, logout, dashboard middleware (story 2.2)"
```

---

## Task 4 — Story 2.3: Password Recovery via Email

**Artifact:** `_bmad-output/implementation-artifacts/2-3-password-recovery-via-email.md`

**Files:**
- Modify: `packages/auth/src/index.ts` (sendResetPassword callback, 60min expiry)
- Create: `packages/auth/src/use-cases/request-password-reset.ts`
- Create: `packages/auth/src/use-cases/reset-password.ts`
- Create: `apps/web/emails/password-reset.tsx`
- Create: `apps/web/app/(auth)/forgot-password/page.tsx`
- Create: `apps/web/app/(auth)/reset-password/[token]/page.tsx`

Follow all tasks/subtasks in the artifact. Key invariants:
- Success response identical for existing/non-existing email (no enumeration)
- Token: single-use, 60min, cryptographically random, never logged
- Invalidate ALL user sessions after successful reset (AC #2)
- Reuse `packages/auth/src/schemas/password.ts` for policy enforcement

- [ ] **Step 4.1: Implement (follow artifact tasks 1-5)**
- [ ] **Step 4.2: Run unit tests**

```bash
pnpm --filter @leedi/auth test
```

- [ ] **Step 4.3: Commit**

```bash
git add packages/auth/ apps/web/
git commit -m "feat(auth): implement password recovery via email (story 2.3)"
```

---

## Task 5 — Story 2.5: Role-Based Access Control (RBAC)

**Artifact:** `_bmad-output/implementation-artifacts/2-5-role-based-access-control-rbac.md`

**Files:**
- Create: `packages/auth/src/rbac.ts`
- Modify: `packages/auth/src/index.ts` (export `hasPermission`, `requireRole`)
- Modify: `apps/dashboard/middleware.ts` (add route-permission enforcement)
- Create: `apps/api/src/middleware/require-role.ts`
- Create: `apps/dashboard/app/403/page.tsx`
- Create: `packages/auth/src/rbac.test.ts`

Role-permission matrix (canonical, single source of truth in `rbac.ts`):
```ts
// packages/auth/src/rbac.ts
export type Role = 'owner' | 'admin' | 'operator' | 'viewer';
export type Permission =
  | 'billing'
  | 'agent:configure'
  | 'team:manage'
  | 'leads:write'
  | 'messages:send'
  | 'dashboard:read';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['billing', 'agent:configure', 'team:manage', 'leads:write', 'messages:send', 'dashboard:read'],
  admin: ['agent:configure', 'team:manage', 'leads:write', 'messages:send', 'dashboard:read'],
  operator: ['leads:write', 'messages:send', 'dashboard:read'],
  viewer: ['dashboard:read'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
```

Route-permission map in middleware:
```ts
const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/settings/billing': ['owner'],
  '/settings/agent': ['owner', 'admin'],
  '/settings/team': ['owner', 'admin'],
};
```

- [ ] **Step 5.1: Implement (follow artifact tasks 1-5)**
- [ ] **Step 5.2: Run exhaustive matrix unit tests**

```bash
pnpm --filter @leedi/auth test
```

- [ ] **Step 5.3: Commit**

```bash
git add packages/auth/ apps/dashboard/ apps/api/
git commit -m "feat(auth): implement RBAC permission matrix, middleware enforcement, API guards (story 2.5)"
```

---

## Task 6 — Story 2.6: Team Member Invitation Flow

**Artifact:** `_bmad-output/implementation-artifacts/2-6-team-member-invitation-flow.md`

**Files:**
- Modify: `packages/db/src/schema/tenancy.ts` (add `invitations` table)
- Create: migration (Drizzle Kit generate)
- Create: `packages/tenancy/src/use-cases/invite-member.ts`
- Create: `packages/tenancy/src/use-cases/accept-invitation.ts`
- Modify: `packages/tenancy/src/index.ts` (export both use-cases)
- Create: `apps/web/emails/invitation.tsx`
- Create: `apps/web/app/invite/[token]/page.tsx`
- Create: `apps/dashboard/app/(dashboard)/settings/team/page.tsx`

`invitations` table:
```ts
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  email: text('email').notNull(),
  role: tenantRoleEnum('role').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// Add unique partial index: no two pending invites for same (tenant_id, email)
```

Key invariants:
- Admin cannot grant `owner` role (privilege escalation guard, server-side)
- Token: single-use, 72h, cryptographically random, never logged
- "Reenviar" rotates token (old link invalidated)
- Re-verify token expiry at accept submit time (not only on page load)
- All DB writes via `withTenant`

- [ ] **Step 6.1: Implement (follow artifact tasks 1-6)**
- [ ] **Step 6.2: Run tests**

```bash
pnpm --filter @leedi/tenancy test
```

- [ ] **Step 6.3: Commit**

```bash
git add packages/db/ packages/tenancy/ apps/web/ apps/dashboard/
git commit -m "feat(tenancy): implement team invitation flow with accept and team settings UI (story 2.6)"
```

---

## Task 7 — Story 2.7: Multi-Tenant Switching

**Artifact:** `_bmad-output/implementation-artifacts/2-7-multi-tenant-switching.md`

**Files:**
- Create: `packages/tenancy/src/use-cases/list-user-tenants.ts`
- Create: `packages/tenancy/src/use-cases/switch-tenant.ts`
- Modify: `packages/tenancy/src/index.ts` (export both)
- Create: `apps/dashboard/components/TenantSwitcher.tsx`
- Modify: `apps/dashboard/app/layout.tsx` (add TenantSwitcher to header)

Key invariants:
- `list-user-tenants` uses `withUser(userId, ...)` — NOT `withTenant` (tenant not selected yet)
- `switch-tenant` re-verifies membership server-side before updating session
- Invalidate React Query / router cache on switch (redirect forces full RSC re-render)
- Hide TenantSwitcher entirely for single-tenant users
- Re-resolve RBAC role for the new tenant after switch

- [ ] **Step 7.1: Implement (follow artifact tasks 1-5)**
- [ ] **Step 7.2: Run unit tests**

```bash
pnpm --filter @leedi/tenancy test
```

- [ ] **Step 7.3: Commit**

```bash
git add packages/tenancy/ apps/dashboard/
git commit -m "feat(tenancy): implement multi-tenant switching with TenantSwitcher component (story 2.7)"
```

---

## Task 8 — Story 2.8: Super-Admin Workspace & Tenant Impersonation

**Artifact:** `_bmad-output/implementation-artifacts/2-8-super-admin-workspace-tenant-impersonation.md`

**Files:**
- Create: `packages/auth/src/use-cases/start-impersonation.ts`
- Create: `packages/auth/src/use-cases/stop-impersonation.ts`
- Modify: `packages/auth/src/index.ts` (export `requireWorkspaceAdmin`)
- Create: `packages/tenancy/src/use-cases/list-all-tenants.ts` (service-role, bypasses RLS)
- Create: `packages/tenancy/src/use-cases/write-audit-log.ts`
- Modify: `packages/tenancy/src/index.ts` (export all)
- Create: `apps/admin/app/(admin)/tenants/page.tsx`
- Create: `apps/api/src/middleware/audit-impersonation.ts`
- Modify: `apps/dashboard/app/layout.tsx` (add impersonation banner)

Session shape during impersonation:
```ts
// Session overlay — these fields added to Better-Auth session
{
  realUserId: string;           // preserved super-admin identity
  impersonatingTenantId: string; // active impersonation target
  impersonationExpiresAt: number; // Unix timestamp, 1h from start
  currentTenantId: string;       // set to impersonatingTenantId
}
```

Key invariants:
- Only `super_admin` workspace role can impersonate (not `support`)
- 1-hour expiry, non-renewable without re-auth
- Every mutating API call during impersonation writes `audit_logs` row with `actor_user_id = realUserId`
- `list-all-tenants` uses `withServiceRole` (bypasses RLS) — guard behind `requireWorkspaceAdmin`
- `audit_logs` is immutable — never allow UPDATE/DELETE
- Impersonation banner: prominent, persistent, unmissable

- [ ] **Step 8.1: Implement (follow artifact tasks 1-7)**
- [ ] **Step 8.2: Run tests**

```bash
pnpm --filter @leedi/auth test
pnpm --filter @leedi/tenancy test
```

- [ ] **Step 8.3: Final integration check**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

- [ ] **Step 8.4: Commit**

```bash
git add packages/auth/ packages/tenancy/ apps/admin/ apps/api/ apps/dashboard/
git commit -m "feat(auth,tenancy): implement super-admin impersonation with audit logging (story 2.8)"
```

---

## Task 9: Update Story Artifacts with Completion Notes

For each story (2.1–2.8), update the corresponding artifact file's "Dev Agent Record" section:
- `### Agent Model Used`: claude-sonnet-4-6
- `### Completion Notes List`: list any deviations from spec or pitfalls encountered
- `### File List`: list all files created/modified

Change `Status: ready-for-dev` to `Status: done` at the top of each artifact.

---

## Verification Checklist (Definition of Done for Epic 2)

- [ ] `pnpm typecheck` passes across all packages and apps
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (all unit + integration tests green)
- [ ] RLS isolation: cross-tenant query returns zero rows (verified with non-superuser role)
- [ ] Login failure: all error paths return identical generic message
- [ ] Password reset: timing/response identical for existing vs non-existing email
- [ ] Logout: reused token returns 401
- [ ] RBAC: `operator` + agent-config API returns 403; `viewer` sees no write buttons
- [ ] Invitation: `admin` cannot grant `owner`; duplicate pending invite shows AC #3 error
- [ ] Tenant switch: membership re-verified server-side; RLS switches to new tenant
- [ ] Impersonation: banner visible; audit_logs entries created for start/end; 1h expiry
- [ ] Story artifacts updated with completion notes and file lists
