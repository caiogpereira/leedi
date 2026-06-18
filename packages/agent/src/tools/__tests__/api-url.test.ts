import { describe, expect, it } from 'vitest';
import { resolveApiPublicUrl } from '../api-url.js';

// Drift guard: this resolver is a deliberate self-contained copy of the twin in
// apps/api/src/utils/api-public-url.ts (PL-14a). Keep behavior identical.
describe('resolveApiPublicUrl (agent copy)', () => {
  it('falls back to the BETTER_AUTH_URL :3000→API_PORT derivation when API_PUBLIC_URL is unset', () => {
    expect(
      resolveApiPublicUrl({ BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: 3003 })
    ).toBe('http://localhost:3003');
  });

  it('prefers API_PUBLIC_URL when set (e.g. a tunnel)', () => {
    expect(
      resolveApiPublicUrl({
        API_PUBLIC_URL: 'https://leedi-dev.example.com',
        BETTER_AUTH_URL: 'http://localhost:3000',
        API_PORT: 3003,
      })
    ).toBe('https://leedi-dev.example.com');
  });

  it('strips a trailing slash from API_PUBLIC_URL', () => {
    expect(
      resolveApiPublicUrl({
        API_PUBLIC_URL: 'https://leedi-dev.example.com/',
        BETTER_AUTH_URL: 'http://localhost:3000',
        API_PORT: 3003,
      })
    ).toBe('https://leedi-dev.example.com');
  });
});
