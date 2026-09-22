import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { verifyWordPressCustomerCredentials } from '@/lib/auth/wordpressCustomerAuth';

/**
 * Self-service account deletion — authorised with the new identity, and honest
 * about the one step that still has no implementation.
 *
 * ## What changed, and why the old body is gone
 *
 * This route used to authenticate a Supabase session and then delete the Supabase
 * auth user. Customer sign-in no longer mints a Supabase session — it mints a
 * **WooCommerce-keyed** one (`lib/auth/customerSession.ts`) — so that lookup could
 * only ever answer 401 to a shopper who was, in fact, signed in. The Supabase
 * deletion code was therefore unreachable, and it is deleted rather than left in
 * place looking live.
 *
 * ## Why it still cannot delete
 *
 * Deleting a customer means deleting a **WordPress user** (`wp_delete_user` and its
 * WooCommerce record). Only WordPress can do that: the app holds no database
 * credential for it, and it must not. So the request is authorised here exactly as a
 * real deletion will be — session, then the password re-checked in WordPress — and
 * the last step is reported by name instead of simulated.
 *
 * `/hk-storefront/v1/customer/delete` is the seam. When the plugin grows it, this
 * handler calls it, the plugin drops that owner's wishlist rows and cart binding in
 * the same request (it owns both tables), and the response becomes `{ success: true }`.
 */

const NOT_AVAILABLE_YET =
  'Deleting an account is not available yet. It needs the WordPress customer-delete route ' +
  '(hk-storefront/v1/customer/delete), which does not exist yet — ask support to close the account instead.';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`account-delete:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const verified = await verifyCustomerRequest(request);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  const password = typeof record.password === 'string' ? record.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }
  if (email !== verified.customer.email) {
    return NextResponse.json({ error: 'Email does not match this account.' }, { status: 403 });
  }

  // Re-check the password in WordPress — the session proves the caller is signed in,
  // but a deletion should require the credential itself, not just the token. The
  // check goes through the same plugin route sign-in uses, so "wrong password" and
  // "the plugin is not active" stay distinguishable.
  const check = await verifyWordPressCustomerCredentials(email, password);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  return NextResponse.json({ error: NOT_AVAILABLE_YET }, { status: 501 });
}
