/**
 * Newsletter signup.
 *
 * The address is stored by WordPress now, in the `hk_newsletter_subscribers` table
 * behind `hk-storefront/v1/newsletter`, with a UNIQUE key on the email doing the
 * dedupe. That table used to be Supabase's `newsletter_subscribers`, and the write
 * lived here because a public form must not hold a server credential — the same
 * reason it still does.
 *
 * `success` means the address is on the list, and it is only returned after
 * WordPress accepted it: a signup that could not be stored answers 500 with a
 * readable message rather than a fake thank-you, because silently losing a
 * subscriber is the one failure this endpoint exists to prevent.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { newsletterApi } from '@/lib/wordpress/siteContent';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`newsletter:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  const source = typeof record.source === 'string' && record.source.trim()
    ? record.source.trim().slice(0, 100)
    : 'footer';

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }
  if (email.length > 300 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  try {
    // Idempotent subscribe: re-subscribing keeps the original row. `created` is
    // reported so a repeat signup is distinguishable from a new one.
    const created = await newsletterApi.subscribe(email, source);
    return NextResponse.json({ success: true, created });
  } catch (error) {
    console.error('Newsletter subscription failed:', error);
    return NextResponse.json(
      { error: 'Unable to subscribe. Please try again.' },
      { status: 500 }
    );
  }
}
