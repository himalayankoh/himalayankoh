import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a simulated payment does to the store's order.
 *
 * The claims under test are the ones that make the simulator safe to point at real
 * staging data: a success is the *same* paid transition the card webhook performs
 * (one `markWooOrderPaid`, one inventory-touching `set_paid`, no second record on a
 * replay), a decline never becomes revenue, and no email is dispatched for any of it.
 */

const state = {
  paymentStatus: 'pending' as 'pending' | 'paid' | 'failed',
  order: {
    id: 512,
    total: '99.90',
    currency: 'USD',
    status: 'pending',
    payment_method: 'staging_test_card',
    meta_data: [{ key: '_hk_cart_token', value: 'tok_1' }],
  } as Record<string, unknown>,
};

const calls = {
  paid: [] as Array<Record<string, unknown>>,
  notes: [] as string[],
  clearedCarts: [] as Array<string | null>,
  failed: [] as number[],
  notifications: 0,
};

vi.mock('@/lib/woo/orders', () => ({
  HK_META: { cartToken: '_hk_cart_token', paymentStatus: '_hk_payment_status' },
  getWooOrder: async () => ({ ...state.order }),
  paymentStatusFromWoo: () => state.paymentStatus,
  readWooOrderMeta: (order: Record<string, unknown>, key: string) => {
    const meta = (order.meta_data ?? []) as Array<{ key: string; value: unknown }>;
    const found = meta.find((entry) => entry.key === key);
    return found ? String(found.value) : null;
  },
  addWooOrderNote: async (_id: number, note: string) => {
    calls.notes.push(note);
  },
  markWooOrderPaid: async (id: number, input: Record<string, unknown>) => {
    calls.paid.push({ id, ...input });
    state.paymentStatus = 'paid';
    return { ...state.order, status: 'processing', date_paid_gmt: '2026-09-29T00:00:00' };
  },
}));

vi.mock('@/lib/orders/serverCreateOrder', () => ({
  clearReservedCart: async (token: string | null) => {
    calls.clearedCarts.push(token);
  },
}));

vi.mock('@/lib/stripe/server/updateOrderPayment', () => ({
  markWooOrderPaymentFailed: async (id: number) => {
    calls.failed.push(id);
    state.paymentStatus = 'failed';
  },
}));

// The simulator must not announce itself. If it ever imported this module, or the
// module dispatched for a simulated order, this counter would move.
vi.mock('@/lib/orders/notifyOrderEvents', () => ({
  dispatchPaymentReceivedNotifications: () => {
    calls.notifications += 1;
  },
  dispatchOrderCreatedNotifications: () => {
    calls.notifications += 1;
  },
}));

import {
  completeStagingSimulatorPayment,
  declineStagingSimulatorPayment,
} from './stagingSimulatorPayment';

describe('completeStagingSimulatorPayment', () => {
  beforeEach(() => {
    state.paymentStatus = 'pending';
    calls.paid = [];
    calls.notes = [];
    calls.clearedCarts = [];
    calls.failed = [];
    calls.notifications = 0;
  });

  it('moves the order to paid with the simulator label and its own reference', async () => {
    const result = await completeStagingSimulatorPayment(512);

    expect(calls.paid).toHaveLength(1);
    expect(calls.paid[0]).toMatchObject({
      id: 512,
      transactionId: 'stg_test_pay_512',
      paymentMethod: 'staging_test_card',
      paymentMethodTitle: 'Staging Test Card',
    });
    // No PaymentIntent is invented: a fake one written to `_hk_payment_intent` would
    // be read back by the card checkout's reuse path as though Stripe issued it.
    expect(calls.paid[0].paymentIntentId).toBeUndefined();
    expect(result.alreadyPaid).toBe(false);
    expect(result.transactionRef).toBe('stg_test_pay_512');
  });

  it('tags the order do-not-fulfil and empties the cart only after the payment', async () => {
    await completeStagingSimulatorPayment(512);

    expect(calls.notes).toHaveLength(1);
    expect(calls.notes[0]).toContain('DO NOT FULFILL');
    expect(calls.notes[0]).toContain('stg_test_pay_512');
    expect(calls.clearedCarts).toEqual(['tok_1']);
  });

  it('is a no-op on an order that is already paid, so a replay cannot double-apply', async () => {
    state.paymentStatus = 'paid';

    const result = await completeStagingSimulatorPayment(512);

    expect(result.alreadyPaid).toBe(true);
    // One `set_paid` per order is what keeps WooCommerce from re-running its own
    // inventory and status bookkeeping a second time.
    expect(calls.paid).toEqual([]);
    expect(calls.notes).toEqual([]);
    expect(calls.clearedCarts).toEqual([]);
  });

  it('never dispatches a notification email', async () => {
    await completeStagingSimulatorPayment(512);

    expect(calls.notifications).toBe(0);
  });
});

describe('declineStagingSimulatorPayment', () => {
  beforeEach(() => {
    state.paymentStatus = 'pending';
    calls.paid = [];
    calls.notes = [];
    calls.clearedCarts = [];
    calls.failed = [];
    calls.notifications = 0;
  });

  it('records a failure without paying, clearing the cart, or minting a transaction', async () => {
    await declineStagingSimulatorPayment(512);

    expect(calls.failed).toEqual([512]);
    expect(calls.paid).toEqual([]);
    expect(calls.clearedCarts).toEqual([]);
    expect(calls.notes[0]).toContain('DO NOT FULFILL');
    expect(calls.notes[0]).toContain('declined');
  });

  it('writes no card digits into the order note', async () => {
    await declineStagingSimulatorPayment(512);

    // Nothing that looks like a card number may reach a record that outlives the
    // request — this is the one place the simulator could otherwise leak one.
    expect(calls.notes[0]).not.toMatch(/\d{4}[\s-]?\d{4}[\s-]?\d{4}/);
    expect(calls.notes[0]).not.toContain('4242');
    expect(calls.notes[0]).not.toContain('0002');
  });

  it('never demotes an order that is already paid', async () => {
    state.paymentStatus = 'paid';

    await declineStagingSimulatorPayment(512);

    expect(calls.failed).toEqual([]);
    expect(calls.notes).toEqual([]);
  });

  it('never dispatches a notification email', async () => {
    await declineStagingSimulatorPayment(512);

    expect(calls.notifications).toBe(0);
  });
});
