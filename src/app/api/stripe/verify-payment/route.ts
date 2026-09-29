/**
 * "Did this payment become a paid order yet?"
 *
 * The browser asks after the card is confirmed. Nothing here trusts the redirect
 * or the client's word: the PaymentIntent is re-read from Stripe, and the order it
 * names is re-read from the store. `orderId` is returned only once the store itself
 * records the order as paid — which is the signed webhook's job — so the success
 * page can poll this until the webhook has landed instead of showing a confirmation
 * the store does not back.
 *
 * It replaced a Supabase read of `stripe_checkout_sessions`: the PaymentIntent's
 * own metadata now names the order, so the payment is the link rather than a row
 * this app had to keep.
 */

import { NextResponse } from 'next/server';
import { getStripeClient, stripeConfigError } from '@/lib/stripe/server/stripe';
import { validateVerifyPaymentBody } from '@/lib/stripe/server/validation';
import { wooOrderIdFromMetadata } from '@/lib/stripe/server/updateOrderPayment';
import { getWooOrder, paymentStatusFromWoo } from '@/lib/woo/orders';

export async function POST(request: Request) {
  const configError = await stripeConfigError();
  if (configError) return configError;
  const body = await request.json().catch(() => null);
  const validated = validateVerifyPaymentBody(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: validated.status });

  try {
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(validated.data.paymentIntentId);
    const orderId = wooOrderIdFromMetadata(paymentIntent.metadata);
    if (!orderId) {
      return NextResponse.json({ error: 'Payment is not linked to an order.' }, { status: 400 });
    }

    if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_action') {
      return NextResponse.json({
        ok: true,
        paymentIntentId: paymentIntent.id,
        reservedOrderId: String(orderId),
        paymentStatus: 'pending',
        pending: true,
        status: paymentIntent.status,
      });
    }
    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment has not completed. Please review the selected payment method before trying again.', status: paymentIntent.status }, { status: 402 });
    }

    // Stripe says the card succeeded; the store is the authority on whether the
    // order is paid, and the webhook is what makes it so.
    const order = await getWooOrder(orderId);
    const paid = paymentStatusFromWoo(order) === 'paid';

    return NextResponse.json({
      ok: true,
      paymentIntentId: paymentIntent.id,
      reservedOrderId: String(orderId),
      orderId: paid ? String(orderId) : undefined,
      paymentStatus: paid ? 'paid' : 'pending',
      pending: !paid,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify payment.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
