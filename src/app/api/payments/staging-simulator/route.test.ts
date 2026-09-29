import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the simulator endpoint permits, and what it hands upstream.
 *
 * The gate is mocked here so the *refusal* can be pinned from either side: the
 * origin decision itself is unit-tested in `lib/payments/stagingSimulator.test.ts`,
 * and these tests cover the route's behaviour once the answer is "no" — a `403`, and
 * not one call to the order writer. That is the difference between hiding a form and
 * refusing a hand-written request.
 *
 * The other half is the order path: a simulated success must return the store's own
 * order and its `stg_test_pay_…` reference, a decline must be a `402` that leaves the
 * cart and the order alone, and no card number may appear in anything the route sends
 * or returns.
 */

const state = {
  available: true,
  reason: null as string | null,
  cartItems: [{ id: 1, quantity: 1 }] as unknown[],
  reservedReused: false,
  rateAllowed: true,
  alreadyPaid: false,
};

const calls = {
  reserved: [] as Array<Record<string, unknown>>,
  completed: [] as number[],
  declined: [] as number[],
};

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => ({ allowed: state.rateAllowed }) }));
vi.mock('@/lib/cart/cookies', () => ({ readCartSession: async () => ({ cartToken: 'tok_1' }) }));
vi.mock('@/lib/auth/customerRequest', () => ({ optionalCustomerRequest: async () => null }));

vi.mock('@/lib/payments/server/stagingSimulatorGate', () => ({
  readStagingSimulatorStatus: async () => ({
    available: state.available,
    enabled: state.available,
    source: 'default',
    reason: state.reason,
  }),
}));

vi.mock('@/lib/payments/server/stagingSimulatorPayment', () => ({
  completeStagingSimulatorPayment: async (orderId: number) => {
    calls.completed.push(orderId);
    return {
      alreadyPaid: state.alreadyPaid,
      transactionRef: `stg_test_pay_${orderId}`,
      order: {
        id: orderId,
        number: '512',
        status: 'processing',
        total: '99.90',
        currency: 'USD',
        payment_method: 'staging_test_card',
        meta_data: [{ key: '_hk_payment_status', value: 'paid' }],
      },
    };
  },
  declineStagingSimulatorPayment: async (orderId: number) => {
    calls.declined.push(orderId);
  },
}));

vi.mock('@/lib/woo/orders', () => ({
  orderWithItemsFromWoo: (order: Record<string, unknown>) => ({ ...order, order_items: [] }),
}));

vi.mock('@/lib/orders/serverCreateOrder', () => ({
  loadCartForCheckout: async () => (state.cartItems.length ? { cart_items: state.cartItems } : null),
  reserveOrderForCheckout: async (data: Record<string, unknown>, options: Record<string, unknown>) => {
    calls.reserved.push({ data, options });
    return {
      raw: { id: 512 },
      order: { id: '512', order_number: '512', total: 99.9 },
      reused: state.reservedReused,
      cartToken: 'tok_1',
    };
  },
}));

import { POST } from './route';

const shippingAddress = {
  fullName: 'STAGING PAYMENT TEST',
  addressLine1: '1 Test Way',
  city: 'Houston',
  state: 'TX',
  postalCode: '77065',
  country: 'United States',
};

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    email: 'staging-payment-test@himalayankoh.com',
    shippingAddress,
    shippingMethod: 'standard',
    outcome: 'success',
    ...overrides,
  });
}

function request(payload = body(), headers: Record<string, string> = { host: 'preview.himalayankoh.com' }) {
  return new Request('https://preview.himalayankoh.com/api/payments/staging-simulator', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

describe('POST /api/payments/staging-simulator', () => {
  beforeEach(() => {
    state.available = true;
    state.reason = null;
    state.cartItems = [{ id: 1, quantity: 1 }];
    state.reservedReused = false;
    state.rateAllowed = true;
    state.alreadyPaid = false;
    calls.reserved = [];
    calls.completed = [];
    calls.declined = [];
  });

  it('refuses on a deployment the gate rejects, before touching the order writer', async () => {
    // The production case: the gate says no, and the answer must be a refusal rather
    // than a quietly-empty success — a caller that tried to simulate a production
    // payment is told it is forbidden.
    state.available = false;
    state.reason = 'Staging Payment Simulator is disabled on the production store (https://himalayankoh.com).';

    const response = await POST(request(body(), { host: 'himalayankoh.com' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'staging_simulator_forbidden' });
    expect(calls.reserved).toEqual([]);
    expect(calls.completed).toEqual([]);
  });

  it('names why it refused', async () => {
    state.available = false;
    state.reason = 'Staging Payment Simulator is switched off for this deployment.';

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain('switched off');
  });

  it('rate limits', async () => {
    state.rateAllowed = false;

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(calls.reserved).toEqual([]);
  });

  it('rejects an outcome that is neither success nor decline', async () => {
    const response = await POST(request(body({ outcome: 'refund' })));

    expect(response.status).toBe(400);
    expect(calls.reserved).toEqual([]);
  });

  it('rejects an incomplete checkout', async () => {
    const noEmail = await POST(request(body({ email: 'not-an-email' })));
    const noAddress = await POST(request(body({ shippingAddress: { fullName: 'QA' } })));

    expect(noEmail.status).toBe(400);
    expect(noAddress.status).toBe(400);
    expect(calls.reserved).toEqual([]);
  });

  it('refuses an empty cart', async () => {
    state.cartItems = [];

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(calls.reserved).toEqual([]);
  });

  it('reserves the order with the simulator label before any payment outcome', async () => {
    await POST(request(body({ outcome: 'decline' })));

    expect(calls.reserved).toHaveLength(1);
    expect(calls.reserved[0].options).toMatchObject({
      paymentMethod: 'staging_test_card',
      paymentMethodTitle: 'Staging Test Card',
      cartToken: 'tok_1',
    });
    expect(calls.reserved[0].data).toMatchObject({
      paymentProvider: 'staging_simulator',
      paymentMethod: 'staging_test_card',
      paymentStatus: 'pending',
    });
  });

  it('completes a successful simulation and returns the order the store recorded', async () => {
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(calls.completed).toEqual([512]);
    expect(calls.declined).toEqual([]);
    expect(payload).toMatchObject({
      declined: false,
      stagingOnly: true,
      orderId: '512',
      paymentMethod: 'staging_test_card',
      paymentMethodTitle: 'Staging Test Card',
      transactionRef: 'stg_test_pay_512',
    });
    expect(payload.order).toMatchObject({ payment_method: 'staging_test_card', status: 'processing' });
    expect(payload.order.order_items).toEqual([]);
  });

  it('reports a decline as a 402 that never pays and never reaches the paid path', async () => {
    const response = await POST(request(body({ outcome: 'decline' })));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.declined).toBe(true);
    expect(payload.message).toContain('declined');
    expect(calls.declined).toEqual([512]);
    expect(calls.completed).toEqual([]);
  });

  it('reuses the reserved order on a retry, so one cart cannot become two orders or two references', async () => {
    state.reservedReused = true;

    const first = await (await POST(request())).json();
    const second = await (await POST(request())).json();

    // Two attempts, the same order, the same reference: the transaction is a function
    // of the order, so a double submit records one payment rather than two.
    expect(first.orderId).toBe(second.orderId);
    expect(first.transactionRef).toBe(second.transactionRef);
  });

  it('passes no card data upstream and returns none', async () => {
    // A hostile client sends card fields anyway. They are not inputs to anything: the
    // simulator classifies the test card in the browser and posts only the outcome.
    const response = await POST(
      request(body({ cardNumber: '4242 4242 4242 4242', cvc: '123', expiry: '12/34', card: '4242424242424242' })),
    );
    const serialized = JSON.stringify({ upstream: calls.reserved, response: await response.json() });

    expect(serialized).not.toContain('4242');
    expect(serialized).not.toContain('4242424242424242');
    // Nothing shaped like a card number, in any field.
    expect(serialized).not.toMatch(/\d{4}[\s-]?\d{4}[\s-]?\d{4}/);
  });
});
