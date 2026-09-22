/**
 * Contact form.
 *
 * The message is stored by WordPress now, in `hk_contact_submissions` behind
 * `hk-storefront/v1/contact`. It used to be Supabase's `contact_submissions` table;
 * the write lived in this route then for the same reason it does now — a public form
 * must not hold a server credential.
 *
 * A message the owner never receives is worse than a visible error, so `success` is
 * returned only after WordPress stored the row, and a failure answers 500 with a
 * readable message plus a server-side log rather than a silent no-op.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { contactApi } from '@/lib/wordpress/siteContent';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`contact:${ip}`, { limit: 5, windowMs: 60_000 });
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
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  const phone = typeof record.phone === 'string' ? record.phone.trim() : '';
  const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';

  if (!name || !email || !subject || !message) {
    return NextResponse.json(
      { error: 'Name, email, subject, and message are required.' },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }

  try {
    await contactApi.submit({
      name: name.slice(0, 200),
      email: email.slice(0, 300),
      phone: phone.slice(0, 50),
      subject: subject.slice(0, 200),
      message: message.slice(0, 5000),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact form submission failed:', error);
    return NextResponse.json(
      { error: 'Failed to submit message. Please try again.' },
      { status: 500 }
    );
  }
}
