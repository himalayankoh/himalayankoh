/**
 * The browser's half of the cart.
 *
 * Every call is `fetch('/api/cart')`. The client holds no cart identity and no
 * price: the server owns the WooCommerce cart token (httpOnly cookie) and
 * WooCommerce owns what things cost, so this module is transport and nothing
 * else. It is deliberately thin — the previous cart client embedded a
 * localStorage session id, a Supabase query per operation and a client-supplied
 * unit price, which is exactly the surface this replaced.
 */

/** One cart line as `/api/cart` reports it. */
export interface CartLineView {
  key: string;
  productId: string;
  name: string;
  /** The chosen option in readable form (`Coarse Grain`), or null on a plain line. */
  variationLabel?: string | null;
  /** Unit price in major units, or null when the store reported none. */
  unitPrice: number | null;
  quantity: number;
  image: string;
  sku: string | null;
  editable: boolean;
  maxQuantity: number | null;
}

export interface CartView {
  items: CartLineView[];
  itemsCount: number;
  totalPrice: number | null;
  totalTax?: number | null;
  currency: string;
  /** WooCommerce's own complaints about this cart, as sentences. */
  issues: string[];
}

/**
 * `code: 'store_unavailable'` is the server saying there is no storefront backend
 * configured at all — the one answer that means "run without a server cart". Every
 * other failure is a real error and must not be mistaken for that, or a network
 * blip would silently move a shopper's cart into localStorage.
 */
export const STORE_UNAVAILABLE = 'store_unavailable';

export class CartRequestError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, code: string | null, status: number) {
    super(message);
    this.name = 'CartRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request(body?: Record<string, unknown>): Promise<CartView> {
  const response = await fetch('/api/cart', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as CartView & {
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    throw new CartRequestError(
      payload.error || 'Your cart could not be reached right now.',
      payload.code ?? null,
      response.status
    );
  }

  return payload;
}

export const cartClient = {
  /** The current cart. */
  read: () => request(),
  /**
   * Adds a product, or one of its variations. Quantity is the number of
   * *additional* units. The variation pair names an option the catalog reported; the
   * price is still the store's.
   */
  add: (
    productId: string,
    quantity: number,
    variation?: { attribute: string; value: string },
    previousQuantity?: number
  ) =>
    request({
      action: 'add',
      productId,
      quantity,
      ...(variation ? { variation } : {}),
      ...(previousQuantity !== undefined ? { previousQuantity } : {}),
    }),
  /** Sets a line's quantity. Zero or less removes it. */
  setQuantity: (key: string, quantity: number) => request({ action: 'setQuantity', key, quantity }),
  /** Removes a line. */
  remove: (key: string) => request({ action: 'remove', key }),
  /** Removes every line. */
  clear: () => request({ action: 'clear' }),
  /** Updates customer destination for authoritative tax recalculation. */
  updateCustomer: (address: { country?: string; state?: string; city?: string; postalCode?: string }) =>
    request({ action: 'updateCustomer', address }),
};
