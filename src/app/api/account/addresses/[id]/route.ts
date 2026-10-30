/**
 * One saved address: update it, mark it default, or delete it.
 *
 * The id in the path is the customer's address id, not a claim about who owns it:
 * the owner still comes from the verified session, and the plugin scopes every
 * statement to that customer. So a valid id belonging to somebody else is simply
 * not found — the same answer a nonexistent id gets, which is what keeps ids from
 * being probed across accounts.
 *
 * `PATCH` is also the set-default operation: sending `is_default_shipping: true`
 * makes this row the customer's default, and the plugin clears whichever row held
 * that flag. The invariant lives in the database layer because "exactly one
 * default" is a property of the whole set, not of one row.
 */

import { NextResponse } from 'next/server';

import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { AddressError, deleteAddress, updateAddress } from '@/lib/account/addressStore';
import { readAddressPatch } from '@/lib/account/addressInput';
import { publicMessage } from '@/lib/http/publicError';

export const dynamic = 'force-dynamic';

/** The one address failure a browser may see — same boundary as the list route. */
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

/** The path id, or null when it is not a positive integer. */
function parseId(raw: string | undefined): number | null {
  const id = Number(String(raw ?? '').trim());
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: 'A valid address id is required.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = readAddressPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    return NextResponse.json({ address: await updateAddress(auth.customer.id, id, parsed.value) });
  } catch (error) {
    return failure(error, 'Your address could not be updated right now.');
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: 'A valid address id is required.' }, { status: 400 });
  }

  try {
    // `deleted: false` is reported rather than hidden: a delete that removed
    // nothing is worth distinguishing from one that did.
    const removed = await deleteAddress(auth.customer.id, id);
    return NextResponse.json({ deleted: removed });
  } catch (error) {
    return failure(error, 'Your address could not be deleted right now.');
  }
}
