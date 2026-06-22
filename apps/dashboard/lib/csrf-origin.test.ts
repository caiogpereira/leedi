import { describe, it, expect } from 'vitest';
import { isForbiddenCrossOrigin } from './csrf-origin';

const HOST = 'app.leedi.com';

describe('isForbiddenCrossOrigin (PL-5)', () => {
  it('allows non-mutating methods regardless of origin', () => {
    expect(
      isForbiddenCrossOrigin({
        method: 'GET',
        host: HOST,
        origin: 'https://evil.example',
        secFetchSite: 'cross-site',
      })
    ).toBe(false);
  });

  it('rejects a mutating request flagged cross-site by the browser', () => {
    expect(
      isForbiddenCrossOrigin({
        method: 'POST',
        host: HOST,
        origin: 'https://evil.example',
        secFetchSite: 'cross-site',
      })
    ).toBe(true);
  });

  it('allows same-origin mutations (Sec-Fetch-Site)', () => {
    for (const secFetchSite of ['same-origin', 'same-site', 'none']) {
      expect(
        isForbiddenCrossOrigin({ method: 'POST', host: HOST, origin: `https://${HOST}`, secFetchSite })
      ).toBe(false);
    }
  });

  it('rejects a mutation whose Origin host differs (no Sec-Fetch-Site)', () => {
    expect(
      isForbiddenCrossOrigin({
        method: 'DELETE',
        host: HOST,
        origin: 'https://evil.example',
        secFetchSite: null,
      })
    ).toBe(true);
  });

  it('allows a mutation whose Origin host matches (no Sec-Fetch-Site)', () => {
    expect(
      isForbiddenCrossOrigin({
        method: 'PATCH',
        host: HOST,
        origin: `https://${HOST}`,
        secFetchSite: null,
      })
    ).toBe(false);
  });

  it('allows when there is no cross-origin signal at all (SameSite=Lax remains primary)', () => {
    expect(
      isForbiddenCrossOrigin({ method: 'POST', host: HOST, origin: null, secFetchSite: null })
    ).toBe(false);
  });

  it('rejects a malformed Origin on a mutating request', () => {
    expect(
      isForbiddenCrossOrigin({ method: 'POST', host: HOST, origin: 'not-a-url', secFetchSite: null })
    ).toBe(true);
  });

  it('is case-insensitive on the method', () => {
    expect(
      isForbiddenCrossOrigin({ method: 'post', host: HOST, origin: 'https://evil.example', secFetchSite: 'cross-site' })
    ).toBe(true);
  });
});
