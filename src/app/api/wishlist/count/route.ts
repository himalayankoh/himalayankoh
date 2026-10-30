/**
 * How many products the signed-in customer has saved.
 *
 * Its own route rather than a query parameter on `/api/wishlist`: the account
 * dashboard shows a number, and counting by reading every saved product would pull
 * the catalog in to display one digit.
 */

import { NextResponse } from 'next/server';

import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { getErrorMessage } from '@/lib/errors';
import { publicMessage } from '@/lib/http/publicError';
import { WishlistError, wishlistCount } from '@/lib/wishlist/store';

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Sign in to view your wishlist.' }, { status: 401 });
  }

  try {
    // The owner is the WooCommerce customer id — see `/api/wishlist`.
    return NextResponse.json({ count: await wishlistCount(String(auth.customer.id)) });
  } catch (error) {
    if (error instanceof WishlistError) {
      // The count is a decoration on the dashboard, so the customer gets the same
      // shape of sentence the list gives them — never the credential note behind it
      // (see `@/lib/http/publicError`).
      return NextResponse.json(
        {
          error: publicMessage({
            internal: error.message,
            fallback: 'Your wishlist could not be counted right now.',
            context: 'wishlist-count',
          }),
        },
        { status: error.status }
      );
    }
    console.error('Wishlist count failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Your wishlist could not be counted right now.') },
      { status: 502 }
    );
  }
}
