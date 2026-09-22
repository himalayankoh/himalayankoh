import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The payment transition, at its two sharp edges.
 *
 * These are the rules that keep one payment from becoming two: the order is found
 * from the payment's own metadata, and a replayed success event changes nothing.
 * The WooCommerce client and the cart/email side effects are mocked because that is
 * the boundary — what is under test is the decision, not the HTTP.
 */

const state = {
  paid: false,
  order: {
    id: 512,
    status: 'pending',
    date_paid_gmt: null as string | null,
    meta_data: [{ key: '_hk_cart_token', value: 'cart-abc' }],
  } as Record<string, unknown>,
  markPaidCalls: 0,
  clearedCarts: [] as (string | null)[],
  notificationCalls: 0,
  updateStatusCalls: [] as unknown[],
};

vi.mock('@/lib/woo/orders', () => ({
  HK_META: {
    cartToken: '_hk_cart_token',
    paymentStatus: '_hk_payment_status',
    paymentIntent: '_hk_payment_intent',
  },
  WooOrderError: class WooOrderError extends Error {
    readonly status: number;
    constructor(message: string, status = 502) {
      super(message);
      this.status = status;
    }
  },
  getWooOrder: async () => ({ ...state.order }),
  markWooOrderPaid: async (_id: number, input: { paymentIntentId?: string }) => {
    state.markPaidCalls += 1;
    state.paid = true;
    state.order.date_paid_gmt = '2026-09-01T00:00:00Z';
    state.order.meta_data = [
      { key: '_hk_cart_token', value: 'cart-abc' },
      { key: '_hk_payment_status', value: 'paid' },
      { key: '_hk_payment_intent', value: input.paymentIntentId },
    ];
    return { ...state.order };
  },
  updateWooOrderStatus: async (_id: number, input: unknown) => {
    state.updateStatusCalls.push(input);
    return { ...state.order };
  },
  paymentStatusFromWoo: (order: { date_paid_gmt?: string | null; meta_data?: Array<{ key: string; value: unknown }> }) => {
    const meta = (order.meta_data ?? []).find((entry) => entry.key === '_hk_payment_status');
    if (meta?.value) return meta.value;
    if (order.date_paid_gmt) return 'paid';
    return 'pending';
  },
  readWooOrderMeta: (order: { meta_data?: Array<{ key: string; value: unknown }> }, key: string) => {
    const meta = (order.meta_data ?? []).find((entry) => entry.key === key);
    const value = meta?.value;
    return value === undefined || value === null ? null : String(value);
  },
}));

vi.mock('@/lib/orders/serverCreateOrder', () => ({
  clearReservedCart: async (token: string | null) => {
    state.clearedCarts.push(token);
  },
}));

vi.mock('@/lib/orders/notifyOrderEvents', () => ({
  dispatchPaymentReceivedNotifications: () => {
    state.notificationCalls += 1;
  },
}));

import {
  finalizeWooOrderPayment,
  markWooOrderPaymentFailed,
  resolveStripePaymentMethodLabel,
  shouldFinalizeSuccessfulPayment,
  wooOrderIdFromMetadata,
} from './updateOrderPayment';

describe('wooOrderIdFromMetadata', () => {
  it('reads the store order id Stripe carries', () => {
    expect(wooOrderIdFromMetadata({ woo_order_id: '512' })).toBe(512);
  });

  it('refuses anything that is not a positive integer', () => {
    expect(wooOrderIdFromMetadata({ woo_order_id: 'abc' })).toBeNull();
    expect(wooOrderIdFromMetadata({ woo_order_id: '0' })).toBeNull();
    expect(wooOrderIdFromMetadata({ woo_order_id: '-3' })).toBeNull();
    expect(wooOrderIdFromMetadata({})).toBeNull();
    expect(wooOrderIdFromMetadata(undefined)).toBeNull();
  });
});

describe('shouldFinalizeSuccessfulPayment', () => {
  it('is true only for the signed success event', () => {
    expect(shouldFinalizeSuccessfulPayment('payment_intent.succeeded')).toBe(true);
    expect(shouldFinalizeSuccessfulPayment('payment_intent.payment_failed')).toBe(false);
    expect(shouldFinalizeSuccessfulPayment('charge.succeeded')).toBe(false);
  });
});

describe('resolveStripePaymentMethodLabel', () => {
  it('names BNPL methods rather than calling them cards', () => {
    expect(resolveStripePaymentMethodLabel(['klarna'])).toBe('stripe_klarna');
    expect(resolveStripePaymentMethodLabel(['card'])).toBe('stripe_card');
    expect(resolveStripePaymentMethodLabel([])).toBe('stripe_card');
  });
});

describe('finalizeWooOrderPayment', () => {
  beforeEach(() => {
    state.paid = false;
    state.markPaidCalls = 0;
    state.clearedCarts = [];
    state.notificationCalls = 0;
    state.order.date_paid_gmt = null;
    state.order.meta_data = [{ key: '_hk_cart_token', value: 'cart-abc' }];
  });

  it('marks the order paid, empties the cart it was placed from, and alerts the store', async () => {
    const result = await finalizeWooOrderPayment(512, 'pi_test_1');

    expect(result.alreadyPaid).toBe(false);
    expect(state.markPaidCalls).toBe(1);
    expect(state.clearedCarts).toEqual(['cart-abc']);
    expect(state.notificationCalls).toBe(1);
  });

  it('is a no-op for a replayed success event', async () => {
    await finalizeWooOrderPayment(512, 'pi_test_1');
    state.clearedCarts = [];
    state.notificationCalls = 0;

    const replay = await finalizeWooOrderPayment(512, 'pi_test_1');

    // Stripe retries by design; a retry must not re-empty a cart the customer may
    // have refilled, nor send a second confirmation.
    expect(replay.alreadyPaid).toBe(true);
    expect(state.markPaidCalls).toBe(1);
    expect(state.clearedCarts).toEqual([]);
    expect(state.notificationCalls).toBe(0);
  });
});

describe('markWooOrderPaymentFailed', () => {
  beforeEach(() => {
    state.paid = false;
    state.updateStatusCalls = [];
    state.order.date_paid_gmt = null;
    state.order.meta_data = [{ key: '_hk_cart_token', value: 'cart-abc' }];
  });

  it('stays pending so the shopper can pay the reserved order again', async () => {
    await markWooOrderPaymentFailed(512);

    expect(state.updateStatusCalls).toEqual([{ status: 'pending', paymentStatus: 'failed' }]);
  });

  it('never demotes a paid order to failed', async () => {
    state.order.date_paid_gmt = '2026-09-01T00:00:00Z';

    await markWooOrderPaymentFailed(512);

    expect(state.updateStatusCalls).toEqual([]);
  });
});
