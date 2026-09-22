/**
 * "I forgot my password" — the request half.
 *
 * WordPress owns this flow: the password hash is there, `get_password_reset_key()`
 * creates the token, and WordPress sends the mail. The only thing this app decides
 * is **where the link points**, because a headless storefront does not serve
 * `wp-login.php` and a link to it would dead-end the customer. That origin is
 * passed to the plugin, which is also why this route is the one that has to know it
 * — see `lib/site/origin.ts` for how the origin is resolved once, for the whole app.
 *
 * ## Why the answer is the same either way
 *
 * `{ sent: true }` is returned whether or not an account exists. This endpoint is
 * unauthenticated by necessity, so a different answer for "no such account" would
 * turn it into a way to ask the store who has an account here. The field means what
 * actually happened — the request was accepted — not that mail was delivered, which
 * depends on the host's mail configuration and is logged for the owner instead.
 *
 * It replaces a Supabase call (`supabase.auth.resetPasswordForEmail`) that had not
 * been able to send anything since customer sign-in stopped minting Supabase
 * sessions, so the page said "check your email" and no email was ever sent.
 */

import { NextResponse } from 'next/server';

import { requestWordPressPasswordReset } from '@/lib/auth/wordpressCustomerAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { SITE_ORIGIN } from '@/lib/site/origin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  // One request per address per minute, and a ceiling per caller: this route sends
  // mail, so it is the one place worth throttling even though it reveals nothing.
  const rate = checkRateLimit(`forgot-password:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many reset requests. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = String(body.email ?? body.login ?? '').trim();
  if (!email) {
    return NextResponse.json({ error: 'Enter the email address your account uses.' }, { status: 400 });
  }

  const result = await requestWordPressPasswordReset(email, SITE_ORIGIN);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sent: true });
}
