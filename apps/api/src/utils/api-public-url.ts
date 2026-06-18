import { env } from '@leedi/config';

/**
 * Resolve the API's PUBLIC base URL — the origin that external services
 * (Meta webhooks, QStash scheduled jobs) must call back into.
 *
 * Precedence:
 *  1. `API_PUBLIC_URL` when set (trailing slash stripped) — the explicit override
 *     used whenever the API is reached through a tunnel or a distinct host. This is
 *     the PL-14 fix: a cloud service (QStash) cannot reach `localhost`, and a tunnel
 *     host is NOT the web host differing only by port.
 *  2. Legacy derivation: `BETTER_AUTH_URL` with `:3000` swapped for `:API_PORT`.
 *     Back-compatible — only correct when web and API share a host (local default).
 *
 * Pure (takes the relevant env fields) so the precedence is unit-testable without
 * the validated singleton.
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

/**
 * The API's public base URL resolved from the validated singleton env.
 * Call sites append a path, e.g. `${apiPublicUrl()}/api/internal/agent-flush`.
 */
export function apiPublicUrl(): string {
  return resolveApiPublicUrl(env);
}
