import { env } from '@leedi/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

// Use prepare:false for Supabase transaction pooler compatibility.
//
// `idle_timeout` releases idle connections so a pool never pins slots it isn't
// using. Without it (postgres.js default = never), every process that imports
// this module holds up to `max` (default 10) open connections for its lifetime;
// across the dev monorepo (web/dashboard/admin/api) plus Next hot-reload, which
// orphans the previous module instance's pool on each recompile, this exhausts
// Supabase's 60-slot limit ("remaining connection slots are reserved for roles
// with the SUPERUSER attribute"). Reaping idle connections after 20s keeps the
// footprint proportional to actual concurrency, in dev and in prod alike.
const POOL_OPTS = { prepare: false, idle_timeout: 20, max: 10 } as const;

// Privileged/service connection — direct `db` access and the deliberate
// `withServiceRole` RLS-bypass path use this (Supabase `postgres` role today).
const queryClient = postgres(env.DATABASE_URL, POOL_OPTS);
export const db = drizzle(queryClient, { schema });

// RLS-enforced application connection (Story 2.4 / Workstream B). Used ONLY by the
// tenant-data path (`withTenant`/`withUser`). When APP_DATABASE_URL is set it
// points at a NON-BYPASSRLS role so the tenant_isolation policies are actually
// enforced; when unset it falls back to the same connection as `db`, preserving
// today's behavior (reusing the pool to avoid a redundant connection).
export const appDb = env.APP_DATABASE_URL
  ? drizzle(postgres(env.APP_DATABASE_URL, POOL_OPTS), { schema })
  : db;
