import { describe, expect, it } from 'vitest';
import { PRODUCTION_HOSTS, isProductionHost, requiresNoindex } from './indexing';

describe('isProductionHost', () => {
  it('matches the published storefront hosts', () => {
    expect(isProductionHost('himalayankoh.com')).toBe(true);
    expect(isProductionHost('www.himalayankoh.com')).toBe(true);
  });

  it('is insensitive to casing, padding and an explicit port', () => {
    expect(isProductionHost('HimalayanKoh.com')).toBe(true);
    expect(isProductionHost('himalayankoh.com:443')).toBe(true);
    expect(isProductionHost('  himalayankoh.com  ')).toBe(true);
  });

  it('does not treat a longer hostname that merely ends in the domain as production', () => {
    // The rule is an exact host match. A suffix rule would publish every
    // subdomain someone could point at this build — including a preview.
    for (const host of [
      'notpreview.himalayankoh.com',
      'staging.himalayankoh.com',
      'preview.himalayankoh.com',
      'evil-himalayankoh.com',
      'himalayankoh.com.evil.test',
    ]) {
      expect(isProductionHost(host)).toBe(false);
      expect(requiresNoindex(host)).toBe(true);
    }
  });

  it('keeps the host list exact', () => {
    // Adding a host here publishes it. Keep the list short and reviewed.
    expect(PRODUCTION_HOSTS).toEqual(['himalayankoh.com', 'www.himalayankoh.com']);
  });
});

describe('requiresNoindex', () => {
  it('covers the preview subdomain', () => {
    expect(requiresNoindex('preview.himalayankoh.com')).toBe(true);
    expect(requiresNoindex('Preview.HimalayanKoh.com:443')).toBe(true);
  });

  it('covers the temporary verification alias', () => {
    expect(requiresNoindex('himalayan-koh-admin-verify.vercel.app')).toBe(true);
  });

  it('covers every Cloudflare Workers deployment host', () => {
    // These names are assigned per deployment and change on the next one, which
    // is exactly why the rule is an allowlist: the temporary Workers URL must
    // stay non-indexable without anyone remembering to add it.
    expect(requiresNoindex('himalayan-koh-ecommerce.workers.dev')).toBe(true);
    expect(requiresNoindex('himalayan-koh-ecommerce.8002salman.workers.dev')).toBe(true);
    expect(requiresNoindex('workers.dev')).toBe(true);
    // ...but not a lookalike domain that merely contains the label.
    expect(requiresNoindex('workers.dev.evil.test')).toBe(true);
    expect(isProductionHost('workers.dev.evil.test')).toBe(false);
  });

  it('covers local development and a missing Host header', () => {
    expect(requiresNoindex('localhost:3002')).toBe(true);
    expect(requiresNoindex('127.0.0.1:8787')).toBe(true);
    expect(requiresNoindex('')).toBe(true);
    expect(requiresNoindex(null)).toBe(true);
    expect(requiresNoindex(undefined)).toBe(true);
  });
});
