import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDERS_PAUSED_MESSAGE } from '@/lib/storefront/ordering';

/**
 * What the PaymentIntent route is allowed to charge.
 *
 * Automated/mock tests with a fake Stripe client: nothing reaches the Stripe API.
 * The claim under test is the security-relevant one — the amount is read from the
 * order **WooCommerce saved**, and a price the browser sends is not an input to
 * money at all. The pricing helper (`checkoutTotalsFromWoo`) is deliberately left
 * real so the assertion covers the actual arithmetic, not a stub of it.
 *
 * The second claim is idempotency: a refresh or a second click must land on the
 * intent the order already carries rather than minting a second one that could also
 * be confirmed.
 */

const state = {
  configReads: 0,
  cartReads: 0,
  reservations: 0,
  cartItems: [{ id: 1, quantity: 1 }] as unknown[],
  recordedIntentId: null as string | null,
  recordedIntentStatus: 'requires_payment_method',
  order: {
    id: 512,
    total: '99.90',
    currency: 'USD',
    discount_total: '0.00',
    shipping_total: '0.00',
    total_tax: '0.00',
    line_items: [{ quantity: 2, price: '49.95', subtotal: '99.90', total: '99.90' }],
  } as Record<string, unknown>,
};

const stripeCalls = {
  create: [] as Array<Record<string, unknown>>,
  createOptions: [] as Array<Record<string, unknown>>,
  retrieve: [] as string[],
};

vi.mock('@/lib/stripe/server/stripe', () => ({
  stripeConfigError: async () => { state.configReads++; return null; },
  getStripeMode: async () => 'test',
  getStripeClient: async () => ({
    paymentIntents: {
      create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
        stripeCalls.create.push(params);
        stripeCalls.createOptions.push(options);
        return {
          id: 'pi_new',
          client_secret: 'cs_new',
          amount: params.amount,
          currency: params.currency,
          status: 'requires_payment_method',
        };
      },
      retrieve: async (id: string) => {
        stripeCalls.retrieve.push(id);
        return {
          id,
          client_secret: `cs_${id}`,
          amount: 9990,
          currency: 'usd',
          status: state.recordedIntentStatus,
        };
      },
    },
  }),
}));

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/cart/cookies', () => ({ readCartSession: async () => ({ cartToken: 'tok_1' }) }));
vi.mock('@/lib/auth/customerRequest', () => ({ optionalCustomerRequest: async () => null }));

vi.mock('@/lib/orders/serverCreateOrder', () => ({
  cartFingerprint: () => 'fp_1',
  loadCartForCheckout: async () => { state.cartReads++; return { cart_items: state.cartItems }; },
  validateCheckoutCartItems: () => undefined,
  reserveOrderForCheckout: async () => { state.reservations++; return { raw: { ...state.order } }; },
}));

vi.mock('@/lib/woo/orders', () => ({
  HK_META: { paymentIntent: '_hk_payment_intent' },
  readWooOrderMeta: () => state.recordedIntentId,
  setWooOrderPaymentIntent: async () => undefined,
}));

import { POST } from './route';

const shippingAddress = {
  fullName: 'QA Buyer',
  addressLine1: '1 Test Way',
  city: 'Houston',
  state: 'TX',
  postalCode: '77065',
  country: 'United States',
};

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    email: 'qa@example.com',
    shippingAddress,
    shippingMethod: 'standard',
    ...overrides,
  });
}

function request(payload = body()) {
  return new Request('https://preview.himalayankoh.com/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
}

describe('POST /api/stripe/create-payment-intent', () => {
  beforeEach(() => {
    vi.stubEnv('STOREFRONT_ORDERS_PAUSED', 'false');
    state.configReads = 0;
    state.cartReads = 0;
    state.reservations = 0;
    state.cartItems = [{ id: 1, quantity: 1 }];
    state.recordedIntentId = null;
    state.recordedIntentStatus = 'requires_payment_method';
    state.order = {
      id: 512,
      total: '99.90',
      currency: 'USD',
      discount_total: '0.00',
      shipping_total: '0.00',
      total_tax: '0.00',
      line_items: [{ quantity: 2, price: '49.95', subtotal: '99.90', total: '99.90' }],
    };
    stripeCalls.create = [];
    stripeCalls.createOptions = [];
    stripeCalls.retrieve = [];
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([body(), '{'])('refuses paused ordering before payment configuration, cart reads or reservations', async (payload) => {
    vi.stubEnv('STOREFRONT_ORDERS_PAUSED', 'true');
    vi.stubEnv('STRIPE_ALLOW_LIVE', 'true');
    vi.stubEnv('STRIPE_TEST_MODE_ONLY', 'false');

    const response = await POST(request(payload));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: ORDERS_PAUSED_MESSAGE });
    expect(state.configReads).toBe(0);
    expect(state.cartReads).toBe(0);
    expect(state.reservations).toBe(0);
    expect(stripeCalls.create).toEqual([]);
    expect(stripeCalls.retrieve).toEqual([]);
  });

  it("charges the order total WooCommerce saved, not a total sent by the browser", async () => {
    // A hostile or buggy client sends its own price and even its own total. Neither
    // is an input to money: the amount comes from `checkoutTotalsFromWoo` over the
    // order the store just created.
    const response = await POST(
      request(body({ items: [{ id: 1, quantity: 1, price: 0.01 }], total: 1, amount: 1 })),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).amount).toBe(9990);
    expect(stripeCalls.create[0].amount).toBe(9990);
    expect(stripeCalls.create[0].currency).toBe('usd');
  });

  it('carries the Woo order id in the metadata the webhook resolves the order from', async () => {
    await POST(request());

    expect(stripeCalls.create[0].metadata).toMatchObject({ woo_order_id: '512' });
    expect(stripeCalls.create[0].automatic_payment_methods).toEqual({ enabled: true });
  });

  it('idempotency key is scoped to the order and cart so two first attempts collapse', async () => {
    await POST(request());

    expect(String(stripeCalls.createOptions[0].idempotencyKey)).toContain('hk-pi-512-fp_1-new');
  });

  it('reuses the intent the order already carries instead of creating a second one', async () => {
    state.recordedIntentId = 'pi_old';

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ paymentIntentId: 'pi_old', clientSecret: 'cs_pi_old' });
    // The whole point: a refresh must not produce a second confirmable intent.
    expect(stripeCalls.create).toEqual([]);
  });

  it('mints a fresh intent when the recorded one can no longer be paid', async () => {
    state.recordedIntentId = 'pi_old';
    state.recordedIntentStatus = 'canceled';

    await POST(request());

    expect(stripeCalls.retrieve).toEqual(['pi_old']);
    expect(stripeCalls.create).toHaveLength(1);
    // A distinct key, so Stripe does not replay the cancelled intent back to us.
    expect(String(stripeCalls.createOptions[0].idempotencyKey)).toContain('rpi_old');
  });

  it('refuses an empty cart', async () => {
    state.cartItems = [];

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(stripeCalls.create).toEqual([]);
  });

  it('refuses an order below the minimum charge amount', async () => {
    state.order = { ...state.order, total: '0.10' };

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(stripeCalls.create).toEqual([]);
  });

  it('rejects a body without a valid email or a complete address', async () => {
    const badEmail = await POST(request(body({ email: 'not-an-email' })));
    const badAddress = await POST(request(body({ shippingAddress: { fullName: 'QA' } })));

    expect(badEmail.status).toBe(400);
    expect(badAddress.status).toBe(400);
    expect(stripeCalls.create).toEqual([]);
  });
});
