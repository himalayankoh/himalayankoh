/**
 * Order events email the buyer and the store, and that is all they do.
 *
 * ## Where the order comes from
 *
 * WooCommerce. The order id these functions receive is the store's own id (the
 * checkout reserves the order, and the webhook and the label step both carry that
 * id), so the summary is the same projection the screens render — `orderFromWoo` —
 * rather than a Supabase row. There is no second order store left to read.
 *
 * ## What they no longer do
 *
 * They used to write an in-app notification row for every admin (`notifyAdmins`,
 * "Payment received — ship now" / "Order shipped"). That call was removed, not
 * ported: nothing ever *read* the notifications table for an admin, and the
 * recipient list came from Supabase `profiles` rows with `role = 'admin'` — a table
 * whose admin identity has since moved to WordPress. The emails below are the alert
 * that is actually delivered.
 *
 * Email is a side effect, never the source of truth: every dispatch is
 * fire-and-forget, so a mail failure cannot fail the payment or the order write.
 *
 * ## Simulated orders are never announced
 *
 * A staging payment-simulator order must not mail anybody. `loadOrderSummary`
 * therefore answers null for one, which makes every dispatcher below skip it by
 * construction — a guard per caller would have been three chances to forget one, and
 * the check lives here so a dispatcher added later inherits it. The rule is a
 * *property of the order* (its stored `staging_test_card` payment method), not of
 * whether `RESEND_API_KEY` happens to be set, which is what makes it hold even on a
 * deployment that can genuinely send mail.
 */

import {
  sendAdminPaymentReceived,
  sendBuyerOrderConfirmation,
  sendBuyerShippedEmail,
} from '@/lib/email/orderEmails';
import { orderFromWoo, getWooOrder } from '@/lib/woo/orders';
import { resolveTrackingUrl } from '@/lib/orders/tracking';
import { isStagingSimulatorPaymentMethod } from '@/lib/payments/stagingSimulator';

interface OrderNotifyRow {
  order_number: string;
  email: string;
  total: number;
  payment_status: string;
  payment_method: string | null;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipping_carrier: string | null;
}

async function loadOrderSummary(orderId: string): Promise<OrderNotifyRow | null> {
  const numeric = Number(orderId);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;

  const order = orderFromWoo(await getWooOrder(numeric));
  if (isStagingSimulatorPaymentMethod(order.payment_method)) return null;

  return {
    order_number: order.order_number,
    email: order.email,
    total: order.total,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    status: order.status,
    tracking_number: order.tracking_number,
    tracking_url: order.tracking_url,
    shipping_carrier: order.shipping_carrier,
  };
}

function toEmailSummary(row: OrderNotifyRow) {
  return {
    orderNumber: row.order_number,
    email: row.email,
    total: Number(row.total),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    status: row.status,
    trackingNumber: row.tracking_number,
    trackingUrl: resolveTrackingUrl(row),
    carrier: row.shipping_carrier,
  };
}

/** Fire-and-forget — never throw to callers. */
export function dispatchOrderCreatedNotifications(orderId: string): void {
  void (async () => {
    try {
      const row = await loadOrderSummary(orderId);
      if (!row) return;
      // A card order that has not been paid yet announces itself when the payment
      // lands (`dispatchPaymentReceivedNotifications`), not here.
      if (row.payment_method === 'stripe_card' && row.payment_status === 'pending') {
        return;
      }
      await sendBuyerOrderConfirmation(toEmailSummary(row));
    } catch (error) {
      console.error('Order created notifications failed:', error);
    }
  })();
}

export function dispatchPaymentReceivedNotifications(orderId: string): void {
  void (async () => {
    try {
      const row = await loadOrderSummary(orderId);
      if (!row) return;
      const summary = toEmailSummary(row);
      await Promise.all([sendBuyerOrderConfirmation(summary), sendAdminPaymentReceived(summary)]);
    } catch (error) {
      console.error('Payment received notifications failed:', error);
    }
  })();
}

export function dispatchOrderShippedNotifications(orderId: string): void {
  void (async () => {
    try {
      const row = await loadOrderSummary(orderId);
      if (!row?.tracking_number) return;
      const summary = toEmailSummary(row);
      await sendBuyerShippedEmail(summary);
    } catch (error) {
      console.error('Order shipped notifications failed:', error);
    }
  })();
}
