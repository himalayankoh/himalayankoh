/**
 * The signed-in customer's wishlist.
 *
 * This route is the authorisation boundary, and it is the reason the WordPress
 * endpoint behind it can stay administrator-only: the owner is taken from the
 * caller's verified session (`lib/auth/customerRequest.ts`), never from the
 * request body. So a browser cannot ask for somebody else's wishlist by naming
 * them — the only owner a caller can read or write is their own.
 *
 * The owner is the **WooCommerce customer id**, so the rows belong to a customer
 * the store recognises rather than to an application account that only this app
 * knew about. Signing in from another device finds the same list.
 *
 * The row → product join happens here too, because WordPress stores ids and the
 * catalog is what knows names and prices.
 */

import { NextResponse } from 'next/server';

import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { getErrorMessage } from '@/lib/errors';
import { publicMessage } from '@/lib/http/publicError';
import {
  WishlistError,
  addWishlistProduct,
  listWishlist,
  readWishlistProducts,
  removeWishlistProduct,
  wishlistProductIds,
  type WishlistItem,
} from '@/lib/wishlist/store';

/**
 * The wishlist failure a browser may see.
 *
 * `WishlistError` carries the sentence an operator needs — which of the two WordPress
 * credentials was refused — and this is the boundary where that stops being the
 * sentence a customer gets; see `@/lib/http/publicError`.
 */
function wishlistErrorResponse(error: unknown, fallback: string) {
  if (error instanceof WishlistError) {
    return NextResponse.json(
      { error: publicMessage({ internal: error.message, fallback, context: 'wishlist' }) },
      { status: error.status }
    );
  }
  console.error('Wishlist request failed:', error);
  return NextResponse.json({ error: getErrorMessage(error, fallback) }, { status: 502 });
}

/** WooCommerce product ids are positive integers; anything else cannot be stored. */
function parseProductId(raw: unknown): number | null {
  const id = Number(String(raw ?? '').trim());
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The saved rows, newest first, with products that still exist. */
async function listItems(owner: string): Promise<WishlistItem[]> {
  const rows = await listWishlist(owner);
  if (!rows.length) return [];

  const products = await readWishlistProducts(wishlistProductIds(rows));

  return rows.flatMap((row) => {
    const product = products.get(Number(row.product_id));
    // A product that no longer exists is dropped rather than rendered as a blank
    // card the customer cannot act on.
    if (!product) return [];
    return [
      { id: row.id, product_id: Number(row.product_id), created_at: row.created_at, product },
    ];
  });
}

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Sign in to view your wishlist.' }, { status: 401 });
  }
  const owner = String(auth.customer.id);

  try {
    return NextResponse.json({ items: await listItems(owner) });
  } catch (error) {
    return wishlistErrorResponse(error, 'Your wishlist could not be loaded right now.');
  }
}

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Sign in to save products.' }, { status: 401 });
  }
  const owner = String(auth.customer.id);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const productId = parseProductId(body.productId);
  if (productId === null) {
    return NextResponse.json({ error: 'A valid product is required.' }, { status: 400 });
  }

  const action = String(body.action ?? 'toggle');

  try {
    // `toggle` is resolved server-side on purpose. Doing it in the browser would
    // be a read followed by a write, and two clicks racing that way is how a
    // wishlist ends up disagreeing with itself.
    if (action === 'toggle') {
      const saved = wishlistProductIds(await listWishlist(owner));
      const isSaved = saved.includes(productId);
      if (isSaved) {
        await removeWishlistProduct(owner, productId);
        return NextResponse.json({ inWishlist: false });
      }
      await addWishlistProduct(owner, productId);
      return NextResponse.json({ inWishlist: true });
    }

    if (action === 'add') {
      await addWishlistProduct(owner, productId);
      return NextResponse.json({ inWishlist: true });
    }

    if (action === 'remove') {
      // `removed: false` means it was not saved — reported rather than hidden, so
      // a request that changed nothing is distinguishable from one that did.
      const removed = await removeWishlistProduct(owner, productId);
      return NextResponse.json({ inWishlist: false, removed });
    }

    return NextResponse.json({ error: 'Unknown wishlist action.' }, { status: 400 });
  } catch (error) {
    return wishlistErrorResponse(error, 'Your wishlist could not be updated right now.');
  }
}

