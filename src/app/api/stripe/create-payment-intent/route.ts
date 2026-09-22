/**
 * Starts a card payment for a cart.
 *
 * ## The order exists before the payment
 *
 * The WooCommerce order is reserved first (`reserveOrderForCheckout`), because the
 * store's order id is the identifier every later step needs: the PaymentIntent's
 * metadata carries it, the webhook marks *that* order paid, and the tracker and
 * the customer's history read it. Nothing here consults Supabase.
 *
 * ## Idempotency, in two layers
 *
 * 1. **The order is reserved once per cart.** A double-click, a retry or a
 *    refreshed browser re-sends the same cart, whose fingerprint matches the
 *    pending order already reserved, so no second order is created.
 * 2. **The intent is created once per order.** The intent id is recorded on the
 *    order meta before this response is returned, and any later attempt reuses it
 *    (or asks Stripe for it by idempotency key, whose key is
 *    `hk-pi-<orderId>-<cartFingerprint>`). Two intents that could both be confirmed
 *    are exactly how one cart becomes two charges; there is only ever one.
 *
 * The amount is the store's cart total, computed here from the WooCommerce cart —
 * never a sum the browser supplied.
 */

import { NextResponse } from 'next/server';
import { getStripeClient, getStripeMode, stripeConfigError } from '@/lib/stripe/server/stripe';
import { validateCreatePaymentIntentBody } from '@/lib/stripe/server/validation';
import { checkRateLimit } from '@/lib/rateLimit';
import { readCartSession } from '@/lib/cart/cookies';
import { optionalCustomerRequest } from '@/lib/auth/customerRequest';
import {
  cartFingerprint,
  loadCartForCheckout,
  reserveOrderForCheckout,
  resolveServerShippingCost,
  validateCheckoutCartItems,
} from '@/lib/orders/serverCreateOrder';
import { calculateOrderTotals, type CreateOrderData } from '@/lib/orders/totals';
import { HK_META, readWooOrderMeta, setWooOrderPaymentIntent } from '@/lib/woo/orders';

const MIN_AMOUNT_CENTS = 50;

/** Intent states that can still be paid; anything else needs a fresh intent. */
const REUSABLE_INTENT_STATES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
]);

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`payment:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const configError = await stripeConfigError();
  if (configError) return configError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validated = validateCreatePaymentIntentBody(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: validated.status });

  const { data } = validated;

  // Identity comes from the session, never the body. No session is a guest, and a
  // guest checkout is a supported path.
  const customer = await optionalCustomerRequest(request);

  const cartSession = await readCartSession();
  const cart = await loadCartForCheckout(cartSession.cartToken);
  if (!cart?.cart_items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 409 });

  try {
    validateCheckoutCartItems(cart.cart_items);
    const pricedItems = cart.cart_items.map((item) => ({ quantity: item.quantity, unitPrice: Number(item.product?.price || 0) }));
    const resolvedShipping = await resolveServerShippingCost({
      shippingAddress: data.shippingAddress,
      email: data.email,
      shippingMethod: data.shippingMethod,
      shippoRateId: data.shippoRateId,
      lineItems: cart.cart_items.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
    });
    const totals = calculateOrderTotals(pricedItems, {
      couponCode: data.couponCode,
      shippingMethod: data.shippingMethod,
      shippingCostOverride: resolvedShipping.shippingCostOverride,
    });
    const amountCents = Math.round(totals.total * 100);
    if (amountCents < MIN_AMOUNT_CENTS) {
      return NextResponse.json({ error: 'Order total is below the minimum charge amount.' }, { status: 400 });
    }

    const stripe = await getStripeClient();

    // Reserve the store's order first: its id is what the payment is attached to.
    const reserved = await reserveOrderForCheckout(
      { ...data, paymentProvider: 'stripe', paymentMethod: 'stripe_card', paymentStatus: 'pending', clearCart: true } as CreateOrderData,
      {
        customerId: customer?.id ?? null,
        cartToken: cartSession.cartToken,
      }
    );
    const orderId = Number(reserved.raw.id);
    const fingerprint = cartFingerprint(cart.cart_items);

    // Reuse the intent this order already carries, when it can still be paid. This
    // is what a refresh or a second click lands on: the same intent, not a new one.
    const recordedIntentId = readWooOrderMeta(reserved.raw, HK_META.paymentIntent);
    if (recordedIntentId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(recordedIntentId);
        if (REUSABLE_INTENT_STATES.has(existing.status)) {
          return NextResponse.json({
            clientSecret: existing.client_secret,
            paymentIntentId: existing.id,
            amount: existing.amount,
            currency: 'usd',
            mode: await getStripeMode(),
            reservedOrderId: String(orderId),
          });
        }
      } catch (error) {
        // Retrieval failed (a rotated key, or an intent from another account) —
        // fall through and create a fresh one rather than failing the checkout.
        console.warn('Recorded payment intent could not be read; creating a new one:', error);
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        receipt_email: data.email,
        automatic_payment_methods: { enabled: true },
        metadata: {
          // The canonical order identifier: the webhook, and any reconciliation,
          // uses this to find the order the payment belongs to.
          woo_order_id: String(orderId),
          email: data.email,
          coupon_code: data.couponCode.trim().toUpperCase(),
          shipping_method: data.shippingMethod,
          cart_item_count: String(cart.cart_items.length),
          integration: 'himalayan_koh_checkout_v3',
        },
      },
      // Belt and braces with the id recorded on the order below: two simultaneous
      // requests for the same order and cart return one intent.
      { idempotencyKey: `hk-pi-${orderId}-${fingerprint}` }
    );

    await setWooOrderPaymentIntent(orderId, {
      paymentIntentId: paymentIntent.id,
      paymentMethod: 'stripe_card',
      paymentMethodTitle: 'Card',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountCents,
      currency: 'usd',
      mode: await getStripeMode(),
      reservedOrderId: String(orderId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create payment intent.';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
