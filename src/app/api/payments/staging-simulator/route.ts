/**
 * Takes a simulated payment, on staging only.
 *
 * ## The only thing it simulates is the card result
 *
 * Everything else is the real checkout: the cart is read from WooCommerce, the
 * shipping quote is re-verified server-side, the order is reserved by
 * `reserveOrderForCheckout` (so a retry reuses it instead of creating a second one),
 * the total is the one WooCommerce saved on that order, and the paid transition is
 * `markWooOrderPaid` — the same call the Stripe webhook makes. The only invented fact
 * is "the card succeeded" or "the card was declined", which is the one thing that
 * needs Stripe test keys to be real.
 *
 * That is what makes the QA run meaningful: the order it produces is a genuine
 * WooCommerce order, shown in Admin, in Sales & Profit and in the customer's
 * history with no import step, distinguishable only by its honest
 * `staging_test_card` label.
 *
 * ## The gate comes first, and it is not advisory
 *
 * `readStagingSimulatorStatus` is evaluated before the body is even parsed. It fails
 * closed on the deployment's own build-time origin, so this endpoint answers `403` on
 * production even when called by hand with a perfectly valid payload and the switch
 * turned on. Returning `403` rather than a silently-empty `200` is deliberate: a
 * caller that tried to simulate a production payment is told it is forbidden.
 *
 * ## What never arrives here
 *
 * No card number, expiry or CVC. The simulator classifies the typed test card in the
 * browser and posts only the outcome, so there is no card data in the request, in a
 * log, or in an error report — and the order stores `staging_test_card` /
 * `stg_test_pay_<order id>` instead. See `lib/payments/stagingSimulator.ts`.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getErrorMessage } from '@/lib/errors';
import { readCartSession } from '@/lib/cart/cookies';
import { optionalCustomerRequest } from '@/lib/auth/customerRequest';
import { loadCartForCheckout, reserveOrderForCheckout } from '@/lib/orders/serverCreateOrder';
import { validateCreatePaymentIntentBody } from '@/lib/stripe/server/validation';
import { orderWithItemsFromWoo } from '@/lib/woo/orders';
import {
  STAGING_DECLINE_MESSAGE,
  STAGING_PAYMENT_METHOD,
  STAGING_PAYMENT_METHOD_TITLE,
  isStagingTestOutcome,
  stagingTransactionRef,
} from '@/lib/payments/stagingSimulator';
import { readStagingSimulatorStatus } from '@/lib/payments/server/stagingSimulatorGate';
import {
  completeStagingSimulatorPayment,
  declineStagingSimulatorPayment,
} from '@/lib/payments/server/stagingSimulatorPayment';
import type { CreateOrderData } from '@/lib/orders/totals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A refusal, whatever the reason. Never a 200: the caller asked for something forbidden. */
function forbidden(reason: string) {
  return NextResponse.json(
    { error: reason, code: 'staging_simulator_forbidden', stagingOnly: true },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`staging-simulator:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const status = await readStagingSimulatorStatus({ requestHost: request.headers.get('host') });
  if (!status.available) return forbidden(status.reason ?? 'Staging payment simulation is not available here.');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const outcome = (body as { outcome?: unknown } | null)?.outcome;
  if (!isStagingTestOutcome(outcome)) {
    return NextResponse.json(
      { error: 'outcome must be "success" or "decline".' },
      { status: 400 },
    );
  }

  const validated = validateCreatePaymentIntentBody(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: validated.status });

  const { data } = validated;
  // Identity comes from the session, never the body — the same rule the card checkout
  // follows, so a QA guest checkout is a guest here too.
  const customer = await optionalCustomerRequest(request);
  const cartSession = await readCartSession();
  const cart = await loadCartForCheckout(cartSession.cartToken);
  if (!cart?.cart_items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 409 });

  try {
    const reserved = await reserveOrderForCheckout(
      {
        ...data,
        paymentProvider: 'staging_simulator',
        paymentMethod: STAGING_PAYMENT_METHOD,
        paymentStatus: 'pending',
      } as CreateOrderData,
      {
        customerId: customer?.id ?? null,
        cartToken: cartSession.cartToken,
        // Recorded up front so the console labels an unpaid QA order honestly, too.
        paymentMethod: STAGING_PAYMENT_METHOD,
        paymentMethodTitle: STAGING_PAYMENT_METHOD_TITLE,
      },
    );
    const orderId = Number(reserved.raw.id);

    if (outcome === 'decline') {
      await declineStagingSimulatorPayment(orderId);
      return NextResponse.json(
        {
          declined: true,
          stagingOnly: true,
          orderId: String(orderId),
          orderNumber: reserved.order.order_number,
          paymentMethod: STAGING_PAYMENT_METHOD,
          message: STAGING_DECLINE_MESSAGE,
        },
        { status: 402 },
      );
    }

    const result = await completeStagingSimulatorPayment(orderId);
    const order = orderWithItemsFromWoo(result.order);

    return NextResponse.json({
      declined: false,
      stagingOnly: true,
      alreadyPaid: result.alreadyPaid,
      // The projection the confirmation screen renders, built from the order the
      // store just marked paid — so the page shows the store's own numbers.
      order,
      orderId: String(orderId),
      orderNumber: order.order_number,
      paymentMethod: STAGING_PAYMENT_METHOD,
      paymentMethodTitle: STAGING_PAYMENT_METHOD_TITLE,
      transactionRef: stagingTransactionRef(orderId),
      amount: order.total,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Staging simulator payment failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'The simulated payment could not be completed.') },
      { status: 500 },
    );
  }
}
