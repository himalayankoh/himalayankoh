import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
  process.env.NEXT_PUBLIC_DATA_SOURCE = 'woocommerce';
});

/**
 * The cart is faked at its own boundary, so the reservation logic — which cart it
 * reads, what it writes — runs for real against a stubbed WordPress.
 */
vi.mock('@/lib/woo/storeCart', () => ({
  readStoreCart: async () => ({ cart: { token: 'cart-abc' } }),
  mapStoreCart: () => ({
    items: [
      { key: 'line-1', productId: '3001', quantity: 2, unitPrice: 25, name: 'Salt Block', image: null },
    ],
  }),
  clearStoreCart: async () => undefined,
}));

// Shippo off, so shipping is the honest flat-rate fallback rather than a network call.
vi.mock('@/lib/shippo/config', () => ({
  resolveShippoConfigError: async () => 'Shippo is not configured in this test.',
}));

import { reserveOrderForCheckout } from './serverCreateOrder';
import { ORDERS_PAUSED_MESSAGE } from '@/lib/storefront/ordering';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]) {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

const orderData = {
  email: 'buyer@example.com',
  shippingAddress: {
    fullName: 'Test Buyer',
    addressLine1: '1 Test Street',
    city: 'Houston',
    state: 'TX',
    postalCode: '77001',
    country: 'US',
  },
  paymentProvider: 'stripe',
  paymentMethod: 'stripe_card',
  paymentStatus: 'pending',
} as never;

/** The shape WooCommerce reports back for a created order. */
const createdOrder = {
  id: 9001,
  number: '9001',
  status: 'pending',
  currency: 'USD',
  total: '50.00',
  billing: { email: 'buyer@example.com' },
  line_items: [{ id: 1, product_id: 3001, quantity: 2, total: '50.00' }],
  meta_data: [],
};

beforeEach(() => {
  vi.stubEnv('STOREFRONT_ORDERS_PAUSED', 'false');
  globalThis.fetch = realFetch;
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
});

describe('reserveOrderForCheckout', () => {
  it('refuses paused reservations before any WordPress request', async () => {
    vi.stubEnv('STOREFRONT_ORDERS_PAUSED', 'true');
    const stub = useWordPress([]);

    await expect(reserveOrderForCheckout(orderData, { customerId: 41, cartToken: 'cart-abc' }))
      .rejects.toThrow(ORDERS_PAUSED_MESSAGE);
    expect(stub.callsTo('/wc/v3/orders', 'GET')).toHaveLength(0);
    expect(stub.callsTo('/wc/v3/orders', 'POST')).toHaveLength(0);
  });

  it('creates the store order once, carrying the cart fingerprint and the session customer', async () => {
    const stub = useWordPress([
      { path: '/wc/v3/orders', method: 'GET', body: [] },
      { path: '/wc/v3/orders', method: 'POST', body: createdOrder },
    ]);

    const reserved = await reserveOrderForCheckout(orderData, { customerId: 41, cartToken: 'cart-abc' });

    expect(reserved.reused).toBe(false);
    expect(reserved.order.id).toBe('9001');

    const write = stub.callsTo('/wc/v3/orders', 'POST')[0];
    const body = write.body as { customer_id: number; meta_data: Array<{ key: string; value: string }> };
    // The store's own customer record, so the order appears under the customer in
    // WooCommerce's admin — not only in this app's meta.
    expect(body.customer_id).toBe(41);
    const meta = Object.fromEntries(body.meta_data.map((entry) => [entry.key, entry.value]));
    expect(meta._hk_cart_fingerprint).toBe('3001::2');
    expect(meta._hk_cart_token).toBe('cart-abc');
    expect(meta._hk_user_id).toBe('41');
  });

  it('reuses the pending order a previous attempt reserved for the same cart', async () => {
    const stub = useWordPress([
      {
        path: '/wc/v3/orders',
        method: 'GET',
        body: [
          {
            ...createdOrder,
            id: 9000,
            meta_data: [{ key: '_hk_cart_fingerprint', value: '3001::2' }],
            billing: { email: 'buyer@example.com' },
            customer_id: 41,
          },
        ],
      },
    ]);

    const reserved = await reserveOrderForCheckout(orderData, { customerId: 41, cartToken: 'cart-abc' });

    // A double-click, a retry or a refreshed browser must land on the order the
    // first attempt created rather than a second one.
    expect(reserved.reused).toBe(true);
    expect(reserved.order.id).toBe('9000');
    expect(stub.callsTo('/wc/v3/orders', 'POST')).toHaveLength(0);
  });

  it('does not reuse a pending order reserved for somebody else', async () => {
    const stub = useWordPress([
      {
        path: '/wc/v3/orders',
        method: 'GET',
        body: [
          {
            ...createdOrder,
            id: 9000,
            customer_id: 99,
            billing: { email: 'other@example.com' },
            meta_data: [{ key: '_hk_cart_fingerprint', value: '3001::2' }],
          },
        ],
      },
      { path: '/wc/v3/orders', method: 'POST', body: createdOrder },
    ]);

    const reserved = await reserveOrderForCheckout(orderData, { customerId: 41, cartToken: 'cart-abc' });

    expect(reserved.reused).toBe(false);
    expect(stub.callsTo('/wc/v3/orders', 'POST')).toHaveLength(1);
  });
});
