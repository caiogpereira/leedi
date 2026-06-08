import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id)
    .notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: tenantStatusEnum('status').default('trial').notNull(),
  plan: tenantPlanEnum('plan').default('starter').notNull(),
  logoUrl: text('logo_url'),
  colors: jsonb('colors'),
  // Generic tenant preference bag. Used by Story 6.4 for tenant_sales_method_preference
  // until Story 7.1 wires it into agent_configs.sales_method_id.
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  // Better-Auth stores credential password hashes in `accounts`, not here.
  // Kept nullable for legacy/seed rows and future non-Better-Auth flows.
  passwordHash: text('password_hash'),
  // Required by Better-Auth's default `user` model.
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    role: tenantRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('memberships_user_tenant_idx').on(t.userId, t.tenantId)]
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    email: text('email').notNull(),
    role: tenantRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by')
      .references(() => users.id)
      .notNull(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Story 2.6: at most one PENDING (unaccepted) invite per (tenant, email).
  // Mirrors migration 0016. Expiry stays in app logic (index predicates must be
  // immutable, so `now()` cannot appear here).
  (t) => [
    uniqueIndex('invitations_pending_email_idx')
      .on(t.tenantId, t.email)
      .where(sql`${t.acceptedAt} IS NULL`),
  ]
);

export const workspaceAdmins = pgTable('workspace_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id)
    .notNull(),
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
