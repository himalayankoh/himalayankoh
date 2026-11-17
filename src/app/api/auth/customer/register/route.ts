/**
 * Customer sign-up.
 *
 * Creates a WooCommerce customer through WordPress (`wc_create_new_customer`
 * inside the plugin) and stops there: the account starts **unconfirmed**, so this
 * route deliberately mints no session. The browser gets a "check your inbox"
 * answer, and `/api/auth/customer/login` refuses the new account until the link
 * WordPress emailed has been opened.
 *
 * That is the whole gate. Because there is no token, there is nothing for
 * `/account`, `/orders` or `/wishlist` to accept — the redirect that used to land a
 * brand-new shopper on their dashboard is now impossible rather than merely
 * discouraged.
 *
 * What it still does *not* do is create a second identity anywhere: there is no
 * Supabase user and no profile row. The WordPress user is the account, and the
 * WooCommerce customer id it produces is what the cart and wishlist are keyed by.
 *
 * A guest cart is left alone until the shopper signs in after confirming — the
 * adoption happens in the login route, which is the first moment there is an
 * account to adopt it into.
 */

import { NextResponse } from 'next/server';

import { isCustomerAuthConfigured } from '@/lib/auth/customerSession';
import { createWordPressCustomer, customerAccountsUnavailable } from '@/lib/auth/wordpressCustomerAuth';
import { publicMessage } from '@/lib/http/publicError';
import { checkRateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/http/clientIp';
import { signupAbuseSignal, signupRefusal } from '@/lib/auth/signupGuard';
import { SITE_ORIGIN } from '@/lib/site/origin';

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
      { error: 'Too many accounts have been created from this connection. Please try again later, or email ws@himalayankoh.com and we will help you directly.' },
      { status: 429 }
    );
  }

  if (!isCustomerAuthConfigured()) {
    // A stranger reaches this route, so the note naming the variable to set stays on
    // the server (`@/lib/http/publicError`) — the same boundary the credential
    // failures behind it use. It is still refused rather than allowed through: an
    // account that cannot later sign in is worse than a clear "try again".
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

  const created = await createWordPressCustomer({
    email,
    password,
    name,
    clientIp: ip,
    // The confirmation link has to come back to this storefront, and WordPress
    // cannot know a different origin on its own.
    origin: SITE_ORIGIN,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const customer = created.customer;

  return NextResponse.json(
    {
      verificationRequired: true,
      email: customer.email,
      // False means WordPress created the account but `wp_mail` refused the
      // confirmation message; the page tells the shopper to ask for help rather
      // than wait for mail that is not coming.
      verificationEmailSent: created.verificationEmailSent === true,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        username: customer.username,
      },
    },
    { status: 201 }
  );
}
