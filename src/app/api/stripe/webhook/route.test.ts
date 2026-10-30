import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The webhook route at its boundaries — the payment authority, exercised with a
 * mocked Stripe.
 *
 * These are automated/mock tests: no request leaves the process and nothing is
 * verified against the real Stripe API. What they pin is the route's *decisions*,
 * which are the parts that go wrong silently in production:
 *
 *   - an unsigned or badly signed body is refused before it is read;
 *   - a live delivery arriving at a deployment that may not take live payments is
 *     acknowledged (so Stripe stops retrying) but **not applied**;
 *   - a success event marks the order named in the PaymentIntent metadata paid,
 *     labelled by the method the customer actually chose;
 *   - a captured amount that does not cover the order is acknowledged but left
 *     unpaid, so money that does not settle the order never reads as revenue;
 *   - a store-side 4xx is acknowledged rather than looped by Stripe's retries.
 */

const state = {
  webhookSecret: 'whsec_test_000000000000' as string,
  signatureValid: true,
  livemode: false,
  applyAllowed: true,
  applyReason: '',
  event: null as unknown,
  finalizeCalls: [] as Array<{
    orderId: number;
    intentId: string;
    label: string;
    expected: { amount: number; currency: string } | undefined;
  }>,
  finalizeResult: { alreadyPaid: false, amountMismatch: false, order: null as unknown },
  finalizeThrows: null as Error | null,
  failedCalls: [] as number[],
};

vi.mock('@/lib/stripe/server/stripe', () => ({
  resolveStripeWebhookSecret: async () => state.webhookSecret,
  mayApplyPaymentsForMode: async () => ({ ok: state.applyAllowed, reason: state.applyReason }),
  getStripeSignatureVerifier: async () => ({
    webhooks: {
      constructEventAsync: async () => {
        if (!state.signatureValid) {
          throw new Error('No signatures found matching the expected signature for payload');
        }
        return state.event;
      },
    },
    paymentMethods: {
      retrieve: async (id: string) => ({ id, type: 'card' }),
    },
  }),
}));

vi.mock('@/lib/stripe/server/updateOrderPayment', () => ({
  shouldFinalizeSuccessfulPayment: (type: string) => type === 'payment_intent.succeeded',
  wooOrderIdFromMetadata: (metadata: unknown) => {
    const raw = (metadata as { woo_order_id?: unknown } | null)?.woo_order_id;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  },
  resolveStripePaymentMethodLabel: (types?: string[] | null, chosen?: string | null) => {
    const picked = chosen?.trim().toLowerCase();
    if (picked) return `stripe_${picked}`;
    const list = types || [];
    const first = list.find((t) => t && t !== 'card') ?? list[0];
    return first ? `stripe_${first}` : 'stripe_card';
  },
  finalizeWooOrderPayment: async (
    orderId: number,
    intentId: string,
    label: string,
    expected?: { amount: number; currency: string },
  ) => {
    if (state.finalizeThrows) throw state.finalizeThrows;
    state.finalizeCalls.push({ orderId, intentId, label, expected });
    return state.finalizeResult;
  },
  markWooOrderPaymentFailed: async (orderId: number) => {
    state.failedCalls.push(orderId);
  },
}));

vi.mock('@/lib/woo/orders', () => ({
  WooOrderError: class WooOrderError extends Error {
    readonly status: number;
    constructor(message: string, status = 502) {
      super(message);
      this.status = status;
    }
  },
}));

import { WooOrderError } from '@/lib/woo/orders';
import { POST } from './route';

function successEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    livemode: state.livemode,
    data: {
      object: {
        id: 'pi_1',
        metadata: { woo_order_id: '512' },
        amount: 9990,
        currency: 'usd',
        payment_method_types: ['card', 'klarna'],
        ...overrides,
      },
    },
  };
}

function request(signature: string | null, body = '{"id":"evt_1"}') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['stripe-signature'] = signature;
  return new Request('https://preview.himalayankoh.com/api/stripe/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    state.webhookSecret = 'whsec_test_000000000000';
    state.signatureValid = true;
    state.livemode = false;
    state.applyAllowed = true;
    state.applyReason = '';
    state.event = successEvent();
    state.finalizeCalls = [];
    state.finalizeResult = { alreadyPaid: false, amountMismatch: false, order: null };
    state.finalizeThrows = null;
    state.failedCalls = [];
  });

  it('refuses to work at all without a signing secret', async () => {
    state.webhookSecret = '';

    const response = await POST(request('t=1,v1=abc'));

    expect(response.status).toBe(503);
    expect(state.finalizeCalls).toEqual([]);
  });

  it('rejects a delivery with no signature header', async () => {
    const response = await POST(request(null));

    expect(response.status).toBe(400);
    expect(state.finalizeCalls).toEqual([]);
  });

  it('rejects a body whose signature does not verify, and does not touch the order', async () => {
    state.signatureValid = false;

    const response = await POST(request('t=1,v1=tampered'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Invalid webhook signature/);
    expect(state.finalizeCalls).toEqual([]);
  });

  it('acknowledges but does not apply a live delivery where live payments are not permitted', async () => {
    // A production webhook pointed at staging: real, correctly signed, and still
    // must not mark an order paid on a deployment that cannot take live money.
    state.livemode = true;
    state.applyAllowed = false;
    state.applyReason = 'This deployment is not the production origin.';

    const response = await POST(request('t=1,v1=ok'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true, applied: false });
    expect(body.reason).toMatch(/production origin/);
    expect(state.finalizeCalls).toEqual([]);
  });

  it('marks the order named in the metadata paid, using the Woo order id', async () => {
    const response = await POST(request('t=1,v1=ok'));

    expect(response.status).toBe(200);
    expect(state.finalizeCalls).toHaveLength(1);
    expect(state.finalizeCalls[0]).toMatchObject({
      orderId: 512,
      intentId: 'pi_1',
      expected: { amount: 9990, currency: 'usd' },
    });
  });

  it('labels the order by the method the customer actually chose, not by the eligible list', async () => {
    // `payment_method_types` says Klarna was *available*; the chosen method object
    // says the customer picked Klarna. A card-only label here is how a BNPL order
    // ends up misreported in Sales.
    state.event = successEvent({ payment_method: { id: 'pm_1', type: 'klarna' } });

    await POST(request('t=1,v1=ok'));

    expect(state.finalizeCalls[0].label).toBe('stripe_klarna');
  });

  it('resolves the chosen method when Stripe sends only an id', async () => {
    state.event = successEvent({ payment_method: 'pm_1' });

    await POST(request('t=1,v1=ok'));

    expect(state.finalizeCalls[0].label).toBe('stripe_card');
  });

  it('ignores a success event that names no order it can resolve', async () => {
    state.event = successEvent({ metadata: {} });

    const response = await POST(request('t=1,v1=ok'));

    expect(response.status).toBe(200);
    expect(state.finalizeCalls).toEqual([]);
  });

  it('acknowledges but does not mark paid when the captured amount does not cover the order', async () => {
    state.finalizeResult = { alreadyPaid: false, amountMismatch: true, order: null };

    const response = await POST(request('t=1,v1=ok'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true, applied: false, reason: 'amount_mismatch' });
  });

  it('records a failed payment against the order without demoting it', async () => {
    state.event = {
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      livemode: false,
      data: { object: { id: 'pi_1', metadata: { woo_order_id: '512' } } },
    };

    const response = await POST(request('t=1,v1=ok'));

    expect(response.status).toBe(200);
    expect(state.failedCalls).toEqual([512]);
    expect(state.finalizeCalls).toEqual([]);
  });

  it('acknowledges a store-side 4xx instead of asking Stripe to retry forever', async () => {
    state.finalizeThrows = new WooOrderError('Order not found', 404);

    const response = await POST(request('t=1,v1=ok'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, applied: false });
  });

  it('asks Stripe to retry a store-side 5xx', async () => {
    state.finalizeThrows = new WooOrderError('WooCommerce is unreachable', 503);

    const response = await POST(request('t=1,v1=ok'));

    expect(response.status).toBe(500);
  });
});
