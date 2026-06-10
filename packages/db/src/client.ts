import { env } from '@leedi/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

// Use prepare:false for Supabase transaction pooler compatibility

// Privileged/service connection — direct `db` access and the deliberate
// `withServiceRole` RLS-bypass path use this (Supabase `postgres` role today).
const queryClient = postgres(env.DATABASE_URL, { prepare: false });
export const db = drizzle(queryClient, { schema });

// RLS-enforced application connection (Story 2.4 / Workstream B). Used ONLY by the
// tenant-data path (`withTenant`/`withUser`). When APP_DATABASE_URL is set it
// points at a NON-BYPASSRLS role so the tenant_isolation policies are actually
// enforced; when unset it falls back to the same connection as `db`, preserving
// today's behavior (reusing the pool to avoid a redundant connection).
export const appDb = env.APP_DATABASE_URL
  ? drizzle(postgres(env.APP_DATABASE_URL, { prepare: false }), { schema })
  : db;
