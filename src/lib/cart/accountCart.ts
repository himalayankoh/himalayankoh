/**
 * The cart that follows the account, not the browser.
 *
 * ## Why this is needed at all
 *
 * WooCommerce identifies a cart by an opaque `Cart-Token` issued per session, which
 * is per *browser*. Signing in used to change nothing: the shopper's cart on their
 * phone and on their laptop were two different carts, and the account they had just
 * used was not attached to either. WooCommerce's own persistent-cart feature works
 * at checkout, not for a headless Store API cart.
 *
 * The fix is to remember *which* cart belongs to a customer. The token stays
 * WooCommerce's; what this module adds is a `customer_id → cart_token` binding,
 * stored in WordPress (`hk-storefront/v1/cart-session`, table `hk_cart_sessions`)
 * so it is reachable from any device:
 *
 *   - signing in adopts the account's cart (and carries the guest cart into it);
 *   - every later cart request re-saves the token, so the binding is always the
 *     cart the shopper is actually looking at;
 *   - a second device signs in, adopts the same token, and sees the same cart.
 *
 * ## What it deliberately does not do
 *
 * It does not price, validate or reserve anything — that is WooCommerce's, which is
 * why the cart itself was moved to the Store API. Nor does it keep a copy of the
 * cart's contents: an inventory of a cart is a second source of truth that drifts
 * the first time stock moves. Only the token is stored.
 *
 * ## Failure is not fatal
 *
 * Every function here reaches WordPress over the network, and a failure must not
 * cost the shopper their cart. The callers log and carry on with the browser's
 * cart; the outcome is reported (`adopted: false`) rather than thrown.
 */

import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import {
  addStoreCartItem,
  mapStoreCart,
  readStoreCart,
  updateStoreCartItem,
  type CartSession,
} from '@/lib/woo/storeCart';

const NAMESPACE = '/hk-storefront/v1';
const TIMEOUT_MS = 15_000;

/** The token binding, as WordPress stores it. */
export interface AccountCart {
  cartToken: string;
  nonce: string;
  updatedAt: string | null;
}

/** The account's saved cart token, or null when they have never had one. */
export async function loadAccountCart(customerId: number): Promise<AccountCart | null> {
  const response = await wordpressRequest<{
    session?: { cartToken?: string; nonce?: string; updatedAt?: string } | null;
  }>(`${NAMESPACE}/cart-session`, {
    params: { customerId },
    credentials: requireWordPressCredentials(),
    timeoutMs: TIMEOUT_MS,
  });

  const session = response.session;
  const cartToken = String(session?.cartToken || '').trim();
  if (!cartToken) return null;

  return {
    cartToken,
    nonce: String(session?.nonce || '').trim(),
    updatedAt: session?.updatedAt ? String(session.updatedAt) : null,
  };
}

/** Binds the given cart to the customer, so their other devices can adopt it. */
export async function saveAccountCart(customerId: number, session: CartSession): Promise<boolean> {
  const cartToken = (session.cartToken || '').trim();
  // No token yet means the store has not issued a cart — nothing to remember.
  if (!cartToken) return false;

  await wordpressRequest(`${NAMESPACE}/cart-session`, {
    method: 'POST',
    body: { customerId, cartToken, nonce: (session.nonce || '').trim() },
    credentials: requireWordPressCredentials(),
    timeoutMs: TIMEOUT_MS,
  });
  return true;
}

/** Forgets the binding. The WooCommerce cart itself is left to expire on its own. */
export async function clearAccountCart(customerId: number): Promise<boolean> {
  const response = await wordpressRequest<{ deleted?: boolean }>(`${NAMESPACE}/cart-session`, {
    method: 'DELETE',
    params: { customerId },
    credentials: requireWordPressCredentials(),
    timeoutMs: TIMEOUT_MS,
  });
  return response.deleted === true;
}

export interface CartAdoption {
  /** The cart session the browser should carry from now on. */
  session: CartSession;
  /** Guest lines carried into the account cart. */
  merged: number;
  /** Why the account cart could not be adopted, when it could not. */
  error: string | null;
}

/**
 * Give the signed-in customer their cart.
 *
 * Three cases, and only the middle one is interesting:
 *
 *  1. The account has a cart, the browser had none — adopt it (the device the
 *     shopper just signed in on gets their cart back).
 *  2. The account has a cart *and* the browser had one — adopt the account's, with
 *     the guest lines carried in. For a product already in both, the quantity
 *     becomes the larger of the two rather than the sum: a shopper on two devices
 *     wants the amount they chose, not double because they were on two devices.
 *  3. The account has no cart yet — the guest cart *becomes* the account's, so it
 *     follows them from here on.
 *
 * The guest cart is only read when the browser actually has a token; reading a cart
 * "to see" mints one, which would leave an empty cart bound to the account.
 */
export async function adoptAccountCart(
  customerId: number,
  guest: CartSession
): Promise<CartAdoption> {
  try {
    const saved = await loadAccountCart(customerId);

    // Case 3, and the common one: the browser already has the cart that should
    // become the account's.
    if (!saved) {
      await saveAccountCart(customerId, guest);
      return { session: guest, merged: 0, error: null };
    }

    // The same cart on this browser — nothing to do, and re-adding its own lines
    // to itself would double them.
    if (guest.cartToken && guest.cartToken === saved.cartToken) {
      return { session: saved, merged: 0, error: null };
    }

    const accountCart = await readStoreCart(saved);
    let session = accountCart.session;
    let merged = 0;

    if (guest.cartToken) {
      const guestCart = await readStoreCart(guest);
      const accountLines = mapStoreCart(accountCart.cart).items;

      for (const line of guestCart.cart.items ?? []) {
        const productId = Number(line.id);
        const quantity = Number(line.quantity ?? 0);
        if (!Number.isFinite(productId) || productId <= 0 || quantity <= 0) continue;

        const existing = accountLines.find((item) => Number(item.productId) === productId);
        if (!existing) {
          const added = await addStoreCartItem(session, productId, quantity);
          session = added.session;
          merged += 1;
          continue;
        }
        if (existing.quantity >= quantity || !existing.editable) continue;

        const updated = await updateStoreCartItem(session, existing.key, quantity);
        session = updated.session;
        merged += 1;
      }
    }

    // Re-save: the store may have rotated the token during the merge, and the
    // binding must name the cart the shopper is looking at.
    await saveAccountCart(customerId, session);
    return { session, merged, error: null };
  } catch (error) {
    // The cart still works — it is just this browser's again. Reported so the
    // caller can say so rather than pretending the cart follows the account.
    return {
      session: guest,
      merged: 0,
      error: describeCartBindingFailure(error),
    };
  }
}

/** A readable reason the binding could not be used, for logs and the response. */
export function describeCartBindingFailure(error: unknown): string {
  if (error instanceof WordPressApiError) {
    if (error.code === 'rest_no_route' || error.status === 404) {
      return 'The account cart could not be used: the Himalayan Koh storefront plugin is not active on WordPress, so there is nowhere to store the cart binding.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'The account cart could not be used: WordPress refused the app credential.';
    }
    return `The account cart could not be used: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/WORDPRESS_ADMIN_(USER|APP_PASSWORD)/.test(message)) return message;
  return `The account cart could not be used: ${message}`;
}
