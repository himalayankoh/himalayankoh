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

vi.mock('@/lib/auth/customerRequest', () => ({
  verifyCustomerRequest: async (request: Request) =>
    request.headers.get('authorization') === 'Bearer good'
      ? { ok: true, customer: { id: 41, email: 'shopper@example.com', name: 'Shopper' } }
      : { ok: false, status: 401, error: 'Sign in to your account to continue.' },
}));

import { DELETE, PATCH } from './route';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const storedRow = {
  id: 7,
  customer_id: 41,
  label: 'Home',
  full_name: 'Salman Bashir',
  phone: '',
  address_line1: '1 Salt Way',
  address_line2: '',
  city: 'Lahore',
  state: 'Punjab',
  postal_code: '54000',
  country: 'Pakistan',
  is_default_shipping: true,
  is_default_billing: false,
  created_at: '2026-09-01 10:00:00',
  updated_at: '2026-09-02 10:00:00',
};

/** The route's second argument, as Next hands it over. */
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(id: string, body: unknown, authorized = true): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/account/addresses/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(authorized ? { Authorization: 'Bearer good' } : {}),
      },
      body: JSON.stringify(body),
    }),
    context(id)
  );
}

function remove(id: string, authorized = true): Promise<Response> {
  return DELETE(
    new Request(`http://localhost/api/account/addresses/${id}`, {
      method: 'DELETE',
      headers: authorized ? { Authorization: 'Bearer good' } : {},
    }),
    context(id)
  );
}

describe('authorisation and shape', () => {
  it('refuses an unauthenticated update', async () => {
    const stub = useWordPress([]);

    expect((await patch('7', { label: 'Ranch' }, false)).status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('refuses an unauthenticated delete', async () => {
    const stub = useWordPress([]);

    expect((await remove('7', false)).status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('rejects an id that cannot be an address, without calling WordPress', async () => {
    const stub = useWordPress([]);

    expect((await patch('abc', { label: 'Ranch' })).status).toBe(400);
    expect((await remove('0')).status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it('rejects an empty update rather than reporting a save that changed nothing', async () => {
    const stub = useWordPress([]);

    const response = await patch('7', {});

    expect(response.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it('will not blank a required field on a saved address', async () => {
    const stub = useWordPress([]);

    const response = await patch('7', { city: '' });

    expect(response.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('PATCH sets the default for the signed-in account', () => {
  it('sends the default flag with the session customer id', async () => {
    const stub = useWordPress([
      {
        path: '/hk-storefront/v1/addresses/7',
        method: 'PATCH',
        body: { ok: true, address: storedRow },
      },
    ]);

    const response = await patch('7', { is_default_shipping: true });

    expect(response.status).toBe(200);
    const write = stub.callsTo('/hk-storefront/v1/addresses/7', 'PATCH')[0];
    expect(write.body).toEqual({ customerId: 41, is_default_shipping: true });
  });

  it('treats an address that is not on this account as not found', async () => {
    // The plugin scopes every statement to the customer, so another customer's id
    // answers the same way a nonexistent id does — which is what stops ids being
    // probed across accounts.
    useWordPress([
      {
        path: '/hk-storefront/v1/addresses/99',
        method: 'PATCH',
        status: 404,
        body: {
          code: 'hk_storefront_address_missing',
          message: 'That address is not saved on this account.',
        },
      },
    ]);

    const response = await patch('99', { label: 'Not mine' });

    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toMatch(/not saved on this account/i);
  });
});

describe('DELETE', () => {
  it('reports a deletion that happened', async () => {
    const stub = useWordPress([
      {
        path: '/hk-storefront/v1/addresses/7',
        method: 'DELETE',
        body: { ok: true, deleted: true },
      },
    ]);

    const response = await remove('7');
    const body = (await response.json()) as { deleted: boolean };

    expect(body.deleted).toBe(true);
    expect((stub.callsTo('/hk-storefront/v1/addresses/7', 'DELETE')[0].body as { customerId: number }).customerId).toBe(41);
  });

  it('reports a delete that removed nothing instead of claiming success', async () => {
    useWordPress([
      {
        path: '/hk-storefront/v1/addresses/7',
        method: 'DELETE',
        body: { ok: true, deleted: false },
      },
    ]);

    const body = (await (await remove('7')).json()) as { deleted: boolean };

    expect(body.deleted).toBe(false);
  });
});
