import { NextResponse } from 'next/server';
import { getStripeClient, getStripeMode, stripeConfigError } from '@/lib/stripe/server/stripe';
import { validateCreatePaymentIntentBody } from '@/lib/stripe/server/validation';
import { checkRateLimit } from '@/lib/rateLimit';
import { readCartSession } from '@/lib/cart/cookies';
import { createCheckoutSession, attachPaymentIntent } from '@/lib/stripe/server/checkoutSessions';
import { cartFingerprint, loadCartForCheckout, resolveServerShippingCost, validateCheckoutCartItems } from '@/lib/orders/serverCreateOrder';
import { calculateOrderTotals, type CreateOrderData } from '@/lib/supabase/api/orders';
import { getSupabaseAdmin } from '@/lib/stripe/server/supabaseAdmin';

const MIN_AMOUNT_CENTS = 50;

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
  let verifiedUserId = data.userId || null;
  if (verifiedUserId) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.slice(7).trim());
    if (userError || userData.user?.id !== verifiedUserId) return NextResponse.json({ error: 'Invalid checkout owner.' }, { status: 403 });
  }
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

    const checkoutData: CreateOrderData & { userId?: string | null; cartToken?: string | null } = {
      ...data,
      userId: verifiedUserId,
      // Recorded so the Stripe webhook can price and empty the *same* cart without
      // a browser: it is the only place the webhook can learn which cart this
      // payment was for.
      cartToken: cartSession.cartToken,
      paymentProvider: 'stripe',
      paymentMethod: 'stripe_card',
      paymentStatus: 'pending',
      clearCart: true,
    };
    const session = await createCheckoutSession({
      data: checkoutData,
      cartFingerprint: cartFingerprint(cart.cart_items),
    });

    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      receipt_email: data.email,
      automatic_payment_methods: { enabled: true },
      metadata: {
        checkout_session_id: session.id,
        email: data.email,
        coupon_code: data.couponCode.trim().toUpperCase(),
        shipping_method: data.shippingMethod,
        cart_item_count: String(cart.cart_items.length),
        integration: 'himalayan_koh_checkout_v2',
      },
    });
    await attachPaymentIntent(session.id, paymentIntent.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountCents,
      currency: 'usd',
      mode: await getStripeMode(),
      checkoutSessionId: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create payment intent.';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
