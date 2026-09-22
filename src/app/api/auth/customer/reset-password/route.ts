/**
 * "I forgot my password" — the completion half.
 *
 * The browser posts the `login` and `key` from the emailed link plus the new
 * password; the plugin validates the key with `check_password_reset_key()` (which
 * fails a key that is wrong, expired, or already used, so the token is single-use
 * by WordPress's design) and writes the password with `reset_password()`, which is
 * also what sends WordPress's own "your password changed" notice.
 *
 * Nothing about the token is verified here, and deliberately so: the app holds no
 * credential that can reset a password, and it never sees the half of the token
 * WordPress keeps on the user. Verifying in two places would just be a second
 * chance to get it wrong.
 *
 * It replaces `supabase.auth.updateUser`, which is why the page used to sit behind
 * a "your session is valid" gate: Supabase proved the link by having the *browser*
 * hold a recovery session. WordPress proves it with the key in the URL instead, so
 * the page needs no session and works in a browser that has never signed in — which
 * is the normal case for a reset link opened on a phone.
 */

import { NextResponse } from 'next/server';

import { resetWordPressCustomerPassword } from '@/lib/auth/wordpressCustomerAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = checkRateLimit(`reset-password:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const login = String(body.login ?? '').trim();
  const key = String(body.key ?? '').trim();
  const password = String(body.password ?? '');

  if (!login || !key) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired. Request a new one.' },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 });
  }

  const result = await resetWordPressCustomerPassword({ login, key, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, email: result.customer.email });
}
