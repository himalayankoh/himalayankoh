import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSession, verifyAdminSessionToken } from './adminSession';
import { signToken } from './sessionToken';
import {
  createCustomerSession,
  customerSessionSecret,
  customerSessionTtlMs,
  isCustomerAuthConfigured,
  verifyCustomerSessionToken,
} from './customerSession';

const SECRET = 'customer-secret-long-enough-to-sign';
const ADMIN_SECRET = 'admin-secret-long-enough-to-sign-as-well';

const IDENTITY = { customerId: 42, email: 'Shopper@Example.com', name: '  Ada Lovelace  ' };

function withEnv(): void {
  process.env.CUSTOMER_SESSION_SECRET = SECRET;
  process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET;
}

describe('customer session tokens', () => {
  beforeEach(withEnv);

  afterEach(() => {
    delete process.env.CUSTOMER_SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.CUSTOMER_SESSION_TTL_HOURS;
    vi.useRealTimers();
  });

  it('carries the WooCommerce customer id, and no Supabase identity', async () => {
    const { payload } = await createCustomerSession(IDENTITY);

    expect(payload.cid).toBe(42);
    expect(payload.role).toBe('customer');
    // The whole point of the migration: the identity is a WooCommerce customer, so
    // the Supabase uuid the app used to carry has no field to live in.
    expect(Object.keys(payload)).not.toContain('sub');
  });

  it('normalises the email and trims the display name', async () => {
    const { payload } = await createCustomerSession(IDENTITY);

    expect(payload.email).toBe('shopper@example.com');
    expect(payload.name).toBe('Ada Lovelace');
  });

  it('verifies a session it minted', async () => {
    const { token, payload } = await createCustomerSession(IDENTITY);

    const verified = await verifyCustomerSessionToken(token);

    expect(verified?.cid).toBe(42);
    expect(verified?.exp).toBe(payload.exp);
  });

  it('rejects a token whose signature does not match', async () => {
    const { token } = await createCustomerSession(IDENTITY);

    expect(await verifyCustomerSessionToken(`${token.slice(0, -2)}xy`)).toBeNull();
    expect(await verifyCustomerSessionToken('not-a-token')).toBeNull();
  });

  it('rejects an administrator session presented as a customer', async () => {
    const { token } = await createAdminSession({
      id: '7',
      username: 'salman',
      email: 'salman@himalayankoh.com',
      name: 'Salman Bashir',
    });

    expect(await verifyCustomerSessionToken(token)).toBeNull();
    // And the reverse: a customer token is not an administrator.
    const { token: customerToken } = await createCustomerSession(IDENTITY);
    expect(await verifyAdminSessionToken(customerToken)).toBeNull();
  });

  it('rejects a customer-shaped payload signed with the admin key', async () => {
    const forged = await signToken(
      {
        cid: 42,
        email: 'shopper@example.com',
        name: 'Ada',
        role: 'customer',
        iat: Date.now(),
        exp: Date.now() + 60_000,
      },
      ADMIN_SECRET
    );

    expect(await verifyCustomerSessionToken(forged)).toBeNull();
  });

  it('expires on its own, and stays valid right up to that moment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { token, payload } = await createCustomerSession(IDENTITY);

    vi.setSystemTime(new Date(payload.exp - 1));
    expect(await verifyCustomerSessionToken(token)).not.toBeNull();

    vi.setSystemTime(new Date(payload.exp + 1));
    expect(await verifyCustomerSessionToken(token)).toBeNull();
  });

  it('treats a placeholder secret as unconfigured, so nothing can be forged', async () => {
    process.env.CUSTOMER_SESSION_SECRET = 'too-short';

    expect(customerSessionSecret()).toBeNull();
    expect(isCustomerAuthConfigured()).toBe(false);
    await expect(createCustomerSession(IDENTITY)).rejects.toThrow(/CUSTOMER_SESSION_SECRET/);

    // A token signed with the placeholder is not accepted either.
    const placeholderToken = await signToken(
      { cid: 1, email: '', name: '', role: 'customer', iat: 0, exp: Date.now() + 60_000 },
      'too-short'
    );
    expect(await verifyCustomerSessionToken(placeholderToken)).toBeNull();
  });

  it('refuses to mint a session without a real WooCommerce customer id', async () => {
    await expect(createCustomerSession({ ...IDENTITY, customerId: 0 })).rejects.toThrow(
      /real WooCommerce customer id/
    );
    await expect(createCustomerSession({ ...IDENTITY, customerId: Number.NaN })).rejects.toThrow(
      /real WooCommerce customer id/
    );
  });

  it('clamps the configured lifetime and defaults to 30 days', () => {
    delete process.env.CUSTOMER_SESSION_TTL_HOURS;
    expect(customerSessionTtlMs()).toBe(24 * 30 * 3_600_000);

    process.env.CUSTOMER_SESSION_TTL_HOURS = '2';
    expect(customerSessionTtlMs()).toBe(2 * 3_600_000);

    // Nonsense (zero, negative, absurd) falls back rather than issuing a session
    // that expires immediately or never.
    process.env.CUSTOMER_SESSION_TTL_HOURS = '0';
    expect(customerSessionTtlMs()).toBe(24 * 30 * 3_600_000);
    process.env.CUSTOMER_SESSION_TTL_HOURS = '99999';
    expect(customerSessionTtlMs()).toBe(24 * 30 * 3_600_000);
  });
});
