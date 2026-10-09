/**
 * The signed-in customer's saved addresses.
 *
 * This route is the authorisation boundary, and the reason the WordPress
 * endpoints behind it can stay administrator-only: the customer id comes from the
 * caller's verified session (`lib/auth/customerRequest.ts`), never from the
 * request body. A body-supplied id would let one shopper read or delete another
 * shopper's addresses by naming them.
 *
 * `GET` returns the list, `POST` saves a new one. One address is addressed by id
 * under `/api/account/addresses/<id>`.
 *
 * These rows used to be read and written straight from the browser against
 * Supabase. They were also, as it turned out, unreachable: the query filtered on a
 * Supabase user id that sign-in no longer produces, so an address list was always
 * empty and a save was never seen again. The identity is now the WooCommerce
 * customer id carried by the session.
 */

import { NextResponse } from 'next/server';

import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { AddressError, createAddress, listAddresses } from '@/lib/account/addressStore';
import { readAddressInput } from '@/lib/account/addressInput';
import { publicMessage } from '@/lib/http/publicError';

export const dynamic = 'force-dynamic';

/** How many addresses one account may keep — a cap, not a feature. */
const MAX_ADDRESSES = 20;

/**
 * The address failure a browser may see.
 *
 * `AddressError` names the WordPress credential to check when one was refused, which
 * is exactly what must not leave the server; see `@/lib/http/publicError`.
 */
function failure(error: unknown, fallback: string) {
  if (error instanceof AddressError) {
    return NextResponse.json(
      { error: publicMessage({ internal: error.message, fallback, context: 'addresses' }) },
      { status: error.status }
    );
  }
  console.error('Address request failed:', error);
  return NextResponse.json({ error: fallback }, { status: 502 });
}

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    return NextResponse.json({ addresses: await listAddresses(auth.customer.id) });
  } catch (error) {
    return failure(error, 'Your saved addresses could not be loaded right now.');
  }
}

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = readAddressInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    // Checked here rather than in the plugin so the customer gets a sentence
    // about their own account rather than a database refusal. The list is read
    // once per save, which is one request for an action a human just took.
    const existing = await listAddresses(auth.customer.id);
    if (existing.length >= MAX_ADDRESSES) {
      return NextResponse.json(
        { error: `You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.` },
        { status: 409 }
      );
    }

    const address = await createAddress(auth.customer.id, parsed.value);
    return NextResponse.json({ address }, { status: 201 });
  } catch (error) {
    return failure(error, 'Your address could not be saved right now.');
  }
}
