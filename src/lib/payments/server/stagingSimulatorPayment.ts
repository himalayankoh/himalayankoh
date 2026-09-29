/**
 * A simulated payment's two outcomes, written to the store's order.
 *
 * ## It reuses the real pipeline rather than imitating it
 *
 * The success transition is `markWooOrderPaid` — the exact call the Stripe webhook
 * makes — so a simulated paid order is a *real* WooCommerce paid order: `set_paid`
 * is what gives it a `date_paid`, moves it to `processing`, lets WooCommerce run its
 * own inventory and status bookkeeping once, and makes it appear in Sales & Profit
 * with no import step. Nothing here re-implements stock, totals or status mapping, so
 * the simulator cannot drift from the real checkout or double-apply inventory.
 *
 * The decline transition is `markWooOrderPaymentFailed`, the same one a failed card
 * uses: the order stays `pending` with `_hk_payment_status = failed`, which is what
 * keeps it out of revenue and lets the shopper retry on the order they already have.
 *
 * ## What it deliberately does *not* do
 *
 * - **No notification email.** `dispatchPaymentReceivedNotifications` is never
 *   called for a simulated order, and `notifyOrderEvents` refuses one anyway, so a
 *   QA payment cannot mail a customer or the sales inbox.
 * - **No Shippo.** Buying a label is a separate admin action; nothing in the payment
 *   path does it, simulated or not, and nothing here changes that.
 * - **No Stripe.** No PaymentIntent, no key, no `stripe_*` label. The transaction
 *   reference is `stg_test_pay_<order id>`, which is unique per order, so a retried
 *   submission records the same reference instead of inventing a second one.
 */

import {
  HK_META,
  addWooOrderNote,
  getWooOrder,
  markWooOrderPaid,
  paymentStatusFromWoo,
  readWooOrderMeta,
  type WooOrderLike,
} from '@/lib/woo/orders';
import { clearReservedCart } from '@/lib/orders/serverCreateOrder';
import { markWooOrderPaymentFailed } from '@/lib/stripe/server/updateOrderPayment';
import {
  STAGING_ORDER_NOTE,
  STAGING_PAYMENT_METHOD,
  STAGING_PAYMENT_METHOD_TITLE,
  STAGING_TEST_CARD_LABEL,
  stagingTransactionRef,
} from '../stagingSimulator';

export interface StagingSimulatorPaymentResult {
  /** The order was already paid, so this call changed nothing. */
  alreadyPaid: boolean;
  transactionRef: string;
  order: WooOrderLike;
}

/**
 * The simulated success: mark the order paid, note it, empty the cart.
 *
 * Replaying a success is a no-op that writes no second note and empties no cart the
 * shopper may have refilled — the same idempotency the webhook relies on, for the
 * same reason (a double-click must not become a second recorded payment).
 */
export async function completeStagingSimulatorPayment(
  orderId: number,
): Promise<StagingSimulatorPaymentResult> {
  const order = await getWooOrder(orderId);
  const transactionRef = stagingTransactionRef(orderId);

  if (paymentStatusFromWoo(order) === 'paid') {
    return { alreadyPaid: true, transactionRef, order };
  }

  const updated = await markWooOrderPaid(orderId, {
    // The simulator's own reference. Deliberately NOT written as the order's
    // PaymentIntent: no PaymentIntent exists, and a fake id there would be read back
    // by the card checkout's intent-reuse path as if Stripe had issued it.
    transactionId: transactionRef,
    paymentMethod: STAGING_PAYMENT_METHOD,
    paymentMethodTitle: STAGING_PAYMENT_METHOD_TITLE,
  });

  // The note is the operator-facing half of the safety rule: the order is real
  // enough to show up in the store's queue, so it says out loud not to fulfil it.
  await addWooOrderNote(
    orderId,
    `${STAGING_ORDER_NOTE} — simulated ${STAGING_TEST_CARD_LABEL} payment ${transactionRef} on the staging ` +
      `checkout. No money was charged, no Stripe payment was created, and nothing may be shipped.`,
  );

  // Emptied only once the payment is recorded, exactly as the card path does — a
  // declined attempt leaves the shopper's cart intact to retry with.
  await clearReservedCart(readWooOrderMeta(order, HK_META.cartToken));

  return { alreadyPaid: false, transactionRef, order: updated };
}

/**
 * The simulated decline.
 *
 * Records the failure and nothing else: no paid state, no transaction reference, no
 * revenue. The order is left `pending`, so Sales excludes it and the retry reuses it
 * rather than reserving a second order for the same cart.
 */
export async function declineStagingSimulatorPayment(orderId: number): Promise<void> {
  const order = await getWooOrder(orderId);
  // A declined simulation must never demote an order that is already paid.
  if (paymentStatusFromWoo(order) === 'paid') return;

  await markWooOrderPaymentFailed(orderId);
  // No digits in the note, not even the last four: the simulator never records card
  // data anywhere, and this is the one place it would otherwise leak into a record
  // that outlives the request.
  await addWooOrderNote(
    orderId,
    `${STAGING_ORDER_NOTE} — the simulated Test Card payment was declined. No money was charged, ` +
      `the order is unpaid and excluded from revenue, and the shopper's cart is untouched.`,
  );
}
