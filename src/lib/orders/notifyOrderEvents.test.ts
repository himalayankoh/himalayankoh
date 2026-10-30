import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A simulated order never mails anybody.
 *
 * This is the safety rule that does not depend on whether the deployment can send
 * mail at all: `RESEND_API_KEY` being present is what makes a real email go out, and a
 * staging QA order must stay quiet even then. So the guard is a property of the order
 * (its stored `staging_test_card` payment method) rather than of the mailer's
 * configuration, and it is pinned here because the failure mode — an email to a real
 * customer about an order nobody placed — is not one you notice after the fact.
 */

const state = {
  paymentMethod: 'staging_test_card' as string | null,
  paymentStatus: 'paid',
  status: 'processing',
};

const sent = {
  buyer: [] as Array<Record<string, unknown>>,
  admin: [] as Array<Record<string, unknown>>,
  shipped: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/email/orderEmails', () => ({
  sendBuyerOrderConfirmation: async (summary: Record<string, unknown>) => {
    sent.buyer.push(summary);
  },
  sendAdminPaymentReceived: async (summary: Record<string, unknown>) => {
    sent.admin.push(summary);
  },
  sendBuyerShippedEmail: async (summary: Record<string, unknown>) => {
    sent.shipped.push(summary);
  },
}));

vi.mock('@/lib/woo/orders', () => ({
  getWooOrder: async () => ({
    id: 512,
    number: '512',
    status: state.status,
    currency: 'USD',
    total: '99.90',
    payment_method: state.paymentMethod,
    payment_method_title: 'Staging Test Card',
    billing: { email: 'staging-payment-test@himalayankoh.com' },
    meta_data: [{ key: '_hk_payment_status', value: state.paymentStatus }],
    line_items: [],
  }),
  orderFromWoo: (order: Record<string, unknown>) => ({
    id: String(order.id),
    order_number: String(order.number),
    email: (order.billing as { email?: string } | undefined)?.email ?? '',
    total: Number(order.total),
    payment_status: state.paymentStatus,
    payment_method: state.paymentMethod,
    status: state.status,
    tracking_number: null,
    tracking_url: null,
    shipping_carrier: null,
  }),
}));

import {
  dispatchOrderCreatedNotifications,
  dispatchOrderShippedNotifications,
  dispatchPaymentReceivedNotifications,
} from './notifyOrderEvents';

/** The dispatchers are fire-and-forget; let their microtasks run before asserting. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('order notifications', () => {
  beforeEach(() => {
    state.paymentMethod = 'staging_test_card';
    state.paymentStatus = 'paid';
    state.status = 'processing';
    sent.buyer = [];
    sent.admin = [];
    sent.shipped = [];
  });

  it('never emails a buyer or the store about a simulated payment', async () => {
    dispatchPaymentReceivedNotifications('512');
    await settle();

    expect(sent.buyer).toEqual([]);
    expect(sent.admin).toEqual([]);
  });

  it('never emails about a simulated order being created or shipped either', async () => {
    dispatchOrderCreatedNotifications('512');
    dispatchOrderShippedNotifications('512');
    await settle();

    expect(sent.buyer).toEqual([]);
    expect(sent.admin).toEqual([]);
    expect(sent.shipped).toEqual([]);
  });

  it('still emails for a real card payment, so the guard is not a blanket silence', async () => {
    state.paymentMethod = 'stripe_card';

    dispatchPaymentReceivedNotifications('512');
    await settle();

    expect(sent.buyer).toHaveLength(1);
    expect(sent.admin).toHaveLength(1);
  });
});
