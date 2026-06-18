import { describe, expect, it } from 'vitest';
import { resolveApiPublicUrl } from '../api-public-url.js';

describe('resolveApiPublicUrl', () => {
  it('falls back to the BETTER_AUTH_URL :3000→API_PORT derivation when API_PUBLIC_URL is unset', () => {
    const url = resolveApiPublicUrl({
      BETTER_AUTH_URL: 'http://localhost:3000',
      API_PORT: 3003,
    });
    expect(url).toBe('http://localhost:3003');
  });

  it('prefers API_PUBLIC_URL when set (e.g. a tunnel), ignoring the derivation', () => {
    const url = resolveApiPublicUrl({
      API_PUBLIC_URL: 'https://leedi-dev.example.com',
      BETTER_AUTH_URL: 'http://localhost:3000',
      API_PORT: 3003,
    });
    expect(url).toBe('https://leedi-dev.example.com');
  });

  it('strips a trailing slash from API_PUBLIC_URL so callers can append paths', () => {
    const url = resolveApiPublicUrl({
      API_PUBLIC_URL: 'https://leedi-dev.example.com/',
      BETTER_AUTH_URL: 'http://localhost:3000',
      API_PORT: 3003,
    });
    expect(url).toBe('https://leedi-dev.example.com');
  });
});
