/**
 * Payment outcomes, written to the store's order.
 *
 * ## Why this is on the Woo order
 *
 * The order is WooCommerce's, and it exists before the payment does — the
 * checkout reserved it and put its id in the PaymentIntent's metadata. So the
 * webhook does not need a session row, or any Supabase lookup, to know which order
 * a payment belongs to: it reads `woo_order_id` from the event and updates that
 * order. A payment for an order the store cannot find is logged and ignored rather
 * than turned into a new order the store cannot explain.
 *
 * ## Idempotency
 *
 * Stripe retries events by design, so "process every delivery" is not an option.
 * The guard is the order itself: `date_paid_gmt` (Woo's own record that money
 * arrived) and `_hk_payment_status` are both already set by the first delivery, and
 * a second one is a no-op that emits nothing. The cart is only emptied and the
 * emails only scheduled inside the not-already-paid branch.
 */

import {
  HK_META,
  getWooOrder,
  markWooOrderPaid,
  paymentStatusFromWoo,
  readWooOrderMeta,
  updateWooOrderStatus,
  WooOrderError,
  type WooOrderLike,
} from '@/lib/woo/orders';
import { checkoutTotalsFromWoo } from '@/lib/woo/checkoutPricing';
import { clearReservedCart } from '@/lib/orders/serverCreateOrder';
import { dispatchPaymentReceivedNotifications } from '@/lib/orders/notifyOrderEvents';

/**
 * Map the payment method actually used to the label we persist on the order.
 *
 * Cards stay 'stripe_card' (unchanged); BNPL and other methods get a descriptive
 * label so admins/emails/Sales don't mislabel a Klarna order as a card. When Stripe
 * reports the *chosen* method type (`chosenType`) it wins over the list of eligible
 * types, because `payment_method_types` only says what could have been used.
 */
export function resolveStripePaymentMethodLabel(
  paymentMethodTypes?: string[] | null,
  chosenType?: string | null
): string {
  const chosen = chosenType?.trim().toLowerCase();
  if (chosen) return `stripe_${chosen}`;
  const types = paymentMethodTypes || [];
  if (types.includes('klarna')) return 'stripe_klarna';
  if (types.includes('afterpay_clearpay')) return 'stripe_afterpay_clearpay';
  if (types.includes('affirm')) return 'stripe_affirm';
  const primary = types.find((t) => t && t !== 'card');
  if (primary) return `stripe_${primary}`;
  return 'stripe_card';
}

/** A short, human label for a persisted `stripe_*` payment method. */
export function stripePaymentMethodTitle(label: string): string {
  switch (label) {
    case 'stripe_card':
      return 'Credit / Debit Card';
    case 'stripe_klarna':
      return 'Klarna';
    case 'stripe_afterpay_clearpay':
      return 'Afterpay / Clearpay';
    case 'stripe_affirm':
      return 'Affirm';
    case 'stripe_link':
      return 'Link';
    default: {
      const raw = label.replace(/^stripe_/, '').replace(/_/g, ' ').trim();
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Card';
    }
  }
}

/** Only a signed Stripe success event may mark an order paid. */
export function shouldFinalizeSuccessfulPayment(eventType: string): boolean {
  return eventType === 'payment_intent.succeeded';
}

/** WooCommerce's own order id, from a Stripe metadata value. Null when unusable. */
export function wooOrderIdFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).woo_order_id;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Does the captured payment at least cover the order, in the order's currency?
 *
 * The intent is created for the order's own total, so a genuine success always
 * matches. A shortfall means the order total changed after the intent was created
 * (or a mismatched delivery arrived) and it must not be marked paid on money that
 * does not cover it. An overpayment is treated as covering, since the customer was
 * charged at least the order and the order is the thing being settled.
 */
export function paymentCoversWooOrder(
  order: WooOrderLike,
  amount: number,
  currency: string
): boolean {
  const orderCents = Math.round(checkoutTotalsFromWoo(order).total * 100);
  const currencyOk = (order.currency ?? 'usd').toLowerCase() === currency.toLowerCase();
  return currencyOk && Number.isInteger(amount) && amount >= orderCents;
}

/**
 * The paid transition: mark the order paid (with how it was paid), empty its cart,
 * alert the store.
 *
 * Returns `alreadyPaid: true` without side effects when the order is already paid,
 * so a replayed `payment_intent.succeeded` cannot send a second confirmation email
 * or disturb a cart the customer may have refilled since. Returns
 * `amountMismatch: true` and does *not* mark paid when the captured amount does not
 * cover the order.
 */
export async function finalizeWooOrderPayment(
  orderId: number,
  paymentIntentId: string,
  paymentMethodLabel: string = 'stripe_card',
  expected?: { amount: number; currency: string }
): Promise<{ alreadyPaid: boolean; amountMismatch: boolean; order: WooOrderLike | null }> {
  const order = await getWooOrder(orderId);

  if (paymentStatusFromWoo(order) === 'paid') {
    return { alreadyPaid: true, amountMismatch: false, order };
  }

  if (expected && !paymentCoversWooOrder(order, expected.amount, expected.currency)) {
    console.error(
      'Stripe payment does not cover WooCommerce order; not marking paid.',
      { orderId, paymentIntentId, expected, orderTotal: order.total, orderCurrency: order.currency }
    );
    return { alreadyPaid: false, amountMismatch: true, order };
  }

  const updated = await markWooOrderPaid(orderId, {
    paymentIntentId,
    // The PaymentIntent id is the gateway transaction reference; the label records
    // how it was actually paid so Sales and the store agree.
    transactionId: paymentIntentId,
    paymentMethod: paymentMethodLabel,
    paymentMethodTitle: stripePaymentMethodTitle(paymentMethodLabel),
  });

  // Emptied only now: an abandoned or failed payment leaves the shopper's cart
  // intact so they can retry without rebuilding it.
  await clearReservedCart(readWooOrderMeta(order, HK_META.cartToken));

  // Fire-and-forget; never awaited, so a mail failure cannot fail the webhook.
  dispatchPaymentReceivedNotifications(String(orderId));

  return { alreadyPaid: false, amountMismatch: false, order: updated };
}

/**
 * The failed transition.
 *
 * The order stays `pending` — the shopper may complete the payment on another
 * attempt with the same reserved order — and only the payment status records the
 * failure, so the console can see it without the order leaving the queue.
 */
export async function markWooOrderPaymentFailed(orderId: number): Promise<void> {
  const order = await getWooOrder(orderId);
  if (paymentStatusFromWoo(order) === 'paid') return;

  try {
    await updateWooOrderStatus(orderId, { status: 'pending', paymentStatus: 'failed' });
  } catch (error) {
    if (error instanceof WooOrderError) {
      console.warn('Failed to record a failed payment on order', orderId, error.message);
      return;
    }
    throw error;
  }
}

export type { WooOrderLike };
