/**
 * The storefront cart's cookies — the only place the WooCommerce `Cart-Token` and
 * its `Nonce` are read or written.
 *
 * ## Why cookies and not the client
 *
 * Before the migration the browser talked to Supabase directly and kept a session
 * id in localStorage. The WooCommerce cart cannot work that way here: mutations
 * require a CSRF nonce, and the checkout path has to read the *same* cart from the
 * server (to price an order, and from the Stripe webhook, which has no browser).
 * A cookie is the one place both the browser request and the server-side checkout
 * can see the same cart, so the token lives there and is `httpOnly`: the page
 * never holds a value it could tamper with, and a stolen token is not reachable
 * from JavaScript.
 *
 * Server-only. `next/headers` cannot be imported into a client component, which is
 * a structural guarantee rather than a convention.
 */

import { cookies } from 'next/headers';

/** The cart's identifier, as issued by WooCommerce. */
export const CART_COOKIE = 'hk_wc_cart';
/** The CSRF nonce required by cart mutations. */
export const CART_NONCE_COOKIE = 'hk_wc_cart_nonce';

/**
 * Two weeks. A WooCommerce cart token expires sooner than that (48 hours when
 * last checked), and an expired token is handled rather than prevented: the store
 * simply issues a new cart, and `readStoreCart` picks the new token up.
 */
const CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export interface CartCookieSession {
  cartToken: string | null;
  nonce: string | null;
}

/**
 * `secure` follows the protocol rather than NODE_ENV: the deployment is served
 * over HTTPS while local development is not, and a `secure` cookie silently
 * dropped on http:// is a cart that appears to reset on every request.
 */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

function clean(value: string | undefined): string | null {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : null;
}

/** The cart this request belongs to, if the browser has been issued one. */
export async function readCartSession(): Promise<CartCookieSession> {
  const jar = await cookies();
  return {
    cartToken: clean(jar.get(CART_COOKIE)?.value),
    nonce: clean(jar.get(CART_NONCE_COOKIE)?.value),
  };
}

/**
 * Stores the cart identity the store just handed back.
 *
 * Written on every cart response, not only when it changes: the nonce is rotated
 * as the store sees fit, and a stale one is what produces the 403 that
 * `storeCart` has to recover from.
 */
export async function writeCartSession(session: CartCookieSession): Promise<void> {
  const jar = await cookies();
  if (session.cartToken) jar.set(CART_COOKIE, session.cartToken, cookieOptions(CART_COOKIE_MAX_AGE_SECONDS));
  if (session.nonce) jar.set(CART_NONCE_COOKIE, session.nonce, cookieOptions(CART_COOKIE_MAX_AGE_SECONDS));
}

/** Forgets the cart. The store's own cart is left alone — it expires by itself. */
export async function clearCartSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(CART_COOKIE);
  jar.delete(CART_NONCE_COOKIE);
}
