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
import { checkRateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/http/clientIp';
import { signupAbuseSignal, signupRefusal } from '@/lib/auth/signupGuard';

/**
 * Sign-up is the one public endpoint on this site that *creates a record* in the
 * store, so it is the one a bot can use to fill the customer list — which is how
 * the store's 2,700-account list grew (see the census in
 * `docs/production/CUSTOMER-DATA-AUDIT-2026-10-11.md`). Three controls stand in the
 * way, and they are deliberately not the same control three times:
 *
 *   1. a shape check on the address, before WordPress is asked for anything;
 *   2. this per-IP budget, which is per-isolate Worker memory — it bounds one worker,
 *      not one shopper, and it refuses an obvious flood in the cheapest place there is;
 *   3. the durable budget in WordPress (`X-HK-Client-IP` above,
 *      `hk_storefront_signup_budget_check` in the plugin), which is the count that a
 *      caller cannot escape by arriving on a different isolate.
 */
const SIGNUP_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function POST(request: Request) {
  // Rate limit first: it costs nothing and it must apply even to a deployment
  // that cannot create accounts at all, because the attempt itself is the signal.
  const ip = clientIp(request);
  const rl = checkRateLimit(`signup:${ip}`, SIGNUP_RATE_LIMIT);
  if (!rl.allowed) {
    console.warn(`[signup] rate limited ${ip} (${SIGNUP_RATE_LIMIT.limit} per hour)`);
    return NextResponse.json(
      { error: 'Too many accounts have been created from this connection. Please try again later, or email support@himalayankoh.com and we will help you directly.' },
      { status: 429 }
    );
  }

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

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? body.fullName ?? '').trim();

  // Refused here rather than by WordPress, so an address that no customer could
  // own never becomes a user record at all. WordPress's own error would be a
  // 400 with an internal message, and the account would already exist.
  const refusal = signupRefusal(email);
  if (refusal) {
    console.warn(`[signup] refused ${refusal.code} from ${ip}`);
    return NextResponse.json({ error: refusal.message }, { status: 400 });
  }

  // Logged, not blocked. The junk accounts this store accumulated all looked like
  // this, but a real person can hold an address that looks random, so the pattern
  // is recorded as evidence and the account is still created.
  const signal = signupAbuseSignal(email);
  if (signal) console.warn(`[signup] abuse signal ${signal} from ${ip}`);

  const created = await createWordPressCustomer({ email, password, name, clientIp: ip });
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
