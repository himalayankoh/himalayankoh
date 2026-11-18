/**
 * Corrected-address suggestions for checkout.
 *
 * A carrier can refuse a complete address with "multiple addresses were found"
 * when the street was typed in a non-US order (`BLOCK DR 4027`). The validation
 * route correctly reports that, but an error alone leaves the shopper with no way
 * forward. This route asks the same validator about the safe standard layouts
 * (`4027 BLOCK DR`, an expanded suffix) and returns the ones that validate.
 *
 * Nothing here writes an address back: the browser shows the correction and the
 * shopper chooses whether to accept it, field by field or all at once.
 */

import { NextResponse } from 'next/server';

import {
  addressKey,
  buildAddressVariants,
  tidySuggestedAddress,
} from '@/lib/address/suggestions';
import { clientIp } from '@/lib/http/clientIp';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';
import { checkRateLimit } from '@/lib/rateLimit';
import { parseCheckoutAddress } from '@/lib/shippo/addressRequest';
import { resolveShippoConfigError } from '@/lib/shippo/config';
import { validateShippingAddress } from '@/lib/shippo/server/validateAddress';
import type { CheckoutShippingAddress } from '@/lib/shippo/types';

/** Suggestion lookups one client may make per minute. */
const SUGGESTION_LIMIT = { limit: 12, windowMs: 60_000 };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !isAllowedRequestOrigin(origin, request.url)) {
    return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
  }

  const limit = checkRateLimit(`shippo-suggest:${clientIp(request)}`, SUGGESTION_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many address checks. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
        },
      },
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
    const original = await validateShippingAddress(address, email);

    // A valid address is final. `recommendedAddress` (usually ZIP+4 or a corrected
    // suffix) is already shown by the existing "Did you mean" panel, so there is
    // nothing extra to ask the carrier for.
    if (original.isValid) {
      return NextResponse.json({ configured, original, suggestions: [] });
    }

    // The layout rules below are US conventions. A Canadian or other address is
    // left exactly as typed rather than being reordered into something the
    // carrier never asked for.
    if (!/^(?:us|usa|united states(?: of america)?)$/i.test(address.country.trim())) {
      return NextResponse.json({ configured, original, suggestions: [] });
    }

    const variants = buildAddressVariants(address).slice(1);
    const results = await Promise.allSettled(
      variants.map((variant) => validateShippingAddress(variant, email)),
    );

    const suggestions: CheckoutShippingAddress[] = [];
    const seen = new Set([addressKey(original.normalizedAddress)]);

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value.isValid) continue;

      const candidate = tidySuggestedAddress(
        result.value.recommendedAddress || result.value.normalizedAddress,
      );
      const key = addressKey(candidate);
      if (seen.has(key)) continue;

      seen.add(key);
      suggestions.push(candidate);
    }

    return NextResponse.json({ configured, original, suggestions });
  } catch (error) {
    console.error('Address suggestion lookup failed:', error);
    const message = error instanceof Error ? error.message : 'Unable to check this address.';
    return NextResponse.json({ error: message, configured }, { status: 502 });
  }
}
