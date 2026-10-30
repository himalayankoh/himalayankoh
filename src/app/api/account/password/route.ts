/**
 * Change the signed-in customer's password.
 *
 * Both halves belong to WordPress: the current password is re-checked with
 * `wp_authenticate` and the new one is written with `wp_set_password`, inside the
 * plugin. The app never holds either password and never writes a hash.
 *
 * This replaces the account portal's Supabase pair (`signInWithPassword`, then
 * `updateUser`), which had two problems: it stopped working the moment sign-in
 * moved to WordPress, and it put the new password through a second auth system
 * rather than through the one that stores the hash.
 *
 * The customer id is the session's, not the body's, and the plugin checks it
 * against the account the current password belongs to — so knowing somebody's
 * password is not a way to change their password from this route.
 */

import { NextResponse } from 'next/server';

import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { changeWordPressCustomerPassword } from '@/lib/auth/wordpressCustomerAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = checkRateLimit(`account-password:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');

  if (!currentPassword) {
    return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Choose a password of at least 8 characters.' },
      { status: 400 }
    );
  }

  const result = await changeWordPressCustomerPassword({
    customerId: auth.customer.id,
    // The session's own email, so the password is checked against the account that
    // is signed in rather than against whatever the form typed.
    login: auth.customer.email,
    currentPassword,
    newPassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
