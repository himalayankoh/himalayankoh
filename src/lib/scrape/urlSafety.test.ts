import { describe, it, expect } from 'vitest';
import { checkFetchableUrl, normalizeToHttpUrl } from './urlSafety';

describe('checkFetchableUrl — the SSRF guard in front of every server-side fetch', () => {
  it('allows ordinary public http/https URLs', () => {
    for (const url of [
      'https://himalayankoh.com/shop/',
      'https://preview.himalayankoh.com/products/himalayan-rock-salt-45-lbs',
      'http://example.com/page?x=1',
    ]) {
      const result = checkFetchableUrl(url);
      expect(result.ok, url).toBe(true);
      expect(result.url).toContain('://');
    }
  });

  it('accepts a URL pasted without a scheme', () => {
    expect(normalizeToHttpUrl('himalayankoh.com/shop/')).toBe('https://himalayankoh.com/shop/');
    expect(checkFetchableUrl('himalayankoh.com/shop/').ok).toBe(true);
  });

  it('refuses loopback, private, link-local and metadata addresses', () => {
    for (const host of [
      'http://localhost:3000/admin',
      'http://127.0.0.1/',
      'http://0.0.0.0/',
      'http://10.1.2.3/',
      'http://172.16.0.9/',
      'http://172.31.255.1/',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'https://db.internal/',
      'http://thing.local/',
      'http://[::1]/',
    ]) {
      const result = checkFetchableUrl(host);
      expect(result.ok, host).toBe(false);
      expect(result.reason, host).toMatch(/refusing|local|private/i);
    }
  });

  it('refuses non-http schemes and embedded credentials', () => {
    expect(checkFetchableUrl('file:///C:/Users/basco/.env.local').ok).toBe(false);
    expect(checkFetchableUrl('ftp://example.com/x').ok).toBe(false);
    expect(checkFetchableUrl('https://user:pass@example.com/').ok).toBe(false);
    expect(checkFetchableUrl('https://example.com/').ok).toBe(true);
  });

  it('rejects nonsense instead of guessing', () => {
    expect(checkFetchableUrl('').ok).toBe(false);
    expect(checkFetchableUrl('   ').ok).toBe(false);
    expect(checkFetchableUrl('://nope').ok).toBe(false);
  });

  it('does not treat a public IP that merely contains 127 as loopback', () => {
    // 127.0.0.1 is blocked, but 112.7.0.1 and 212.7.0.1 are public.
    expect(checkFetchableUrl('http://112.7.0.1/').ok).toBe(true);
    expect(checkFetchableUrl('http://212.7.0.1/').ok).toBe(true);
  });
});
