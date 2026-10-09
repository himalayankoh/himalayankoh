/**
 * The storefront cart, owned by WooCommerce.
 *
 * One route for the whole cart, because there is exactly one cart: reads, item
 * adds, quantity changes, removals and clearing all return the store's own cart
 * for that session. Two routes would have been two places holding the same
 * token in sync.
 *
 * The browser never sees the cart token (see `lib/cart/cookies.ts`), so this is
 * also the boundary that decides what a cart mutation may carry: a product id, a
 * variation option, a line key and a quantity. Notably **not a price** —
 * WooCommerce prices the line from the catalog, which is why the old
 * client-supplied `unit_price` (a cash figure written by the browser) is gone.
 *
 * The variation is the one new field (grain size, a real WooCommerce variation
 * axis). It is validated as a *shape* here and matched against the product by the
 * store: a pair naming an option the product does not sell is refused by
 * WooCommerce, so a forged option buys nothing and cannot change what is charged.
 */

import { NextResponse } from 'next/server';

import { readCartSession, writeCartSession } from '@/lib/cart/cookies';
import { saveAccountCart } from '@/lib/cart/accountCart';
import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import { publicMessage } from '@/lib/http/publicError';
import {
  NOT_CONFIGURED,
  StoreCartError,
  addStoreCartItem,
  clearStoreCart,
  mapStoreCart,
  readStoreCart,
  removeStoreCartItem,
  updateStoreCartItem,
  updateStoreCartCustomer,
  setStoreCartCoupon,
  type CartSession,
} from '@/lib/woo/storeCart';

// A cart is session-owned, including validation and upstream error responses.
function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return NextResponse.json(body, { ...init, headers });
}

type CartAction = 'add' | 'setQuantity' | 'remove' | 'clear' | 'updateCustomer' | 'setCoupon';

/** WooCommerce's own limit on an option's length (`varchar(191)` inside an index). */
const MAX_OPTION_LENGTH = 191;

/**
 * The variation a mutation names, or a refusal that says which part is wrong.
 *
 * Both halves are required: half an option is not an option, and passing it to the
 * store would produce a line the customer did not ask for.
 */
function readVariation(
  value: unknown
): { ok: true; variation: { attribute: string; value: string } | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, variation: undefined };

  const record = (typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const attribute = typeof record.attribute === 'string' ? record.attribute.trim() : '';
  const option = typeof record.value === 'string' ? record.value.trim() : '';

  if (!attribute || !option) {
    return { ok: false, error: 'A variation needs both an attribute and a value.' };
  }
  if (attribute.length > MAX_OPTION_LENGTH || option.length > MAX_OPTION_LENGTH) {
    return { ok: false, error: 'That variation option is not a value this store can use.' };
  }
  return { ok: true, variation: { attribute, value: option } };
}

function storeErrorResponse(error: unknown, fallback: string) {
  if (error instanceof StoreCartError) {
    // Only "no storefront backend configured" is reported as unavailable, which
    // is the one answer the browser handles by running without a server cart.
    // An unreachable store is a 502: demoting a live cart to localStorage on a
    // timeout would empty a shopper's cart and let them refill it with items the
    // server has never heard of.
    if (error.code === NOT_CONFIGURED) {
      // The browser acts on `code` — it is what switches the cart to its local copy —
      // but the sentence is still a response body, so it must not be the one that names
      // the variable to set; see `@/lib/http/publicError`.
      return privateJson(
        {
          error: publicMessage({
            internal: error.message,
            fallback: 'The store is not available right now.',
            context: 'cart',
          }),
          code: 'store_unavailable',
        },
        { status: 503 }
      );
    }
    // A 4xx from the store is an answer about *this* cart (the product is not
    // purchasable, the line is gone), so it is passed through as the client's
    // problem with the store's own wording. Anything else is our side failing.
    const clientFault = error.status >= 400 && error.status < 500;
    return privateJson(
      { error: publicMessage({ internal: error.message || fallback, fallback, context: 'cart' }) },
      { status: clientFault ? 400 : 502 }
    );
  }
  console.error('Cart request failed:', error);
  return privateJson({ error: fallback }, { status: 502 });
}

/**
 * The signed-in customer's id, when this request carries a customer session.
 *
 * Deliberately not a gate. Guests shop here too, and their cart lives in its cookie
 * exactly as before; this only decides whether the cart is *also* bound to an
 * account, which is what makes it follow the shopper to another device.
 *
 * Verification is offline (one signature check), so this costs no round trip on a
 * route the storefront polls.
 */
async function signedInCustomerId(request: Request): Promise<number | null> {
  const auth = await verifyCustomerRequest(request);
  return auth.ok ? auth.customer.id : null;
}

/**
 * Writes the cart cookie, and binds the cart to the account when there is one.
 *
 * The binding is saved on mutations rather than on reads: the token only needs to
 * be current, and a page that merely displays a cart should not write to WordPress.
 * A failure to save is logged and swallowed — the shopper's cart still works, it is
 * just this browser's again.
 */
async function respondWith(
  cart: Parameters<typeof mapStoreCart>[0],
  session: CartSession,
  customerId: number | null = null
) {
  await writeCartSession(session);
  if (customerId) {
    try {
      await saveAccountCart(customerId, session);
    } catch (error) {
      console.warn('[customer-cart] the cart binding could not be saved:', error);
    }
  }
  return privateJson(mapStoreCart(cart));
}

/** The current cart, creating one if this browser has none yet. */
export async function GET(request: Request) {
  try {
    const session = await readCartSession();
    const { cart, session: nextSession } = await readStoreCart(session);
    return await respondWith(cart, nextSession);
  } catch (error) {
    return storeErrorResponse(error, 'Your cart could not be loaded right now.');
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return privateJson({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action as CartAction;
  const session = await readCartSession();
  // Resolved once per request, then carried into every response this route makes.
  const customerId = await signedInCustomerId(request);
  const respond = (cart: Parameters<typeof mapStoreCart>[0], next: CartSession) =>
    respondWith(cart, next, customerId);

  try {
    if (action === 'add') {
      const productId = String(body.productId ?? '').trim();
      const quantity = Number(body.quantity ?? 1);
      const previousQuantity =
        typeof body.previousQuantity === 'number' && Number.isFinite(body.previousQuantity) && body.previousQuantity >= 0
          ? body.previousQuantity
          : undefined;
      if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
        return privateJson(
          { error: 'A product and a positive whole-number quantity are required.' },
          { status: 400 }
        );
      }
      const variation = readVariation(body.variation);
      if (!variation.ok) {
        return privateJson({ error: variation.error }, { status: 400 });
      }

      const { cart, session: next } = await addStoreCartItem(
        session,
        productId,
        quantity,
        variation.variation,
        { previousQuantity }
      );
      return await respond(cart, next);
    }

    if (action === 'setQuantity') {
      const key = String(body.key ?? '').trim();
      const quantity = Number(body.quantity ?? 0);
      if (!key) {
        return privateJson({ error: 'A cart line is required.' }, { status: 400 });
      }
      if (!Number.isInteger(quantity)) {
        return privateJson({ error: 'A whole-number quantity is required.' }, { status: 400 });
      }
      // Zero and below mean "remove": WooCommerce rejects a zero quantity rather
      // than treating it as a deletion, and the UI's minus button is the same
      // gesture at 1 either way.
      const { cart, session: next } =
        quantity <= 0
          ? await removeStoreCartItem(session, key)
          : await updateStoreCartItem(session, key, quantity);
      return await respond(cart, next);
    }

    if (action === 'remove') {
      const key = String(body.key ?? '').trim();
      if (!key) {
        return privateJson({ error: 'A cart line is required.' }, { status: 400 });
      }
      const { cart, session: next } = await removeStoreCartItem(session, key);
      return await respond(cart, next);
    }

    if (action === 'clear') {
      const { cart, session: next } = await clearStoreCart(session);
      return await respond(cart, next);
    }

    if (action === 'setCoupon') {
      const rawCode = body.code;
      const code = rawCode === null || rawCode === undefined ? null : String(rawCode).trim();
      if (code && (code.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(code))) {
        return privateJson({ error: 'Enter a valid coupon code.' }, { status: 400 });
      }
      const { cart, session: next } = await setStoreCartCoupon(session, code);
      return await respond(cart, next);
    }

    if (action === 'updateCustomer') {
      const address = (typeof body.address === 'object' && body.address ? body.address : {}) as {
        country?: string;
        state?: string;
        city?: string;
        postalCode?: string;
      };
      const { cart, session: next } = await updateStoreCartCustomer(session, address);
      return await respond(cart, next);
    }

    return privateJson({ error: 'Unknown cart action.' }, { status: 400 });
  } catch (error) {
    return storeErrorResponse(error, 'Your cart could not be updated right now.');
  }
}
