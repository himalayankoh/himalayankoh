import { describe, expect, it, vi } from 'vitest';
import {
  isLoopbackOrigin,
  resolveRuntimeSiteOrigin,
  resolveSiteOrigin,
  SITE_ORIGIN_LOCAL,
  SITE_ORIGIN_PRODUCTION,
  SITE_ORIGIN_STAGING,
} from './origin';

/**
 * The bug these tests exist for: a local `.env.local` carried
 * `NEXT_PUBLIC_SITE_URL=http://localhost:3001`, `NEXT_PUBLIC_*` is inlined at
 * build time, and every prerendered artifact plus the deployed sitemap shipped
 * localhost URLs while the deployment's own environment variables said otherwise.
 * The rule under test is that a production build can never emit a loopback origin.
 */
describe('isLoopbackOrigin', () => {
  it.each([
    'http://localhost:3001',
    'http://localhost',
    'https://127.0.0.1:8787',
    'http://0.0.0.0:3000',
    'http://[::1]:3000',
    'http://shop.localhost',
    'http://himalayan.local',
  ])('treats %s as loopback', (origin) => {
    expect(isLoopbackOrigin(origin)).toBe(true);
  });

  it.each([
    'https://preview.himalayankoh.com',
    'https://himalayankoh.com',
    'https://himalayan-koh-ecommerce.8002salman.workers.dev',
    'https://himalayan-koh.vercel.app',
  ])('does not treat %s as loopback', (origin) => {
    expect(isLoopbackOrigin(origin)).toBe(false);
  });

  it('is not fooled by a hostname that merely contains the word localhost', () => {
    expect(isLoopbackOrigin('https://localhost.himalayankoh.com')).toBe(false);
  });
});

describe('resolveSiteOrigin', () => {
  it('honours a configured non-loopback origin', () => {
    expect(
      resolveSiteOrigin({ configured: SITE_ORIGIN_STAGING, nodeEnv: 'production' })
    ).toBe(SITE_ORIGIN_STAGING);
  });

  it('strips a trailing slash so canonical URLs never double up', () => {
    expect(
      resolveSiteOrigin({ configured: 'https://himalayankoh.com/', nodeEnv: 'production' })
    ).toBe('https://himalayankoh.com');
  });

  it('trims surrounding whitespace', () => {
    expect(
      resolveSiteOrigin({ configured: '  https://preview.himalayankoh.com  ', nodeEnv: 'production' })
    ).toBe(SITE_ORIGIN_STAGING);
  });

  it('refuses a loopback origin in a production build and falls back to production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      resolveSiteOrigin({ configured: 'http://localhost:3001', nodeEnv: 'production' })
    ).toBe(SITE_ORIGIN_PRODUCTION);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('http://localhost:3001');
    warn.mockRestore();
  });

  it('allows a loopback origin in a development build', () => {
    expect(
      resolveSiteOrigin({ configured: 'http://localhost:3001', nodeEnv: 'development' })
    ).toBe('http://localhost:3001');
  });

  it('allows a loopback origin in a production build only behind the explicit escape hatch', () => {
    expect(
      resolveSiteOrigin({
        configured: 'http://localhost:8787',
        nodeEnv: 'production',
        allowLoopback: true,
      })
    ).toBe('http://localhost:8787');
  });

  it('defaults a production build with nothing configured to the production origin', () => {
    expect(resolveSiteOrigin({ configured: '', nodeEnv: 'production' })).toBe(SITE_ORIGIN_PRODUCTION);
    expect(resolveSiteOrigin({ configured: null, nodeEnv: 'production' })).toBe(SITE_ORIGIN_PRODUCTION);
  });

  it('defaults a development build with nothing configured to loopback', () => {
    expect(resolveSiteOrigin({ configured: '', nodeEnv: 'development' })).toBe(SITE_ORIGIN_LOCAL);
  });

  it('ignores a value that is not a URL rather than emitting a broken canonical', () => {
    expect(resolveSiteOrigin({ configured: 'preview.himalayankoh.com', nodeEnv: 'production' })).toBe(
      SITE_ORIGIN_PRODUCTION
    );
    expect(resolveSiteOrigin({ configured: 'ftp://himalayankoh.com', nodeEnv: 'production' })).toBe(
      SITE_ORIGIN_PRODUCTION
    );
  });

  it('publishes the staging origin for the Worker deployment and production for the store', () => {
    expect(SITE_ORIGIN_STAGING).toBe('https://preview.himalayankoh.com');
    expect(SITE_ORIGIN_PRODUCTION).toBe('https://himalayankoh.com');
  });
});

/**
 * The bug these tests exist for: the deployed staging Worker resolved the origin
 * a server-side feature reads from as `http://localhost:3000` — the development
 * fallback — because the build carried no usable `NEXT_PUBLIC_SITE_URL`. Every
 * self-referential read then hit the SSRF guard and was refused, so the product
 * image finder reported "nothing found" while the catalogue was one hostname
 * away. The rule under test is that the host actually being served wins.
 */
describe('resolveRuntimeSiteOrigin', () => {
  it('prefers the catalogue backend, because a Worker cannot fetch its own host', () => {
    expect(
      resolveRuntimeSiteOrigin('https://preview.himalayankoh.com/api/admin/product-images', {
        configured: '',
        nodeEnv: 'development',
        catalogueBackend: 'https://himalayankoh.com/staging',
      })
    ).toBe('https://himalayankoh.com/staging');
  });

  it('falls back to the host being served when there is no separate backend', () => {
    expect(
      resolveRuntimeSiteOrigin('https://preview.himalayankoh.com/api/admin/product-images', {
        configured: '',
        nodeEnv: 'development',
        catalogueBackend: '',
      })
    ).toBe('https://preview.himalayankoh.com');
    expect(
      resolveRuntimeSiteOrigin('https://himalayankoh.com/api/admin/product-images', {
        configured: 'http://localhost:3001',
        nodeEnv: 'development',
      })
    ).toBe('https://himalayankoh.com');
  });

  it('ignores a loopback backend rather than searching localhost from a deployment', () => {
    expect(
      resolveRuntimeSiteOrigin('https://preview.himalayankoh.com/api/admin/product-images', {
        configured: '',
        nodeEnv: 'development',
        catalogueBackend: 'http://localhost:8080',
      })
    ).toBe('https://preview.himalayankoh.com');
  });

  it('uses a real configured origin when the request itself is loopback', () => {
    expect(
      resolveRuntimeSiteOrigin('http://127.0.0.1:3102/api/admin/product-images', {
        configured: 'https://preview.himalayankoh.com',
        nodeEnv: 'development',
      })
    ).toBe('https://preview.himalayankoh.com');
  });

  it('falls back to staging when everything else is loopback or missing', () => {
    expect(
      resolveRuntimeSiteOrigin('http://localhost:3102/api/admin/product-images', {
        configured: 'http://localhost:3001',
        nodeEnv: 'development',
      })
    ).toBe(SITE_ORIGIN_STAGING);
  });

  it('never returns a loopback origin for a request that is not loopback', () => {
    for (const url of [
      'https://preview.himalayankoh.com/api/admin/product-images',
      'https://himalayan-koh-ecommerce.himalayankoh-pk.workers.dev/api/admin/product-images',
    ]) {
      expect(isLoopbackOrigin(resolveRuntimeSiteOrigin(url, { configured: '', nodeEnv: 'development' }))).toBe(
        false
      );
    }
  });

  it('survives a request URL and a backend value that are not URLs', () => {
    expect(
      resolveRuntimeSiteOrigin('not-a-url', { configured: '', nodeEnv: 'development', catalogueBackend: 'nope' })
    ).toBe(SITE_ORIGIN_STAGING);
  });
});
