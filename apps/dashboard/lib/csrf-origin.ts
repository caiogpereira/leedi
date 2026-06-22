/**
 * CSRF defense-in-depth (PL-5).
 *
 * The custom state-changing JSON Route Handlers under `/api/*` (impersonation
 * start/stop, tenant switch, and every `/api/tenants/[tenantId]/…` proxy) are
 * NOT Server Actions, so Next.js's built-in Server-Action Origin check does not
 * cover them. Until now they relied solely on `SameSite=Lax` cookies. This adds
 * an explicit same-origin assertion as a second layer.
 *
 * It is deliberately CONSERVATIVE: it rejects only on *positive* evidence of a
 * cross-origin request (`Sec-Fetch-Site: cross-site` — a forbidden header a page
 * script cannot forge — or an `Origin` whose host differs from the request host).
 * When no such signal is present it allows the request, so legitimate same-origin
 * browser calls (which always carry a matching `Origin` on POST/PUT/PATCH/DELETE)
 * are never broken, and `SameSite=Lax` remains the primary control. These routes
 * are browser-only; no server-to-server caller hits them.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface OriginCheckInput {
  method: string;
  /** Request host (`request.nextUrl.host`), already proxy-aware in Next. */
  host: string;
  /** `Origin` request header, or null if absent. */
  origin: string | null;
  /** `Sec-Fetch-Site` request header, or null if absent. */
  secFetchSite: string | null;
}

/**
 * Returns true when a state-changing request shows positive cross-origin
 * evidence and must be rejected (HTTP 403). Non-mutating methods and requests
 * with no cross-origin signal return false (allowed).
 */
export function isForbiddenCrossOrigin({
  method,
  host,
  origin,
  secFetchSite,
}: OriginCheckInput): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;

  // `Sec-Fetch-Site` is set by the browser and cannot be overridden by script.
  // `cross-site` is the unambiguous CSRF vector. `same-origin`/`same-site`/`none`
  // are legitimate (`none` = a user-initiated navigation, which can't be a forged
  // POST from another site).
  if (secFetchSite === 'cross-site') return true;

  // Fall back to an Origin host comparison for clients that don't send
  // `Sec-Fetch-Site`. A mismatching host is a cross-origin request.
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      // A malformed Origin on a mutating request is not a legitimate same-origin call.
      return true;
    }
    if (originHost !== host) return true;
  }

  return false;
}
