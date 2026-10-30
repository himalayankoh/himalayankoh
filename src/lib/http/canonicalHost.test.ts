import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { CANONICAL_APEX_HOST, WWW_HOST, canonicalHostRedirect, hostWithoutPort } from './canonicalHost';

/**
 * The canonical hostname rule, pinned.
 *
 * Every case here is a way the rule can go wrong in production rather than a way it can
 * look wrong in a test: a redirect that eats a query parameter, a redirect that fires on
 * the staging hostname, a `301` that turns a `POST` into a bodyless `GET`, and a rule that
 * is wired *before* the WooCommerce callback relay so a webhook is redirected instead of
 * delivered.
 */
describe('hostWithoutPort', () => {
  it('strips a port and lowercases, and leaves a bracketed IPv6 literal intact', () => {
    expect(hostWithoutPort('www.himalayankoh.com:443')).toBe('www.himalayankoh.com');
    expect(hostWithoutPort('  WWW.HimalayanKoh.com  ')).toBe('www.himalayankoh.com');
    expect(hostWithoutPort('127.0.0.1:3031')).toBe('127.0.0.1');
    expect(hostWithoutPort('[::1]:8787')).toBe('[::1]');
    expect(hostWithoutPort('[::1]')).toBe('[::1]');
  });

  it('answers an empty host for nothing at all', () => {
    expect(hostWithoutPort(null)).toBe('');
    expect(hostWithoutPort(undefined)).toBe('');
    expect(hostWithoutPort('   ')).toBe('');
  });
});

describe('canonicalHostRedirect', () => {
  it('redirects www to the apex, preserving the path verbatim', () => {
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/products' })).toBe(
      `https://${CANONICAL_APEX_HOST}/products`
    );
    // The trailing slash is a different URL and is not normalised here.
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/products/' })).toBe(
      `https://${CANONICAL_APEX_HOST}/products/`
    );
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/products/pouches' })).toBe(
      `https://${CANONICAL_APEX_HOST}/products/pouches`
    );
  });

  it('preserves the query string exactly, separators and casing included', () => {
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/products', search: '?category=live-stock' })).toBe(
      `https://${CANONICAL_APEX_HOST}/products?category=live-stock`
    );
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/blog', search: '?page=2&sort=Date' })).toBe(
      `https://${CANONICAL_APEX_HOST}/blog?page=2&sort=Date`
    );
    // A parameter that would be dropped by any "known parameters only" rewrite.
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/', search: '?utm_source=newsletter' })).toBe(
      `https://${CANONICAL_APEX_HOST}/?utm_source=newsletter`
    );
  });

  it('fires on the same host written with a port or different casing', () => {
    expect(canonicalHostRedirect({ host: 'www.himalayankoh.com:443', pathname: '/products' })).toBe(
      `https://${CANONICAL_APEX_HOST}/products`
    );
    expect(canonicalHostRedirect({ host: 'WWW.HimalayanKoh.com', pathname: '/products' })).toBe(
      `https://${CANONICAL_APEX_HOST}/products`
    );
  });

  it('leaves the apex itself alone — which is what stops a loop', () => {
    // The target of the redirect is never itself redirected, so one hop is all there is.
    expect(canonicalHostRedirect({ host: CANONICAL_APEX_HOST, pathname: '/' })).toBeNull();
    expect(canonicalHostRedirect({ host: CANONICAL_APEX_HOST, pathname: '/products' })).toBeNull();
  });

  it('never touches a hostname the shop does not own', () => {
    for (const host of [
      'preview.himalayankoh.com',
      'himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev',
      'localhost:3000',
      '127.0.0.1:8787',
      'evil-www.himalayankoh.com',
      'himalayankoh.com.evil.test',
      '',
      null,
      undefined,
    ]) {
      expect(canonicalHostRedirect({ host, pathname: '/products' }), String(host)).toBeNull();
    }
  });

  it('redirects only GET and HEAD, so a POST is never turned into a bodyless read', () => {
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/', method: 'GET' })).not.toBeNull();
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/', method: 'HEAD' })).not.toBeNull();
    expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/', method: 'get' })).not.toBeNull();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(canonicalHostRedirect({ host: WWW_HOST, pathname: '/', method }), method).toBeNull();
    }
  });
});

/**
 * The wiring, read as text — the same guard shape the footer's and the homepage's category
 * links use in `lib/categoryContent/shelves.test.ts`.
 *
 * Two things about the *order* of the rules in `middleware.ts` are load-bearing and cannot
 * be seen from the pure function: the WooCommerce callback has to be relayed before this
 * redirect (a `301` on a webhook delivery is a lost payment event, and the arrival host is
 * not part of what Stripe's endpoint URL promises), and the canonical host has to be
 * settled before the niche rules build a redirect of their own (otherwise a `www` URL that
 * also names something off-niche answers with a redirect to the duplicate host first).
 */
describe('the middleware wires the rule in the right order', () => {
  const middleware = readFileSync(fileURLToPath(new URL('../../middleware.ts', import.meta.url)), 'utf8');

  it('imports and calls the canonical-host rule', () => {
    expect(middleware).toMatch(/from '@\/lib\/http\/canonicalHost'/);
    expect(middleware).toMatch(/canonicalHostRedirect\(\{/);
    expect(middleware).toMatch(/NextResponse\.redirect\(canonical, 301\)/);
  });

  it('relays the WooCommerce callback before it redirects by host', () => {
    const relay = middleware.indexOf('legacyWooCallback(pathname, searchParams).forward');
    const canonical = middleware.indexOf('canonicalHostRedirect({');
    expect(relay).toBeGreaterThan(-1);
    expect(canonical).toBeGreaterThan(-1);
    expect(relay).toBeLessThan(canonical);
  });
});
