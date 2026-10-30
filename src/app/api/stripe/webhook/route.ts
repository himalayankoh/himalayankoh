/**
 * Stripe's signed callback — the only place a card payment becomes an order state.
 *
 * The PaymentIntent carries `metadata.woo_order_id` (set when the checkout
 * reserved the order), so this handler needs no session row and no Supabase read
 * to find the order a payment belongs to. An event whose metadata names no order
 * the store knows is logged and ignored: creating an order the store cannot
 * explain is worse than dropping an event, and a genuine mismatch is a bug worth
 * seeing in the logs.
 *
 * The signature is verified before anything is read from the body, and every
 * transition is idempotent on the order (see `updateOrderPayment`), so Stripe's
 * retries change nothing after the first delivery.
 *
 * Before an order is marked paid, the captured amount is checked against the order
 * total (`paymentCoversWooOrder`), and the *chosen* payment method is resolved so
 * Sales reports a Klarna order as Klarna rather than as a card.
 */

import { NextResponse } from 'next/server';
import {
  getStripeSignatureVerifier,
  mayApplyPaymentsForMode,
  resolveStripeWebhookSecret,
} from '@/lib/stripe/server/stripe';
import {
  finalizeWooOrderPayment,
  markWooOrderPaymentFailed,
  resolveStripePaymentMethodLabel,
  shouldFinalizeSuccessfulPayment,
  wooOrderIdFromMetadata,
} from '@/lib/stripe/server/updateOrderPayment';
import { WooOrderError } from '@/lib/woo/orders';

export const runtime = 'nodejs';

interface WebhookPaymentIntent {
  id?: string;
  metadata?: unknown;
  amount?: number;
  currency?: string;
  payment_method_types?: string[];
  payment_method?: string | { id?: string; type?: string };
}

export async function POST(request: Request) {
  const webhookSecret = await resolveStripeWebhookSecret();
  if (!webhookSecret) return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing Stripe-Signature header.' }, { status: 400 });

  const rawBody = await request.text();
  let event;
  let stripe;
  try {
    // Verification is not gated on charging permission: proving Stripe signed the
    // body is separate from deciding whether this deployment may act on it, and
    // conflating the two reported "invalid signature" for a valid delivery that was
    // simply not destined for this environment.
    stripe = await getStripeSignatureVerifier();
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Stripe webhook verification error:', detail);
    return NextResponse.json({ error: 'Invalid webhook signature.', detail }, { status: 400 });
  }

  // A live delivery must not mark an order paid on a deployment that is not
  // allowed to take live payments (staging, or a production deployment whose live
  // readiness is incomplete). Acknowledged with 200 so Stripe stops retrying, and
  // recorded, rather than pretending the signature was bad.
  const permission = await mayApplyPaymentsForMode(event.livemode ? 'live' : 'test');
  if (!permission.ok) {
    console.warn('Stripe webhook received but not applied:', event.type, event.id, permission.reason);
    return NextResponse.json({ received: true, applied: false, reason: permission.reason });
  }

  const paymentIntent = event.data.object as WebhookPaymentIntent;
  const orderId = wooOrderIdFromMetadata(paymentIntent.metadata);

  try {
    if (shouldFinalizeSuccessfulPayment(event.type)) {
      if (!orderId || !paymentIntent.id) {
        console.warn('Stripe success event without a resolvable WooCommerce order:', event.type, event.id);
        return NextResponse.json({ received: true });
      }

      // The actually-chosen method type, when Stripe exposes it, so the order is
      // labelled by what the customer used rather than by what was merely eligible.
      const chosenType =
        typeof paymentIntent.payment_method === 'object'
          ? paymentIntent.payment_method?.type
          : await retrievePaymentMethodType(stripe, paymentIntent.payment_method);
      const label = resolveStripePaymentMethodLabel(paymentIntent.payment_method_types, chosenType);

      const result = await finalizeWooOrderPayment(orderId, paymentIntent.id, label, {
        amount: Number(paymentIntent.amount ?? 0),
        currency: String(paymentIntent.currency ?? 'usd'),
      });

      if (result.amountMismatch) {
        // Money was captured but it does not cover the order: acknowledged so Stripe
        // stops retrying, but deliberately not marked paid — surfaced for review
        // rather than silently reconciled.
        return NextResponse.json({ received: true, applied: false, reason: 'amount_mismatch' });
      }
    }

    if (event.type === 'payment_intent.payment_failed' && orderId) {
      await markWooOrderPaymentFailed(orderId);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // A 5xx asks Stripe to retry. A store-side 4xx (a missing or invalid order)
    // will never succeed on retry, so it is acknowledged rather than looped.
    if (error instanceof WooOrderError && error.status < 500) {
      console.error('Stripe webhook could not be applied:', error.message);
      return NextResponse.json({ received: true, applied: false });
    }
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler error.' }, { status: 500 });
  }
}

/** The type of a PaymentMethod id (e.g. `card`, `klarna`), or null if unreadable. */
async function retrievePaymentMethodType(
  stripe: Awaited<ReturnType<typeof getStripeSignatureVerifier>>,
  paymentMethod: string | undefined
): Promise<string | null> {
  if (!paymentMethod) return null;
  try {
    const method = await stripe.paymentMethods.retrieve(paymentMethod);
    return method.type ?? null;
  } catch (error) {
    console.warn('Could not read the chosen Stripe payment method type:', error);
    return null;
  }
}
