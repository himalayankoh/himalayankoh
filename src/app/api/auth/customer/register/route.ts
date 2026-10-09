/**
 * Customer sign-up.
 *
 * Creates a WooCommerce customer through WordPress (`wc_create_new_customer`, inside
 * the plugin) and signs the new shopper straight in, in the same shape
 * `/api/auth/customer/login` answers with — so the browser has one code path for
 * "I now have a session".
 *
 * What it deliberately does not do is create a *second* identity anywhere: there is
 * no Supabase user, no separate profile row. The WordPress user is the account, and
 * the WooCommerce customer id it produces is what the cart and the wishlist are
 * keyed by.
 *
 * The new account gets the browser's existing cart, exactly as a sign-in does — a
 * shopper who built a cart and then created an account should not watch it empty.
 */

import { NextResponse } from 'next/server';

import { createCustomerSession, isCustomerAuthConfigured } from '@/lib/auth/customerSession';
import { createWordPressCustomer, customerAccountsUnavailable } from '@/lib/auth/wordpressCustomerAuth';
import { publicMessage } from '@/lib/http/publicError';
import { readCartSession, writeCartSession } from '@/lib/cart/cookies';
import { adoptAccountCart } from '@/lib/cart/accountCart';

export async function POST(request: Request) {
  if (!isCustomerAuthConfigured()) {
    // A stranger reaches this route, so the note naming the variable to set stays on
    // the server (`@/lib/http/publicError`) — the same boundary the credential
    // failures behind it use.
    return NextResponse.json(
      {
        error: publicMessage({
          internal:
            'Customer accounts are not available on this deployment: set CUSTOMER_SESSION_SECRET in the server environment.',
          fallback: customerAccountsUnavailable('account creation'),
          context: 'customer-auth',
        }),
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

  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const name = String(body.name ?? body.fullName ?? '').trim();

  const created = await createWordPressCustomer({ email, password, name });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const customer = created.customer;

  let session;
  try {
    session = await createCustomerSession({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
    });
  } catch (error) {
    console.error('Customer session could not be minted after signup:', error);
    return NextResponse.json(
      { error: 'The account was created, but the session could not be created. Sign in.' },
      { status: 500 }
    );
  }

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
