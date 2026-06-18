import { env } from '@leedi/config';

/**
 * Resolve the API's PUBLIC base URL — the origin external services (QStash jobs
 * scheduled by agent tools) must call back into. PL-14a.
 *
 * ⚠️ Deliberate self-contained copy of the twin in
 * `apps/api/src/utils/api-public-url.ts`. A shared export from `@leedi/config`
 * would break the many suites that do `vi.mock('@leedi/config', () => ({ env }))`
 * (~15 across api + agent), so the resolver is duplicated per package and reads
 * ONLY `env`. Keep the body byte-identical across copies.
 *
 * Precedence: `API_PUBLIC_URL` when set (trailing slash stripped), else the legacy
 * `BETTER_AUTH_URL` `:3000`→`:API_PORT` derivation (back-compat, local single-host).
 */
export function resolveApiPublicUrl(e: {
  API_PUBLIC_URL?: string | undefined;
  BETTER_AUTH_URL: string;
  API_PORT: number;
}): string {
  if (e.API_PUBLIC_URL) {
    return e.API_PUBLIC_URL.replace(/\/+$/, '');
  }
  return e.BETTER_AUTH_URL.replace(':3000', `:${e.API_PORT}`);
}

/** The API's public base URL resolved from the validated singleton env. */
export function apiPublicUrl(): string {
  return resolveApiPublicUrl(env);
}
