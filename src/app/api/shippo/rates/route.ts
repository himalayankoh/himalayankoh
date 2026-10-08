/**
 * Live carrier rates for a checkout's cart.
 *
 * Public by necessity — a shopper must see shipping costs before they can pay — and
 * that makes this the one unauthenticated route in the storefront that **spends
 * money**. Every call is a live Shippo transaction against a live Shippo token, on a
 * Worker that is reachable at its `*.workers.dev` name before the cutover, so the two
 * guards below exist to bound what an anonymous caller can cost:
 *
 *   - **Same-site only, for browsers.** An `Origin` that is not this deployment nor the
 *     configured site origin is refused. That closes the "any page can ride this
 *     endpoint" hole: a request with no `Origin` at all is still allowed, because the
 *     app's own server, its scripts (`npm run check:shippo`) and a plain `curl` send
 *     none, and refusing those would break the checks that prove this route works.
 *   - **A per-client rate limit**, keyed on the address the edge recorded
 *     (`@/lib/http/clientIp`), so one caller cannot turn a public endpoint into a
 *     metered liability. The bucket is per Worker isolate, which is a real limit: it
 *     bounds a single source, and is documented as best-effort rather than sold as a
 *     global quota.
 *
 * Neither guard changes what a legitimate shopper or the packing checks see.
 */

import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/http/clientIp';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveShippoConfigError } from '@/lib/shippo/config';
import { UnsupportedPackingProductsError } from '@/lib/shippo/packing/errors';
import { fetchShippoRates } from '@/lib/shippo/server/rates';
import type { CheckoutShippingAddress, RatesLineItem } from '@/lib/shippo/types';

/** Rate requests one client may make per minute. A checkout needs a handful. */
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

function parseAddress(body: Record<string, unknown>): CheckoutShippingAddress | null {
  const address = body.address as Record<string, unknown> | undefined;
  if (!address) return null;

  const fullName = typeof address.fullName === 'string' ? address.fullName.trim() : '';
  const addressLine1 = typeof address.addressLine1 === 'string' ? address.addressLine1.trim() : '';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const state = typeof address.state === 'string' ? address.state.trim() : '';
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode.trim() : '';
  const country = typeof address.country === 'string' ? address.country.trim() : 'US';

  if (!fullName || !addressLine1 || !city || !state || !postalCode) {
    return null;
  }

  return {
    fullName,
    addressLine1,
    addressLine2: typeof address.addressLine2 === 'string' ? address.addressLine2.trim() : undefined,
    city,
    state,
    postalCode,
    country,
  };
}

function parseLineItems(body: Record<string, unknown>): RatesLineItem[] {
  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        productId: typeof row.productId === 'string' ? row.productId : undefined,
        quantity: Math.max(1, Math.floor(Number(row.quantity) || 0)),
        weightLbs: Number(row.weightLbs) > 0 ? Number(row.weightLbs) : undefined,
      };
    })
    .filter((item) => item.quantity > 0);
}

export async function POST(request: Request) {
  // Guards first: both are cheap, and neither should run after a paid API call could.
  const origin = request.headers.get('origin');
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
  }

  const limit = checkRateLimit(`shippo-rates:${clientIp(request)}`, RATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many rate requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) } },
    );
  }

  const configError = await resolveShippoConfigError();
  if (configError) {
    return NextResponse.json({ error: configError, configured: false }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const address = parseAddress(record);
  if (!address) {
    return NextResponse.json(
      { error: 'Complete shipping address is required (name, street, city, state, postal code).' },
      { status: 400 }
    );
  }

  const lineItems = parseLineItems(record);
  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'At least one cart item is required.' }, { status: 400 });
  }

  const email = typeof record.email === 'string' ? record.email.trim() : undefined;

  try {
    const rates = await fetchShippoRates({ toAddress: address, email, lineItems });
    return NextResponse.json({ configured: true, rates });
  } catch (error) {
    if (error instanceof UnsupportedPackingProductsError) {
      return NextResponse.json(
        {
          error: error.message,
          configured: true,
          unsupportedProducts: true,
          products: error.products,
          rates: [],
        },
        { status: 422 },
      );
    }
    console.error('Shippo rates fetch failed:', error);
    const message = error instanceof Error ? error.message : 'Unable to fetch shipping rates.';
    return NextResponse.json({ error: message, configured: true }, { status: 502 });
  }
}
