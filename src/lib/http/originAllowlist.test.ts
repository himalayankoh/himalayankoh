import { describe, expect, it } from 'vitest';
import { SITE_ORIGIN } from '@/lib/site/origin';
import { isAllowedRequestOrigin } from './originAllowlist';

describe('isAllowedRequestOrigin', () => {
  const DEPLOYMENT = 'https://himalayan-koh-ecommerce.8002salman.workers.dev/products';

  it('allows the origin the deployment is actually served from', () => {
    // The whole point of the rewrite: no hostname is named anywhere, so a preview
    // domain, a temporary workers.dev host and production all work.
    expect(isAllowedRequestOrigin('https://himalayan-koh-ecommerce.8002salman.workers.dev', DEPLOYMENT)).toBe(
      true
    );
    expect(isAllowedRequestOrigin('https://preview.himalayankoh.com', 'https://preview.himalayankoh.com/ai')).toBe(
      true
    );
  });

  it('allows the configured public origin even when it differs from the request host', () => {
    // A custom domain in front of a temporary deployment: the configured origin is
    // what the browser page is on. Asserted against the origin this build actually
    // resolved rather than a literal, so the test does not silently encode one
    // deployment's configuration — and it pins that scheme still matters.
    const configured = new URL(SITE_ORIGIN);
    expect(isAllowedRequestOrigin(SITE_ORIGIN, DEPLOYMENT)).toBe(configured.protocol === 'https:');
  });

  it('refuses a third-party origin', () => {
    expect(isAllowedRequestOrigin('https://evil.example', DEPLOYMENT)).toBe(false);
    expect(isAllowedRequestOrigin('https://himalayankoh.com.evil.example', DEPLOYMENT)).toBe(false);
  });

  it('refuses any host on a shared suffix, which a suffix rule would have allowed', () => {
    // The previous version scoped `VERCEL_*` to this project, and the comment on it
    // warned about exactly this: `*.vercel.app` is shared with unrelated projects.
    expect(isAllowedRequestOrigin('https://someone-elses-app.vercel.app', DEPLOYMENT)).toBe(false);
  });

  it('refuses an insecure origin and junk', () => {
    expect(
      isAllowedRequestOrigin('http://himalayan-koh-ecommerce.8002salman.workers.dev', DEPLOYMENT)
    ).toBe(false);
    expect(isAllowedRequestOrigin('', DEPLOYMENT)).toBe(false);
    expect(isAllowedRequestOrigin('not a url', DEPLOYMENT)).toBe(false);
    expect(isAllowedRequestOrigin('https://preview.himalayankoh.com', 'not a url')).toBe(false);
  });

  it('allows loopback only in development', () => {
    const dev = isAllowedRequestOrigin('http://localhost:3001', 'http://localhost:3001/api/openrouter');
    if (process.env.NODE_ENV === 'development') {
      expect(dev).toBe(true);
    } else {
      expect(dev).toBe(false);
    }
  });
});
