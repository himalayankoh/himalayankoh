import { describe, expect, it } from 'vitest';
import { clientIp } from './clientIp';

/**
 * The rate-limit key for the storefront's money-spending endpoints is built from this
 * value, so what matters is that it prefers the one header the edge sets and cannot be
 * talked into returning a caller-influenced string.
 */
function request(headers: Record<string, string> = {}) {
  return new Request('https://himalayankoh.com/api/shippo/rates', { method: 'POST', headers });
}

describe('clientIp', () => {
  it('prefers cf-connecting-ip, which the edge sets and a client cannot forge', () => {
    expect(clientIp(request({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('prefers cf-connecting-ip over a forged x-forwarded-for', () => {
    // The whole point: both headers are present, and the client-supplied one loses.
    expect(
      clientIp(
        request({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }),
      ),
    ).toBe('203.0.113.7');
  });

  it('falls back to the first x-forwarded-for entry when the edge header is absent', () => {
    expect(clientIp(request({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe('198.51.100.9');
  });

  it('accepts an IPv6 edge address', () => {
    expect(clientIp(request({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('ignores an edge header that is not an address rather than keying on it', () => {
    // A value like this did not come from the edge. Keying on it would let a caller
    // choose its own bucket; `unknown` shares one instead.
    expect(clientIp(request({ 'cf-connecting-ip': 'not an ip at all' }))).toBe('unknown');
    expect(clientIp(request({ 'cf-connecting-ip': '1.2.3.4<script>' }))).toBe('unknown');
  });

  it('returns unknown when no address header is present', () => {
    expect(clientIp(request())).toBe('unknown');
  });
});
