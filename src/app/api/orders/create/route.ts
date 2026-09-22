import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { readCartSession } from '@/lib/cart/cookies';
import { serverCreateOrder } from '@/lib/orders/serverCreateOrder';
import { getSupabaseAdmin } from '@/lib/stripe/server/supabaseAdmin';
import type { CreateOrderData, ShippingMethod } from '@/lib/supabase/api/orders';

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

async function resolveUserId(request: Request, bodyUserId?: string): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return bodyUserId || null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return bodyUserId || null;

  const supabase = getSupabaseAdmin();
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) {
    return null;
  }

  return userData.user.id;
}

export async function POST(request: Request) {
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
  const userId = await resolveUserId(request, (parsed.data as { userId?: string }).userId);
  // The cart is identified by the cookie the browser already holds, so no cart
  // identifier arrives in the body. That is also why the old "cart session
  // missing" precondition is gone: with no cookie there is simply no cart, and
  // `serverCreateOrder` answers that with "Cart is empty" — the accurate answer,
  // instead of a request-shape complaint.
  const { cartToken } = await readCartSession();

  // Public checkout must never create an order before Stripe confirms payment.
  // The signed Stripe webhook calls serverCreateOrder directly after payment;
  // this endpoint is deliberately not an unpaid-order shortcut.
  if (
    orderData.paymentProvider !== 'stripe' ||
    orderData.paymentStatus !== 'paid' ||
    !orderData.paymentIntentId
  ) {
    return NextResponse.json(
      { error: 'Payment must succeed before an order can be created.' },
      { status: 402 },
    );
  }

  try {
    const order = await serverCreateOrder(
      {
        ...orderData,
        shippingMethod: (orderData.shippingMethod || 'standard') as ShippingMethod,
      },
      { userId, cartToken }
    );

    return NextResponse.json(order);
  } catch (error) {
    console.error('Create order failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to place order.') },
      { status: 500 }
    );
  }
}
