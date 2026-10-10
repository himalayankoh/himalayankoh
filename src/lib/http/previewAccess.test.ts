import { describe, expect, it } from 'vitest';
import {
  PREVIEW_COOKIE,
  PREVIEW_QUERY_PARAM,
  presentedPreviewToken,
  previewAccessDecision,
  requiresPreviewAccess,
} from './previewAccess';
import { PRODUCTION_HOSTS } from '@/lib/seo/indexing';

/**
 * The gate has two failure modes and they are asymmetric, so each gets its own test:
 * too loose and a deployment holding live keys is public, too tight and the owner is
 * locked out of their own store on the day of the cutover.
 */

const TOKEN = 'preview-token-0123456789abcdef';

describe('requiresPreviewAccess', () => {
  it('is off when no token is configured, so staging and next dev are unchanged', () => {
    expect(requiresPreviewAccess({ host: 'x.workers.dev', configuredToken: '', authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    expect(requiresPreviewAccess({ host: 'x.workers.dev', configuredToken: null, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    expect(requiresPreviewAccess({ host: 'x.workers.dev', configuredToken: '   ', authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
  });

  it('never gates a production host — that would be a store-wide outage', () => {
    for (const host of PRODUCTION_HOSTS) {
      expect(requiresPreviewAccess({ host, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    }
    // Casing and a port must not be enough to slip past, or to trip the gate.
    expect(requiresPreviewAccess({ host: 'HimalayanKoh.com', configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    expect(requiresPreviewAccess({ host: 'himalayankoh.com:443', configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
  });

  it('gates any other public host when a token is configured', () => {
    for (const host of ['himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev', 'preview.himalayankoh.com']) {
      expect(requiresPreviewAccess({ host, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(true);
    }
  });

  it('leaves a request with no host alone — that is a build’s own prerender, not a visitor', () => {
    // `next build` prerenders `/_not-found` through the middleware with no `Host` header.
    // Gating it failed the build, so the absence of a host is the exemption that keeps the
    // build runnable while `.env.local` holds the deploy token. Cloudflare requires `Host`
    // of a real request, so no caller can reach the Worker in this shape.
    expect(requiresPreviewAccess({ host: null, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    expect(requiresPreviewAccess({ host: '', configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    expect(requiresPreviewAccess({ host: '   ', configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
  });

  it('leaves loopback alone, so a developer with the deploy token can still use next dev', () => {
    for (const host of ['localhost:3000', 'localhost', '127.0.0.1:8787', '[::1]:8787']) {
      expect(requiresPreviewAccess({ host, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS)).toBe(false);
    }
  });
});

describe('presentedPreviewToken', () => {
  it('reads the header a script sends', () => {
    expect(presentedPreviewToken({ authorization: `Bearer ${TOKEN}`, cookie: null })).toBe(TOKEN);
    expect(presentedPreviewToken({ authorization: `bearer ${TOKEN}`, cookie: null })).toBe(TOKEN);
  });

  it('reads the cookie a browser holds after the exchange', () => {
    expect(presentedPreviewToken({ authorization: null, cookie: TOKEN })).toBe(TOKEN);
  });

  it('presents nothing when neither is there, and ignores a non-Bearer scheme', () => {
    expect(presentedPreviewToken({ authorization: null, cookie: null })).toBe('');
    expect(presentedPreviewToken({ authorization: `Basic ${TOKEN}`, cookie: null })).toBe('');
  });
});

describe('previewAccessDecision', () => {
  const host = 'himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev';

  it('allows an unconfigured deployment, and says why', () => {
    const d = previewAccessDecision({ host, configuredToken: '', authorization: null, cookie: null }, PRODUCTION_HOSTS);
    expect(d).toEqual({ required: false, authorized: true, reason: 'open' });
  });

  it('allows a production host, and says why', () => {
    const d = previewAccessDecision({ host: 'himalayankoh.com', configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS);
    expect(d).toEqual({ required: false, authorized: true, reason: 'production-host' });
  });

  it('distinguishes a non-public request from a production host and from an open deployment', () => {
    // Three different "allowed" answers, because they mean three different things in a log
    // or a bug report: the store itself, a build/loopback request, and no gate configured.
    const noHost = previewAccessDecision({ host: null, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS);
    expect(noHost).toEqual({ required: false, authorized: true, reason: 'not-a-public-request' });

    const loopback = previewAccessDecision({ host: 'localhost:3000', configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS);
    expect(loopback).toEqual({ required: false, authorized: true, reason: 'not-a-public-request' });
  });

  it('still refuses an unauthenticated public request after the exemptions', () => {
    // The exemptions above are narrow: a real host with no token is still refused.
    const d = previewAccessDecision({ host, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS);
    expect(d.required).toBe(true);
    expect(d.authorized).toBe(false);
  });

  it('refuses a gated request with nothing presented', () => {
    const d = previewAccessDecision({ host, configuredToken: TOKEN, authorization: null, cookie: null }, PRODUCTION_HOSTS);
    expect(d).toEqual({ required: true, authorized: false, reason: 'missing' });
  });

  it('refuses a partial, extended or case-changed token — the comparison is exact', () => {
    for (const wrong of [TOKEN.slice(0, -1), TOKEN + 'x', `x${TOKEN}`, TOKEN.toUpperCase(), TOKEN.replace('-', '_'), 'x']) {
      const d = previewAccessDecision({ host, configuredToken: TOKEN, authorization: `Bearer ${wrong}`, cookie: null }, PRODUCTION_HOSTS);
      expect(d.authorized, `expected ${JSON.stringify(wrong)} to be refused`).toBe(false);
      expect(d.reason).toBe('mismatch');
    }
  });

  it('tolerates padding around the header value, which is legal HTTP and cannot admit another token', () => {
    // Documented behaviour, asserted so it cannot drift: stripped at the edges, still exact.
    const padded = previewAccessDecision({ host, configuredToken: TOKEN, authorization: `Bearer   ${TOKEN}  `, cookie: null }, PRODUCTION_HOSTS);
    expect(padded.authorized).toBe(true);

    // But padding *inside* the token makes it a different value, and is refused.
    const inside = previewAccessDecision({ host, configuredToken: TOKEN, authorization: `Bearer ${TOKEN.slice(0, 8)} ${TOKEN.slice(8)}`, cookie: null }, PRODUCTION_HOSTS);
    expect(inside.authorized).toBe(false);
  });

  it('allows the exact token from either carrier', () => {
    expect(previewAccessDecision({ host, configuredToken: TOKEN, authorization: `Bearer ${TOKEN}`, cookie: null }, PRODUCTION_HOSTS)).toEqual({ required: true, authorized: true, reason: 'authorized-header' });
    expect(previewAccessDecision({ host, configuredToken: TOKEN, authorization: null, cookie: TOKEN }, PRODUCTION_HOSTS)).toEqual({ required: true, authorized: true, reason: 'authorized-cookie' });
  });

  it('prefers the header when both are present and only the header is valid', () => {
    const d = previewAccessDecision({ host, configuredToken: TOKEN, authorization: `Bearer ${TOKEN}`, cookie: 'stale' }, PRODUCTION_HOSTS);
    expect(d.reason).toBe('authorized-header');
  });

  it('still honors a valid cookie when the header carries an unrelated bearer (admin console on a gated QA URL)', () => {
    // The admin SPA sends `Authorization: Bearer <admin-session>` on every API
    // call; on a gated host that bearer must not shadow a valid preview cookie
    // into a mismatch — either carrier matching exactly is enough.
    const d = previewAccessDecision({ host, configuredToken: TOKEN, authorization: 'Bearer admin-session-token', cookie: TOKEN }, PRODUCTION_HOSTS);
    expect(d).toEqual({ required: true, authorized: true, reason: 'authorized-cookie' });
  });

  it('refuses when both carriers are present but neither matches', () => {
    const d = previewAccessDecision({ host, configuredToken: TOKEN, authorization: 'Bearer wrong', cookie: 'also-wrong' }, PRODUCTION_HOSTS);
    expect(d).toEqual({ required: true, authorized: false, reason: 'mismatch' });
  });
});

describe('the constants the middleware and the owner both depend on', () => {
  it('names the cookie and the exchange parameter exactly once', () => {
    expect(PREVIEW_COOKIE).toBe('hk_preview');
    expect(PREVIEW_QUERY_PARAM).toBe('hk_preview');
  });
});
