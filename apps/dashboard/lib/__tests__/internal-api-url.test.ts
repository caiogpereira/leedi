import { describe, it, expect } from 'vitest';
import { resolveInternalApiUrl } from '../internal-api-url';

describe('resolveInternalApiUrl (PL-14b)', () => {
  it('prefers INTERNAL_API_URL when set', () => {
    expect(
      resolveInternalApiUrl({
        INTERNAL_API_URL: 'http://api.internal:8080',
        BETTER_AUTH_URL: 'https://app.example.com',
        API_PORT: 3003,
      })
    ).toBe('http://api.internal:8080');
  });

  it('strips a trailing slash from INTERNAL_API_URL', () => {
    expect(
      resolveInternalApiUrl({
        INTERNAL_API_URL: 'http://api.internal:8080/',
        BETTER_AUTH_URL: 'https://app.example.com',
        API_PORT: 3003,
      })
    ).toBe('http://api.internal:8080');
  });

  it('falls back to the legacy :3000 -> :API_PORT derivation when unset', () => {
    expect(
      resolveInternalApiUrl({
        INTERNAL_API_URL: undefined,
        BETTER_AUTH_URL: 'http://localhost:3000',
        API_PORT: 3003,
      })
    ).toBe('http://localhost:3003');
  });

  it('legacy derivation is a no-op when BETTER_AUTH_URL has no :3000 (prod hazard PL-14b guards)', () => {
    // This is exactly the broken case INTERNAL_API_URL exists to fix: a prod
    // BETTER_AUTH_URL with no :3000 yields the wrong host under the fallback.
    expect(
      resolveInternalApiUrl({
        INTERNAL_API_URL: undefined,
        BETTER_AUTH_URL: 'https://app.example.com',
        API_PORT: 3003,
      })
    ).toBe('https://app.example.com');
  });

  // Drift guard: the legacy fallback expression must stay byte-identical to the
  // inline derivation it replaced across the BFF proxy routes (mirrors PL-14a).
  it('legacy fallback matches the original inline expression', () => {
    const e = { INTERNAL_API_URL: undefined, BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: 3003 };
    const inline = e.BETTER_AUTH_URL.replace(':3000', `:${e.API_PORT}`);
    expect(resolveInternalApiUrl(e)).toBe(inline);
  });
});
