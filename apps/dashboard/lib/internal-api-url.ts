import { env } from '@leedi/config';

/**
 * Resolve the API's INTERNAL base URL — the origin the dashboard's BFF proxy
 * routes (`app/api/.../route.ts`) use for server-to-server calls into the Hono API.
 *
 * Precedence (PL-14b):
 *  1. `INTERNAL_API_URL` when set (trailing slash stripped) — the explicit override
 *     for any deploy where the API's internal origin differs from the web origin.
 *     This is DISTINCT from `API_PUBLIC_URL` (the external-callback origin): the
 *     internal origin is plausibly a private service URL, not the public tunnel —
 *     routing dashboard→API traffic through the public origin would hairpin out.
 *  2. Legacy derivation: `BETTER_AUTH_URL` with `:3000` swapped for `:API_PORT`.
 *     Back-compatible — only correct when web and API share a host (local default).
 *
 * Pure (takes the relevant env fields) so the precedence is unit-testable without
 * the validated singleton.
 */
export function resolveInternalApiUrl(e: {
  INTERNAL_API_URL?: string | undefined;
  BETTER_AUTH_URL: string;
  API_PORT: number;
}): string {
  if (e.INTERNAL_API_URL) {
    return e.INTERNAL_API_URL.replace(/\/+$/, '');
  }
  return e.BETTER_AUTH_URL.replace(':3000', `:${e.API_PORT}`);
}

/**
 * The API's internal base URL resolved from the validated singleton env.
 * Call sites append a path, e.g. `${internalApiUrl()}/api/tenants/${id}/whatsapp`.
 */
export function internalApiUrl(): string {
  return resolveInternalApiUrl(env);
}
