import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  LEGACY_CALLBACK_HEADERS_TO_DROP,
  LEGACY_WOO_CALLBACK_PARAM,
  legacyWooCallback,
} from './legacyWooCallback';

/**
 * The legacy WooCommerce callback surface, pinned.
 *
 * The failure this guards is invisible from a browser: the provider gets a 200 for the
 * shop's homepage, the shop is never told about the payment, and the only symptom is an
 * order that stays unpaid. So both halves are pinned here — that the callback *is*
 * relayed, and that nothing else is. The second half is the security half.
 */
const match = (url: string) => {
  const parsed = new URL(url, 'https://himalayankoh.com');
  return legacyWooCallback(parsed.pathname, parsed.searchParams);
};

describe('legacyWooCallback', () => {
  it('relays the gateway callback in the form the dashboard holds', () => {
    // The live install's Stripe plugin registers itself as `wc_stripe`; the parameter is
    // WooCommerce's own legacy convention.
    expect(match('/?wc-api=wc_stripe')).toEqual({ forward: true, reason: 'wc-api-query' });
    // The plugin class name is also a spelling in use (`WC_Stripe`), and the relay must not
    // be the thing that decides which one the backend knows.
    expect(match('/?wc-api=WC_Stripe').forward).toBe(true);
    expect(match('/?wc-api=wc_stripe&order_id=1').forward).toBe(true);
    expect(LEGACY_WOO_CALLBACK_PARAM).toBe('wc-api');
  });

  it('relays the pretty-permalink form of the same convention', () => {
    expect(match('/wc-api/wc_stripe')).toEqual({ forward: true, reason: 'wc-api-path' });
    expect(match('/wc-api/').forward).toBe(true);
  });

  it('relays an unknown handler rather than guessing which plugins are installed', () => {
    // A plugin the owner installs later must work with no change here; the backend — the
    // only thing that knows its own handlers — gives the answer.
    expect(match('/?wc-api=some_other_gateway').forward).toBe(true);
  });

  it('refuses everything that is not the callback surface', () => {
    for (const url of [
      '/',
      '/?utm_source=newsletter',
      '/products?category=live-stock',
      '/products?search=wc-api',
      '/api/catalog',
      '/api/orders/create',
      // The storefront's own payment endpoint. It must never be captured by this relay:
      // it is a different endpoint, with a different secret, and it is not live yet.
      '/api/stripe/webhook',
      // WordPress's own surfaces stay at the backend hostname, where the owner reaches them.
      '/wp-json/wc/v3/orders',
      '/wp-admin/',
      '/wp-login.php',
      '/wp-content/uploads/2023/08/S6.jpg',
      '/product/himalayan-edible-pink-salt',
      '/my-account/orders/',
    ]) {
      expect(match(url).forward, url).toBe(false);
    }
  });

  it('does not treat a callback-shaped *path segment* as the callback surface', () => {
    expect(match('/blog/wc-api/wc_stripe').forward).toBe(false);
    expect(match('/products?wc-api').forward).toBe(true); // WooCommerce's own empty form
  });
});

describe('the relay preserves what the gateway verifies', () => {
  const middleware = readFileSync(fileURLToPath(new URL('../../middleware.ts', import.meta.url)), 'utf8');

  it('runs ahead of the URL rules, which would otherwise rewrite a callback', () => {
    const bridge = middleware.indexOf('legacyWooCallback(pathname, searchParams).forward');
    const normalisation = middleware.indexOf('retireOffNicheContentUrl(request, pathname)');
    expect(bridge).toBeGreaterThan(-1);
    expect(normalisation).toBeGreaterThan(-1);
    expect(bridge).toBeLessThan(normalisation);
  });

  it('relays the body as the exact bytes the provider signed', () => {
    // `arrayBuffer()` copies the body whole, and the copy is what goes upstream. Anything
    // that parsed it first — a JSON parse, a form decode — would invalidate the gateway's
    // signature and turn every delivery into a forgery, so the relay must not read the
    // body any other way.
    expect(middleware).toMatch(/const buffered = await request\.arrayBuffer\(\)/);
    const relay = middleware.slice(
      middleware.indexOf('async function forwardLegacyWooCallback'),
      middleware.indexOf('function retireOffNicheContentUrl'),
    );
    expect(relay).toMatch(/body: buffered,|^\s+body,$/m);
    for (const decode of ['request.json()', 'request.formData()', 'request.text()']) {
      expect(relay, decode).not.toContain(decode);
    }
  });

  it('sends the request to the configured backend, and refuses to send it to itself', () => {
    expect(middleware).toMatch(/const backend = backendConfig\.wordpressBaseUrl/);
    expect(middleware).toMatch(/target\.host\.toLowerCase\(\) === arrival/);
    // Not followed: a canonical-host redirect points back at this deployment.
    expect(middleware).toMatch(/redirect: 'manual'/);
  });

  it('never forwards the caller’s WordPress session or a credential', () => {
    // The callback carries the gateway's signature as its authentication. A relayed
    // `Authorization` header would make the shopping domain a forwarding service for
    // whatever credential the backend accepts — measured, and refused.
    expect(LEGACY_CALLBACK_HEADERS_TO_DROP).toContain('cookie');
    expect(LEGACY_CALLBACK_HEADERS_TO_DROP).toContain('authorization');
    // The arrival host is not forwarded either: the edge routes on `Host`, and a copied
    // localhost host answered the relayed callback with a 403 that the identical request
    // without it never received.
    expect(LEGACY_CALLBACK_HEADERS_TO_DROP).toContain('host');
    expect(middleware).toMatch(/for \(const name of LEGACY_CALLBACK_HEADERS_TO_DROP\) headers\.delete\(name\)/);
  });

  it('keeps the backend’s `…/staging` prefix instead of resolving it away', () => {
    // A resolved absolute path would drop the prefix and relay the callback to the wrong
    // install — measured against the staging backend, which lives under a path.
    expect(middleware).toMatch(/new URL\(`\$\{backend\.replace\(\/\\\/\+\$\/, ''\)\}\$\{request\.nextUrl\.pathname\}/);
  });
});
