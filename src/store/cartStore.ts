import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  CartRequestError,
  STORE_UNAVAILABLE,
  cartClient,
  type CartLineView,
  type CartView,
} from '../lib/cart/cartClient';

export interface CartItem {
  id: string;
  cartItemId?: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  /** The chosen option as a caption, e.g. `Coarse Grain`. */
  grainSize?: string;
  /**
   * The chosen option as the cart addresses it. Only a variable product has one,
   * and it comes from the catalog's own variation read rather than from the label —
   * the store matches this pair against the product and prices the line itself.
   */
  variation?: { attribute: string; value: string };
}

/**
 * The cart.
 *
 * The cart itself is WooCommerce's, held behind `/api/cart` (see
 * `lib/woo/storeCart.ts`); this module is the storefront's view of it. Two things
 * changed with that and both removed machinery rather than adding it:
 *
 *  - There is **one** cart per browser, not a guest cart and a user cart that had
 *    to be merged on sign-in. That retires the "which user was this loaded for"
 *    bookkeeping the old store needed to stop the guest load and the signed-in
 *    load racing each other.
 *  - Prices are the store's. Lines are mapped from what WooCommerce reports, so
 *    nothing here writes a price the shop has not agreed to.
 *
 * `mode` follows the server's answer, not a guess: only the server knows whether a
 * storefront backend is configured. It reports "no store" as `store_unavailable`,
 * which is the one failure that turns on the local demo cart below.
 */

let cartItems: CartItem[] = [];
const listeners: Set<() => void> = new Set();
const localCartKey = 'cart_items';

type CartMode = 'remote' | 'local' | null;

/** null until the first cart response says which backend is serving us. */
let mode: CartMode = null;
let loaded = false;
let isLoading = false;

// Serializes concurrent mutations so API calls don't interleave
let mutationQueue: Promise<void> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(fn);
  mutationQueue = next.then(() => {}, () => {});
  return next;
}

function emitChange() {
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return cartItems;
}

function getServerSnapshot() {
  return cartItems;
}

function getItemKey(id: string, grainSize?: string) {
  return `${id}:${grainSize || ''}`;
}

/* ------------------------------------------------------------------ */
/* Local demo cart — only when no storefront backend is configured     */
/* ------------------------------------------------------------------ */

function saveLocalCart() {
  if (mode !== 'local') return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(localCartKey, JSON.stringify(cartItems));
}

function readLocalCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(localCartKey);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as CartItem[];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* WooCommerce cart                                                    */
/* ------------------------------------------------------------------ */

function mapLine(line: CartLineView): CartItem {
  return {
    id: line.productId,
    cartItemId: line.key,
    name: line.name || 'Unknown Product',
    // Null means the store reported no price for the line. `prices.price` and a
    // line total are both always present on a real cart line, and the amount
    // charged is the store's own cart total, not this mirror — so 0 is the safe
    // arithmetic stand-in rather than a claim about the price.
    price: line.unitPrice ?? 0,
    image: line.image,
    quantity: line.quantity,
    // A variation line says which option it is; without this the drawer and the
    // order would show the same product twice with no way to tell them apart.
    grainSize: line.variationLabel ?? undefined,
  };
}

/**
 * Tells the UI about the store's own complaints (an item that went out of stock,
 * a quantity WooCommerce will not sell).
 *
 * The event is kept from the Supabase-era cart so the checkout page's existing
 * warning still fires; what it no longer claims is that the item was removed,
 * because nothing removes it — WooCommerce refuses the line at checkout instead,
 * and the customer can see and adjust it in their cart.
 */
function reportIssues(issues: string[]) {
  if (!issues.length || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('cart-validation-warning', { detail: issues.map((message) => ({ message })) })
  );
}

function applyView(view: CartView) {
  cartItems = view.items.map(mapLine);
  emitChange();
  reportIssues(view.issues);
}

function isStoreUnavailable(error: unknown): boolean {
  return error instanceof CartRequestError && error.code === STORE_UNAVAILABLE;
}

/**
 * Runs a cart request, or reports that there is no storefront backend.
 *
 * Returns null only for the "no store" answer, which switches the cart to local
 * mode. A timeout or a 5xx is re-thrown: quietly demoting a live cart to
 * localStorage would show a shopper an empty cart and let them fill it with items
 * the server has never heard of.
 */
async function remote(op: () => Promise<CartView>): Promise<CartView | null> {
  try {
    return await op();
  } catch (error) {
    if (isStoreUnavailable(error)) {
      mode = 'local';
      return null;
    }
    throw error;
  }
}

async function loadCart() {
  if (loaded || isLoading) return;
  isLoading = true;
  try {
    const view = await remote(() => cartClient.read());
    if (view) {
      mode = 'remote';
      applyView(view);
    } else {
      cartItems = readLocalCart();
      emitChange();
    }
    loaded = true;
  } catch (error) {
    // Leave the previous items in place: the cart is still whatever the server
    // last said, and a transient failure must not read as "your cart is empty".
    console.error('Failed to load cart:', error);
  } finally {
    isLoading = false;
  }
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    loadCart();
  }, []);

  const addItem = useCallback(async (item: Omit<CartItem, 'quantity' | 'cartItemId'>, quantity = 1) => {
    return enqueue(async () => {
      const productId = String(item.id);

      if (mode !== 'local') {
        const view = await remote(() => cartClient.add(productId, quantity, item.variation));
        if (view) {
          mode = 'remote';
          loaded = true;
          applyView(view);
          return;
        }
      }

      const existing = cartItems.find(
        ci => getItemKey(ci.id, ci.grainSize) === getItemKey(productId, item.grainSize)
      );
      if (existing) {
        existing.quantity += quantity;
        cartItems = [...cartItems];
      } else {
        cartItems = [...cartItems, { ...item, id: productId, quantity }];
      }
      saveLocalCart();
      emitChange();
    });
  }, []);

  const removeItem = useCallback(async (id: string, grainSize?: string) => {
    return enqueue(async () => {
      const item = cartItems.find(
        ci => getItemKey(ci.id, ci.grainSize) === getItemKey(id, grainSize)
      );

      if (mode !== 'local' && item?.cartItemId) {
        const view = await remote(() => cartClient.remove(item.cartItemId as string));
        if (view) {
          mode = 'remote';
          applyView(view);
          return;
        }
      }

      cartItems = cartItems.filter(
        ci => getItemKey(ci.id, ci.grainSize) !== getItemKey(id, grainSize)
      );
      saveLocalCart();
      emitChange();
    });
  }, []);

  const updateQuantity = useCallback(async (id: string, quantity: number, grainSize?: string) => {
    return enqueue(async () => {
      const item = cartItems.find(
        ci => getItemKey(ci.id, ci.grainSize) === getItemKey(id, grainSize)
      );

      if (mode !== 'local' && item?.cartItemId) {
        // Zero and below are a removal; the route maps them to WooCommerce's
        // remove-item rather than sending a quantity the store rejects.
        const view = await remote(() => cartClient.setQuantity(item.cartItemId as string, quantity));
        if (view) {
          mode = 'remote';
          applyView(view);
          return;
        }
      }

      if (quantity <= 0) {
        cartItems = cartItems.filter(
          ci => getItemKey(ci.id, ci.grainSize) !== getItemKey(id, grainSize)
        );
      } else {
        cartItems = cartItems.map(ci =>
          getItemKey(ci.id, ci.grainSize) === getItemKey(id, grainSize)
            ? { ...ci, quantity }
            : ci
        );
      }
      saveLocalCart();
      emitChange();
    });
  }, []);

  const clearCart = useCallback(async () => {
    return enqueue(async () => {
      if (mode !== 'local') {
        const view = await remote(() => cartClient.clear());
        if (view) {
          mode = 'remote';
          applyView(view);
          return;
        }
      }

      cartItems = [];
      saveLocalCart();
      emitChange();
    });
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
  };
}
