/**
 * Wholesale account applications — the public door, and the only unauthenticated
 * write in the wholesale subsystem.
 *
 * ## Why it is a route of its own rather than a generic record write
 *
 * A visitor must be able to apply without an account, and the plugin's record
 * endpoint requires an administrator credential. So this route is the only place a
 * member of the public can cause a wholesale row to exist, and it is therefore the
 * one place that has to be careful:
 *
 *   - it accepts a *fixed* set of business fields, so no other column (status,
 *     account_id, decided_by) can be set by the applicant;
 *   - it rate-limits per client, because the alternative is an open write that a
 *     script can fill with junk;
 *   - it never returns another applicant's data. A re-submission for an email that
 *     is already pending returns that application's reference — which the applicant
 *     already knows, because they just supplied the email it belongs to.
 *
 * The application arrives `PENDING`. Nothing here can approve anything: approval is
 * an admin action (`/api/admin/wholesale/decide`) that requires a console session.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { submitWholesaleApplication } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

/** The fields an applicant may set. Anything else in the body is dropped. */
const APPLICANT_FIELDS = [
  'company',
  'contact_name',
  'email',
  'phone',
  'country',
  'website',
  'business_type',
  'monthly_volume',
  'annual_volume',
  'interested_products',
  'logistics_mode',
  'destination_country',
  'destination_port',
  'notes',
  'billing_address',
] as const;

/** Which of those the plugin treats as required. Mirrors the plugin's own check. */
const REQUIRED_FIELDS: ReadonlyArray<(typeof APPLICANT_FIELDS)[number]> = [
  'company',
  'contact_name',
  'email',
  'country',
  'business_type',
];

const BUSINESS_TYPES = new Set(['reseller', 'distributor', 'importer', 'business', 'other']);
const LOGISTICS_MODES = new Set(['pallet', 'container', 'either']);

/** Longest accepted value per field — an application is a form, not a file upload. */
const MAX_LENGTH = 500;

/**
 * The rate-limit key: the caller's address.
 *
 * `cf-connecting-ip` first, because on this deployment Cloudflare sets it at the edge
 * and a client cannot forge it — `x-forwarded-for` is a client-supplied header and is
 * only the fallback for a direct/local request. Keying on a header a caller controls
 * would make the limit advisory rather than real.
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip =
    request.headers.get('cf-connecting-ip') ||
    forwarded.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `wholesale-apply:${ip}`;
}

/** A trimmed string, or '' — never an object smuggled into a text column. */
function field(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_LENGTH);
}

export async function POST(request: Request) {
  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const limit = checkRateLimit(clientKey(request), { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many applications from this connection. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const payload: Record<string, string> = {};
  for (const name of APPLICANT_FIELDS) {
    const value = field(body[name]);
    if (value) payload[name] = value;
  }

  const missing = REQUIRED_FIELDS.filter((name) => !payload[name]);
  if (missing.length) {
    return NextResponse.json(
      { error: `Please complete: ${missing.map((name) => name.replace(/_/g, ' ')).join(', ')}.` },
      { status: 400 }
    );
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
    return NextResponse.json({ error: 'Enter a valid business email address.' }, { status: 400 });
  }
  if (payload.business_type && !BUSINESS_TYPES.has(payload.business_type)) {
    return NextResponse.json({ error: 'Choose one of the listed business types.' }, { status: 400 });
  }
  if (payload.logistics_mode && !LOGISTICS_MODES.has(payload.logistics_mode)) {
    return NextResponse.json({ error: 'Choose a pallet, container or either preference.' }, { status: 400 });
  }

  try {
    const result = await submitWholesaleApplication(payload);
    return NextResponse.json(
      {
        submitted: true,
        reference: result.reference,
        status: String(result.record.status ?? 'PENDING'),
        message:
          'Your application is with our wholesale team. We will reply to the business email you supplied.',
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The application could not be submitted.';
    // The plugin's own refusal (an email that already holds an approved account)
    // is a real answer for the applicant, so it is passed on rather than flattened.
    const status = /already holds an approved wholesale account/i.test(message) ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
