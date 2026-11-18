/**
 * Live address validation for a checkout.
 *
 * The second public route that calls Shippo, so it carries the same two guards as
 * `/api/shippo/rates` — same-site browsers only, and a per-client rate limit — for the
 * same reason: an anonymous caller must not be able to spend the store's carrier credit.
 * See that route for why a missing `Origin` is allowed through and why the limit is
 * per isolate rather than global.
 */

import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/http/clientIp';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { parseCheckoutAddress } from '@/lib/shippo/addressRequest';
import { resolveShippoConfigError } from '@/lib/shippo/config';
import { validateShippingAddress } from '@/lib/shippo/server/validateAddress';

/** Validations one client may make per minute. */
const VALIDATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
  }

  const limit = checkRateLimit(`shippo-validate:${clientIp(request)}`, VALIDATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many address checks. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const address = parseCheckoutAddress(record);
  if (!address) {
    return NextResponse.json(
      { error: 'Complete shipping address is required (name, street, city, state, postal code).' },
      { status: 400 },
    );
  }

  const email = typeof record.email === 'string' ? record.email.trim() : undefined;
  const configured = !(await resolveShippoConfigError());

  try {
    const result = await validateShippingAddress(address, email);
    return NextResponse.json({ configured, ...result });
  } catch (error) {
    console.error('Address validation failed:', error);
    const message = error instanceof Error ? error.message : 'Unable to validate address.';
    return NextResponse.json({ error: message, configured }, { status: 502 });
  }
}
