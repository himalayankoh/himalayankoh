/**
 * Confirms a customer's email address.
 *
 * The link WordPress emails carries `login` (which account) and `key` (the proof).
 * Both go to the plugin, which owns the token: a hashed key with a 48-hour expiry,
 * deleted once used. Nothing here decides whether a key is valid, and nothing here
 * mints a session — confirming an address makes the *next* sign-in succeed rather
 * than signing the shopper in from a link.
 *
 * That is deliberate. A link in an inbox is a bearer credential, and treating it
 * as a login would mean anyone who reads the message is signed in. Confirmation
 * and authentication stay separate.
 */

import { NextResponse } from 'next/server';

import { verifyWordPressCustomerEmail } from '@/lib/auth/wordpressCustomerAuth';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const login = String(body.login ?? body.email ?? '').trim();
  const key = String(body.key ?? body.token ?? '').trim();

  if (!login || !key) {
    return NextResponse.json(
      {
        error:
          'This confirmation link is missing its account or key. Request a new one by creating the account again, or email ws@himalayankoh.com.',
      },
      { status: 400 }
    );
  }

  const result = await verifyWordPressCustomerEmail({ login, key });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    verified: true,
    customer: {
      id: result.customer.id,
      email: result.customer.email,
      name: result.customer.name,
    },
  });
}
