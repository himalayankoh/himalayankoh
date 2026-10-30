/**
 * The session route is where the console's role comes from, so it is worth a
 * request-level test rather than a source scan: everything downstream (route
 * guards, the admin shell, the redirect off `/login`) reads this answer.
 *
 * The property being pinned is separation — a customer token must never be
 * answered as an administrator, and a token this server did not sign must not be
 * answered at all. Neither of those is visible from the token module's own tests,
 * which is why they are exercised through the route.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminSession } from '@/lib/auth/adminSession';
import { createCustomerSession } from '@/lib/auth/customerSession';
import { GET } from './route';

const ADMIN_SECRET = 'test-admin-secret-long-enough-1234';
const CUSTOMER_SECRET = 'test-customer-secret-long-enough-1234';

const originalAdmin = process.env.ADMIN_SESSION_SECRET;
const originalCustomer = process.env.CUSTOMER_SESSION_SECRET;

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET;
  process.env.CUSTOMER_SESSION_SECRET = CUSTOMER_SECRET;
});

afterEach(() => {
  if (originalAdmin === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalAdmin;
  if (originalCustomer === undefined) delete process.env.CUSTOMER_SESSION_SECRET;
  else process.env.CUSTOMER_SESSION_SECRET = originalCustomer;
});

const request = (authorization?: string) =>
  new Request('https://himalayankoh.test/api/auth/session', {
    headers: authorization === undefined ? undefined : { authorization },
  });

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('GET /api/auth/session', () => {
  it('answers an admin token with the role the server signed', async () => {
    const { token } = await createAdminSession({
      id: '7',
      username: 'salman',
      email: 'owner@himalayankoh.test',
      name: 'The Owner',
    });

    const payload = await body(await GET(request(`Bearer ${token}`)));

    expect(payload.authenticated).toBe(true);
    expect(payload.role).toBe('admin');
    expect(payload.user).toMatchObject({
      id: '7',
      email: 'owner@himalayankoh.test',
      name: 'The Owner',
      username: 'salman',
    });
  });

  it('answers a customer token with role customer, never admin', async () => {
    const { token } = await createCustomerSession({
      customerId: 42,
      email: 'shopper@example.test',
      name: 'A Shopper',
    });

    const payload = await body(await GET(request(`Bearer ${token}`)));

    expect(payload.authenticated).toBe(true);
    expect(payload.role).toBe('customer');
    expect((payload.user as Record<string, unknown>).id).toBe('42');
    // The separation the whole design rests on: a shopper's token cannot be read as
    // an administrator, whatever identity it carries.
    expect(payload.role).not.toBe('admin');
  });

  it('refuses a token signed with the wrong secret', async () => {
    const { token } = await createAdminSession({
      id: '7',
      username: 'salman',
      email: 'owner@himalayankoh.test',
      name: 'The Owner',
    });
    const [tokenBody, signature] = token.split('.');
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

    const payload = await body(await GET(request(`Bearer ${tokenBody}.${flipped}`)));

    expect(payload).toEqual({ authenticated: false, role: null, user: null });
  });

  it('answers anonymous callers without failing them', async () => {
    for (const authorization of [undefined, 'Bearer ', 'Basic abc', 'Bearer nonsense']) {
      const response = await GET(request(authorization));
      expect(response.status).toBe(200);
      expect(await body(response)).toEqual({ authenticated: false, role: null, user: null });
    }
  });

  it('fails closed when no signing key is configured', async () => {
    const { token } = await createAdminSession({
      id: '7',
      username: 'salman',
      email: 'owner@himalayankoh.test',
      name: 'The Owner',
    });
    delete process.env.ADMIN_SESSION_SECRET;

    expect(await body(await GET(request(`Bearer ${token}`)))).toEqual({
      authenticated: false,
      role: null,
      user: null,
    });
  });

  it('is never cached, and never echoes a signing secret', async () => {
    const { token } = await createAdminSession({
      id: '7',
      username: 'salman',
      email: 'owner@himalayankoh.test',
      name: 'The Owner',
    });

    const response = await GET(request(`Bearer ${token}`));
    expect(response.headers.get('cache-control')).toBe('no-store');
    // A per-request identity served from a shared cache would hand one caller
    // another caller's role.
    expect(JSON.stringify(await body(response))).not.toContain(ADMIN_SECRET);
  });
});
