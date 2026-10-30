import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
});

/**
 * The session is mocked so these tests are about the route's own rule: whoever the
 * session says the caller is, that is the only customer the plugin is asked about.
 * The WordPress client underneath is the real one, against a stubbed `fetch`.
 */
vi.mock('@/lib/auth/customerRequest', () => ({
  verifyCustomerRequest: async (request: Request) =>
    request.headers.get('authorization') === 'Bearer good'
      ? { ok: true, customer: { id: 41, email: 'shopper@example.com', name: 'Shopper' } }
      : { ok: false, status: 401, error: 'Sign in to your account to continue.' },
}));

import { GET, POST } from './route';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function listRequest(authorized = true): Request {
  return new Request('http://localhost/api/account/addresses', {
    headers: authorized ? { Authorization: 'Bearer good' } : {},
  });
}

function createRequest(body: unknown, authorized = true): Request {
  return new Request('http://localhost/api/account/addresses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorized ? { Authorization: 'Bearer good' } : {}),
    },
    body: JSON.stringify(body),
  });
}

const storedRow = {
  id: 7,
  customer_id: 41,
  label: 'Home',
  full_name: 'Salman Bashir',
  phone: '555-0100',
  address_line1: '1 Salt Way',
  address_line2: '',
  city: 'Lahore',
  state: 'Punjab',
  postal_code: '54000',
  country: 'Pakistan',
  is_default_shipping: true,
  is_default_billing: false,
  created_at: '2026-09-01 10:00:00',
  updated_at: '2026-09-01 10:00:00',
};

const completeAddress = {
  label: 'Home',
  full_name: 'Salman Bashir',
  address_line1: '1 Salt Way',
  city: 'Lahore',
  state: 'Punjab',
  postal_code: '54000',
  country: 'Pakistan',
};

describe('authorisation', () => {
  it('refuses a list with no session and touches nothing on WordPress', async () => {
    const stub = useWordPress([]);

    const response = await GET(listRequest(false));

    expect(response.status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('refuses a save with no session and touches nothing on WordPress', async () => {
    const stub = useWordPress([]);

    const response = await POST(createRequest(completeAddress, false));

    expect(response.status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('asks about the session customer even when the body names another id', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/addresses', body: { items: [] } },
      {
        path: '/hk-storefront/v1/addresses',
        method: 'POST',
        body: { ok: true, address: storedRow },
      },
    ]);

    await POST(createRequest({ ...completeAddress, customerId: 999 }));

    // A customer id a browser can name is one a browser can forge; the id must come
    // from the session, which is the only reason these routes can be customer-facing
    // while the plugin's own routes stay administrator-only.
    const write = stub.callsTo('/hk-storefront/v1/addresses', 'POST')[0];
    expect((write.body as { customerId: number }).customerId).toBe(41);
  });
});

describe('GET /api/account/addresses', () => {
  it('returns the rows, resolving the plugin shape', async () => {
    useWordPress([
      { path: '/hk-storefront/v1/addresses', body: { items: [storedRow] } },
    ]);

    const response = await GET(listRequest());
    const body = (await response.json()) as { addresses: typeof storedRow[] };

    expect(response.status).toBe(200);
    expect(body.addresses).toHaveLength(1);
    expect(body.addresses[0]).toMatchObject({
      id: 7,
      full_name: 'Salman Bashir',
      is_default_shipping: true,
      // Not part of the row the browser renders: the owner is the session's.
      is_default_billing: false,
    });
  });

  it('drops a row the plugin reported without a usable id', async () => {
    useWordPress([
      {
        path: '/hk-storefront/v1/addresses',
        body: { items: [{ ...storedRow, id: 'not-a-number' }] },
      },
    ]);

    const body = (await (await GET(listRequest())).json()) as { addresses: unknown[] };

    expect(body.addresses).toEqual([]);
  });

  it('names the missing plugin instead of pretending the account has no addresses', async () => {
    // No route registered: the stub answers WordPress's own `rest_no_route`, which
    // is exactly what an inactive plugin looks like from here.
    useWordPress([]);

    const response = await GET(listRequest());
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/storefront plugin is not active/i);
  });
});

describe('POST /api/account/addresses', () => {
  it('saves a complete address and returns the stored row', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/addresses', method: 'GET', body: { items: [] } },
      {
        path: '/hk-storefront/v1/addresses',
        method: 'POST',
        body: { ok: true, address: storedRow },
      },
    ]);

    const response = await POST(createRequest({ ...completeAddress, phone: '555-0100' }));
    const body = (await response.json()) as { address: typeof storedRow };

    expect(response.status).toBe(201);
    expect(body.address.id).toBe(7);

    const write = stub.callsTo('/hk-storefront/v1/addresses', 'POST')[0];
    expect(write.body).toMatchObject({ ...completeAddress, phone: '555-0100', customerId: 41 });
  });

  it('refuses an incomplete address without calling WordPress', async () => {
    const stub = useWordPress([]);

    const response = await POST(createRequest({ ...completeAddress, city: '  ' }));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/name, street, city/i);
    expect(stub.calls).toHaveLength(0);
  });

  it('caps how many addresses one account may keep', async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ ...storedRow, id: index + 1 }));
    const stub = useWordPress([{ path: '/hk-storefront/v1/addresses', body: { items: many } }]);

    const response = await POST(createRequest(completeAddress));

    expect(response.status).toBe(409);
    // The cap is checked before the write, so nothing was stored.
    expect(stub.callsTo('/hk-storefront/v1/addresses', 'POST')).toHaveLength(0);
  });

  it('reports a plugin refusal verbatim rather than inventing one', async () => {
    useWordPress([
      { path: '/hk-storefront/v1/addresses', method: 'GET', body: { items: [] } },
      {
        path: '/hk-storefront/v1/addresses',
        method: 'POST',
        status: 400,
        body: {
          code: 'hk_storefront_address_incomplete',
          message: 'An address needs a name, street, city, state, postal code and country.',
        },
      },
    ]);

    const response = await POST(createRequest(completeAddress));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/name, street, city/i);
  });
});
