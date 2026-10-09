/**
 * Creates an order that is not waiting on a card payment.
 *
 * ## What is left on this route
 *
 * Stripe orders are no longer created here. The card checkout reserves its
 * WooCommerce order before the PaymentIntent exists — the store's order id is what
 * Stripe's metadata carries — so this route would only ever be a second, competing
 * creation path for the same order. It refuses Stripe outright rather than letting
 * one be created without a payment behind it.
 *
 * What remains is the **invoice** checkout: an order the owner bills separately.
 * It has no payment to wait for, so the order is created (pending) and the customer
 * is sent to its confirmation.
 *
 * ## Identity
 *
 * The customer id comes from the caller's verified session, never from the body —
 * a body-supplied id is one a browser can choose. A guest checkout simply has no
 * session, and the order is written with the billing email it was given.
 */

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { readCartSession } from '@/lib/cart/cookies';
import { optionalCustomerRequest } from '@/lib/auth/customerRequest';
import { reserveOrderForCheckout, clearReservedCart } from '@/lib/orders/serverCreateOrder';
import { dispatchOrderCreatedNotifications } from '@/lib/orders/notifyOrderEvents';
import { ORDERS_PAUSED_MESSAGE, isOrderingPaused } from '@/lib/storefront/ordering';
import type { CreateOrderData, ShippingMethod } from '@/lib/orders/totals';

type CreateOrderBody = CreateOrderData;

function parseBody(body: unknown): { ok: true; data: CreateOrderBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }

  const record = body as Record<string, unknown>;
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  if (!email) {
    return { ok: false, error: 'Email is required.' };
  }

  const shippingAddress = record.shippingAddress;
  if (!shippingAddress || typeof shippingAddress !== 'object') {
    return { ok: false, error: 'Shipping address is required.' };
  }

  return { ok: true, data: body as CreateOrderBody };
}

export async function POST(request: Request) {
  // First, before the body is even read: is this deployment accepting orders at all?
  //
  // This is the server-side half of a catalogue-only launch. The checkout screen
  // already refuses to submit when no payment path exists, but a screen is not a
  // control — a hand-written POST reaches this route directly, and this route is the
  // one that writes to the store's order table. Refusing here is what makes "no
  // customer orders are accepted" true of the deployment rather than true of the
  // buttons. Nothing above this line has touched WooCommerce.
  if (isOrderingPaused()) {
    return NextResponse.json({ error: ORDERS_PAUSED_MESSAGE }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const orderData = parsed.data;

  // Only the invoice path writes an order here. A Stripe order is reserved by the
  // card checkout, against the PaymentIntent that pays it.
  if (orderData.paymentProvider !== 'invoice') {
    return NextResponse.json(
      {
        error:
          'Card orders are created by the card checkout, against the payment that pays them. Use the card payment flow.',
      },
      { status: 402 },
    );
  }

  const customer = await optionalCustomerRequest(request);
  const { cartToken } = await readCartSession();

  try {
    const reserved = await reserveOrderForCheckout(
      {
        ...orderData,
        shippingMethod: (orderData.shippingMethod || 'standard') as ShippingMethod,
      },
      {
        customerId: customer?.id ?? null,
        cartToken,
        paymentMethod: 'invoice',
        paymentMethodTitle: 'Invoice',
      }
    );

    // Only for a genuinely new order: a reused reservation has already announced
    // itself, and a retried invoice submit must not email the buyer twice.
    if (!reserved.reused) {
      dispatchOrderCreatedNotifications(reserved.order.id);
    }
    await clearReservedCart(reserved.cartToken);

    return NextResponse.json(reserved.order);
  } catch (error) {
    console.error('Create order failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to place order.') },
      { status: 500 }
    );
  }
}
