/**
 * Starts a payment for a cart.
 *
 * ## The order exists before the payment
 *
 * The WooCommerce order is reserved first (`reserveOrderForCheckout`), because the
 * store's order id is the identifier every later step needs: the PaymentIntent's
 * metadata carries it, the webhook marks *that* order paid, and the tracker and
 * the customer's history read it. Nothing here consults Supabase.
 *
 * ## The amount is WooCommerce's, not ours
 *
 * The PaymentIntent is created for the total **WooCommerce saved on the reserved
 * order** (`checkoutTotalsFromWoo`). The order is what the store calculated — its
 * own tax, coupon and shipping rules — so the amount charged is exactly the total
 * on the order the customer will see. An app-side estimate is never used for money:
 * if our arithmetic and the store's ever diverge, the store's number is what the
 * order says, and charging anything else would leave a paid order that does not
 * match its own record.
 *
 * ## Idempotency, in two layers
 *
 * 1. **The order is reserved once per cart.** A double-click, a retry or a
 *    refreshed browser re-sends the same cart, whose fingerprint matches the
 *    pending order already reserved, so no second order is created.
 * 2. **The intent is created once per order.** The intent id is recorded on the
 *    order meta before this response is returned, and any later attempt reuses it
 *    (or asks Stripe for it by idempotency key). Two intents that could both be
 *    confirmed are exactly how one cart becomes two charges; there is only ever one.
 */

import { NextResponse } from 'next/server';
import { getStripeClient, getStripeMode, stripeConfigError } from '@/lib/stripe/server/stripe';
import { validateCreatePaymentIntentBody } from '@/lib/stripe/server/validation';
import { checkRateLimit } from '@/lib/rateLimit';
import { ORDERS_PAUSED_MESSAGE, isOrderingPaused } from '@/lib/storefront/ordering';
import { readCartSession } from '@/lib/cart/cookies';
import { optionalCustomerRequest } from '@/lib/auth/customerRequest';
import {
  cartFingerprint,
  loadCartForCheckout,
  reserveOrderForCheckout,
  validateCheckoutCartItems,
} from '@/lib/orders/serverCreateOrder';
import type { CreateOrderData } from '@/lib/orders/totals';
import { checkoutTotalsFromWoo } from '@/lib/woo/checkoutPricing';
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
  if (isOrderingPaused()) {
    return NextResponse.json({ error: ORDERS_PAUSED_MESSAGE }, { status: 503 });
  }

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

    const stripe = await getStripeClient();

    // Reserve the store's order first: its id is what the payment is attached to,
    // and its own calculated total is what we charge. Shipping is re-quoted
    // server-side inside the reservation so the order and the intent share one
    // server-approved figure.
    const reserved = await reserveOrderForCheckout(
      { ...data, paymentProvider: 'stripe', paymentMethod: 'stripe_card', paymentStatus: 'pending', clearCart: true } as CreateOrderData,
      {
        customerId: customer?.id ?? null,
        cartToken: cartSession.cartToken,
      }
    );
    const orderId = Number(reserved.raw.id);
    const fingerprint = cartFingerprint(cart.cart_items);

    // The authoritative amount: the total WooCommerce saved on this order.
    const authoritative = checkoutTotalsFromWoo(reserved.raw);
    const amountCents = Math.round(authoritative.total * 100);
    if (amountCents < MIN_AMOUNT_CENTS) {
      return NextResponse.json({ error: 'Order total is below the minimum charge amount.' }, { status: 400 });
    }

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
            currency: existing.currency,
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

    // The idempotency key is stable per attempt-kind so two concurrent first
    // attempts collapse to one intent, while a retry after a *cancelled* intent
    // (which can no longer be paid) gets a fresh key and therefore a fresh intent
    // instead of Stripe replaying the cancelled one back to us.
    const attemptKind = recordedIntentId ? `r${recordedIntentId}` : 'new';

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
      { idempotencyKey: `hk-pi-${orderId}-${fingerprint}-${attemptKind}` }
    );

    await setWooOrderPaymentIntent(orderId, {
      paymentIntentId: paymentIntent.id,
      paymentMethod: 'stripe_card',
      paymentMethodTitle: 'Card',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      mode: await getStripeMode(),
      reservedOrderId: String(orderId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create payment intent.';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
