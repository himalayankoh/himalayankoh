import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adminSessionTtlMs,
  createAdminSession,
  isAdminAuthConfigured,
  readBearerToken,
  verifyAdminSessionToken,
} from './adminSession';

const SECRET = 'test-secret-that-is-long-enough-1234';

const IDENTITY = {
  id: '7',
  username: 'salman',
  email: 'salman@himalayankoh.com',
  name: 'Salman Bashir',
};

const originalSecret = process.env.ADMIN_SESSION_SECRET;
const originalTtl = process.env.ADMIN_SESSION_TTL_HOURS;

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  delete process.env.ADMIN_SESSION_TTL_HOURS;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalSecret;
  if (originalTtl === undefined) delete process.env.ADMIN_SESSION_TTL_HOURS;
  else process.env.ADMIN_SESSION_TTL_HOURS = originalTtl;
});

describe('admin session tokens', () => {
  it('round-trips a signed session and reports the WordPress identity', async () => {
    const { token, payload } = await createAdminSession(IDENTITY);

    const verified = await verifyAdminSessionToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe('7');
    expect(verified?.username).toBe('salman');
    expect(verified?.email).toBe('salman@himalayankoh.com');
    expect(verified?.role).toBe('admin');
    expect(verified?.exp).toBe(payload.exp);
  });

  it('rejects a token whose signature was tampered with', async () => {
    const { token } = await createAdminSession(IDENTITY);
    const [body, signature] = token.split('.');
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

    expect(await verifyAdminSessionToken(`${body}.${flipped}`)).toBeNull();
  });

  it('rejects a payload rewritten to claim admin', async () => {
    const { token } = await createAdminSession(IDENTITY);
    const signature = token.split('.')[1];
    const forgedBody = btoa(
      JSON.stringify({ sub: '1', username: 'attacker', role: 'admin', exp: Date.now() + 60_000 })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(await verifyAdminSessionToken(`${forgedBody}.${signature}`)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await verifyAdminSessionToken('')).toBeNull();
    expect(await verifyAdminSessionToken('nodot')).toBeNull();
    expect(await verifyAdminSessionToken('body.')).toBeNull();
    expect(await verifyAdminSessionToken('.signature')).toBeNull();
  });

  it('rejects an expired session even though its signature is valid', async () => {
    process.env.ADMIN_SESSION_TTL_HOURS = '0.0001'; // ~360ms
    const { token } = await createAdminSession(IDENTITY);
    expect(await verifyAdminSessionToken(token)).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 420));

    expect(await verifyAdminSessionToken(token)).toBeNull();
  });

  it('fails closed when the signing key is missing', async () => {
    const { token } = await createAdminSession(IDENTITY);
    delete process.env.ADMIN_SESSION_SECRET;

    expect(isAdminAuthConfigured()).toBe(false);
    expect(await verifyAdminSessionToken(token)).toBeNull();
    await expect(createAdminSession(IDENTITY)).rejects.toThrow(/ADMIN_SESSION_SECRET/);
  });

  it('treats a too-short secret as unconfigured rather than accepting it', () => {
    process.env.ADMIN_SESSION_SECRET = 'short-secret';
    expect(isAdminAuthConfigured()).toBe(false);
    expect(adminSessionTtlMs()).toBe(12 * 3_600_000);
  });
});

describe('adminSessionTtlMs', () => {
  it('clamps nonsense and out-of-range values to the default', () => {
    process.env.ADMIN_SESSION_TTL_HOURS = 'not-a-number';
    expect(adminSessionTtlMs()).toBe(12 * 3_600_000);

    process.env.ADMIN_SESSION_TTL_HOURS = '99999';
    expect(adminSessionTtlMs()).toBe(12 * 3_600_000);

    process.env.ADMIN_SESSION_TTL_HOURS = '-4';
    expect(adminSessionTtlMs()).toBe(12 * 3_600_000);
  });

  it('honours a sane value', () => {
    process.env.ADMIN_SESSION_TTL_HOURS = '2';
    expect(adminSessionTtlMs()).toBe(2 * 3_600_000);
  });
});

describe('readBearerToken', () => {
  const withHeader = (value?: string) =>
    new Request('https://example.com/api/admin/x', {
      headers: value === undefined ? undefined : { authorization: value },
    });

  it('reads the token whatever the prefix casing', () => {
    expect(readBearerToken(withHeader('bearer abc'))).toBe('abc');
    expect(readBearerToken(withHeader('Bearer   abc  '))).toBe('abc');
  });

  it('returns null when absent, empty or the wrong scheme', () => {
    expect(readBearerToken(withHeader())).toBeNull();
    expect(readBearerToken(withHeader('Bearer   '))).toBeNull();
    expect(readBearerToken(withHeader('Basic abc'))).toBeNull();
  });
});
