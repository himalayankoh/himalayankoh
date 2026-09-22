/**
 * Customer sign-in.
 *
 * The WordPress-side half of the exchange lives in `lib/auth/wordpressCustomerAuth`
 * — this route decides what the browser gets. It is the only place a customer
 * session is minted, and the only place a cart becomes "the account's".
 *
 * What it does, in order:
 *
 *  1. verifies the shopper's password in WordPress (the only place the hash lives)
 *     and gets back their WooCommerce customer id;
 *  2. mints a customer session with the app's own key;
 *  3. gives the browser the account's cart, carrying the guest cart into it, and
 *     writes the adopted cart token to the httpOnly cookie.
 *
 * The identity is taken **only** from the WordPress response. A customer id is never
 * read from the request body — a body-supplied id is one a browser could name, which
 * is how one shopper would end up wearing another's cart and wishlist.
 *
 * Cart adoption failure is reported, not fatal: the shopper stays signed in with the
 * cart this browser already had.
 */

import { NextResponse } from 'next/server';

import { createCustomerSession, isCustomerAuthConfigured } from '@/lib/auth/customerSession';
import { verifyWordPressCustomerCredentials } from '@/lib/auth/wordpressCustomerAuth';
import { readCartSession, writeCartSession } from '@/lib/cart/cookies';
import { adoptAccountCart } from '@/lib/cart/accountCart';

export async function POST(request: Request) {
  if (!isCustomerAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Customer sign-in is not configured on this deployment: set CUSTOMER_SESSION_SECRET in the server environment.',
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // `login` is the endpoint's own name for "email or username"; `email` is accepted
  // because that is what the sign-in form has always posted.
  const login = String(body.login ?? body.email ?? '').trim();
  const password = String(body.password ?? '');

  const verified = await verifyWordPressCustomerCredentials(login, password);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const customer = verified.customer;

  let session;
  try {
    session = await createCustomerSession({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
    });
  } catch (error) {
    console.error('Customer session could not be minted:', error);
    return NextResponse.json(
      { error: 'Signed in, but the session could not be created. Try again.' },
      { status: 500 }
    );
  }

  // The cart that follows the account. Best-effort by design: a WordPress that
  // cannot store the binding must not stop the shopper from signing in.
  const guest = await readCartSession();
  const adoption = await adoptAccountCart(customer.id, guest);
  if (adoption.error) console.warn('[customer-cart]', adoption.error);
  await writeCartSession(adoption.session);

  return NextResponse.json({
    token: session.token,
    expiresAt: session.payload.exp,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      username: customer.username,
    },
    cart: {
      adopted: adoption.error === null,
      merged: adoption.merged,
      error: adoption.error,
    },
  });
}
