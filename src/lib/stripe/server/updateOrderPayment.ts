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
import { clearReservedCart } from '@/lib/orders/serverCreateOrder';
import { dispatchPaymentReceivedNotifications } from '@/lib/orders/notifyOrderEvents';

/**
 * Map a Stripe PaymentIntent's payment_method_types[] to the label we persist on
 * the order. Cards stay 'stripe_card' (unchanged); BNPL and other methods get a
 * descriptive label so admins/emails don't mislabel a Klarna order as a card.
 */
export function resolveStripePaymentMethodLabel(paymentMethodTypes?: string[] | null): string {
  const types = paymentMethodTypes || [];
  if (types.includes('klarna')) return 'stripe_klarna';
  if (types.includes('afterpay_clearpay')) return 'stripe_afterpay_clearpay';
  if (types.includes('affirm')) return 'stripe_affirm';
  const primary = types.find((t) => t && t !== 'card');
  if (primary) return `stripe_${primary}`;
  return 'stripe_card';
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
 * The paid transition: mark the order paid, empty its cart, alert the store.
 *
 * Returns `alreadyPaid: true` without side effects when the order is already paid,
 * so a replayed `payment_intent.succeeded` cannot send a second confirmation email
 * or disturb a cart the customer may have refilled since.
 */
export async function finalizeWooOrderPayment(
  orderId: number,
  paymentIntentId: string,
  paymentMethodLabel: string = 'stripe_card'
): Promise<{ alreadyPaid: boolean; order: WooOrderLike | null }> {
  const order = await getWooOrder(orderId);

  if (paymentStatusFromWoo(order) === 'paid') {
    return { alreadyPaid: true, order };
  }

  const updated = await markWooOrderPaid(orderId, { paymentIntentId });

  // Emptied only now: an abandoned or failed payment leaves the shopper's cart
  // intact so they can retry without rebuilding it.
  await clearReservedCart(readWooOrderMeta(order, HK_META.cartToken));

  // Fire-and-forget; never awaited, so a mail failure cannot fail the webhook.
  dispatchPaymentReceivedNotifications(String(orderId));

  return { alreadyPaid: false, order: updated };
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
