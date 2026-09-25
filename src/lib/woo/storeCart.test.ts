import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

// Set before the config module is imported: the WordPress base URL is resolved
// once, at module load.
vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
});

import {
  StoreCartError,
  addStoreCartItem,
  clearStoreCart,
  lineUnitPrice,
  mapStoreCart,
  mapStoreCartLine,
  readableVariationValue,
  readStoreCart,
  type StoreCartItemRaw,
} from './storeCart';

const realFetch = globalThis.fetch;

/** A JSON response with optional headers, for the hand-rolled fetch cases. */
function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/** A cart line shaped the way the Store API actually sends one. */
function cartLine(overrides: Partial<StoreCartItemRaw> = {}): StoreCartItemRaw {
  return {
    key: 'a1b2c3',
    id: 2493,
    quantity: 2,
    name: 'Himalayan Salt Coarse Grain — 6 lbs',
    sku: 'HK-SFL-C-6lbs ',
    images: [{ src: 'https://cdn.test/6lbs.webp', thumbnail: 'https://cdn.test/6lbs-573.webp' }],
    prices: { price: '1995', currency_minor_unit: 2, currency_code: 'USD' },
    totals: { line_total: '3990', currency_minor_unit: 2 },
    quantity_limits: { minimum: 1, maximum: 9999, editable: true },
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('lineUnitPrice', () => {
  it('reads the major-unit price from WooCommerce minor units', () => {
    expect(lineUnitPrice(cartLine())).toBe(19.95);
  });

  it('honours a zero-decimal currency instead of dividing by 100', () => {
    const line = cartLine({ prices: { price: '1995', currency_minor_unit: 0 } });
    expect(lineUnitPrice(line)).toBe(1995);
  });

  it('falls back to the line total when no unit price is reported', () => {
    const line = cartLine({ prices: {}, totals: { line_total: '3990', currency_minor_unit: 2 } });
    expect(lineUnitPrice(line)).toBe(19.95);
  });

  it('reports null rather than 0 when the store reported no price at all', () => {
    // A free product and an unreported price are different facts, and only one of
    // them is a claim the store made.
    const line = cartLine({ prices: {}, totals: {} });
    expect(lineUnitPrice(line)).toBeNull();
  });
});

describe('mapStoreCartLine', () => {
  it('prefers the full image over the thumbnail', () => {
    expect(mapStoreCartLine(cartLine()).image).toBe('https://cdn.test/6lbs.webp');
  });

  it('falls back to the thumbnail when there is no full-size source', () => {
    const line = cartLine({ images: [{ thumbnail: 'https://cdn.test/only-thumb.webp' }] });
    expect(mapStoreCartLine(line).image).toBe('https://cdn.test/only-thumb.webp');
  });

  it('carries string ids, because they are used as keys and sent in URLs', () => {
    const mapped = mapStoreCartLine(cartLine());
    expect(mapped.productId).toBe('2493');
    expect(mapped.key).toBe('a1b2c3');
  });

  it('reports which option a variation line carries', () => {
    const line = mapStoreCartLine(
      cartLine({ variation: [{ attribute: 'pa_grain-size', value: 'coarse-grain' }] })
    );

    // The cart reports the term slug; the caption is the shopper's word for it.
    expect(line.variationLabel).toBe('Coarse Grain');
  });

  it('leaves the caption off a plain line and off an unnamed option', () => {
    expect(mapStoreCartLine(cartLine()).variationLabel).toBeNull();
    expect(mapStoreCartLine(cartLine({ variation: [{ attribute: 'pa_grain-size' }] })).variationLabel).toBeNull();
    expect(
      mapStoreCartLine(cartLine({ variation: [{ value: '   ' }] })).variationLabel
    ).toBeNull();
  });

  it('keeps an option the store already capitalised as the store wrote it', () => {
    expect(readableVariationValue('Coarse Grain')).toBe('Coarse Grain');
    expect(readableVariationValue('rock_chunk')).toBe('Rock Chunk');
  });

  it('joins two options when a line carries more than one axis', () => {
    const line = mapStoreCartLine(
      cartLine({
        variation: [
          { attribute: 'pa_grain-size', value: 'coarse-grain' },
          { attribute: 'pa_pack', value: '9' },
        ],
      })
    );

    expect(line.variationLabel).toBe('Coarse Grain / 9');
  });

  it('trims the SKU and treats an empty one as absent', () => {
    expect(mapStoreCartLine(cartLine()).sku).toBe('HK-SFL-C-6lbs');
    expect(mapStoreCartLine(cartLine({ sku: '   ' })).sku).toBeNull();
  });

  it('does not present a line as editable when the store did not say so', () => {
    expect(mapStoreCartLine(cartLine({ quantity_limits: undefined })).editable).toBe(false);
    expect(mapStoreCartLine(cartLine()).editable).toBe(true);
  });

  it('reports no maximum when the store stated none', () => {
    expect(mapStoreCartLine(cartLine({ quantity_limits: { maximum: 0 } })).maxQuantity).toBeNull();
    expect(mapStoreCartLine(cartLine()).maxQuantity).toBe(9999);
  });
});

describe('mapStoreCart', () => {
  it('uses the store\u2019s own count rather than summing the lines', () => {
    const view = mapStoreCart({ items: [cartLine()], items_count: 7 });
    expect(view.itemsCount).toBe(7);
  });

  it('sums the lines only when the store reports no count', () => {
    const view = mapStoreCart({ items: [cartLine(), cartLine({ key: 'zz', quantity: 3 })] });
    expect(view.itemsCount).toBe(5);
  });

  it('carries the store\u2019s total and currency', () => {
    const view = mapStoreCart({
      items: [cartLine()],
      totals: { total_price: '4585', currency_code: 'USD', currency_minor_unit: 2 },
    });
    expect(view.totalPrice).toBe(45.85);
    expect(view.currency).toBe('USD');
  });

  it('passes the store\u2019s own cart errors through as sentences', () => {
    const view = mapStoreCart({
      items: [cartLine()],
      errors: [{ code: 'woocommerce_rest_cart_product_no_stock', message: 'Sorry, we do not have enough stock.' }],
    });
    expect(view.issues).toEqual(['Sorry, we do not have enough stock.']);
  });

  it('maps an empty cart without inventing items', () => {
    const view = mapStoreCart({});
    expect(view.items).toEqual([]);
    expect(view.itemsCount).toBe(0);
    expect(view.totalPrice).toBeNull();
  });
});

describe('cart transport', () => {
  it('sends the cart token it was given and keeps the origin\u2019s install path', async () => {
    const stub = useWordPress([
      {
        path: '/wc/store/v1/cart',
        body: { items: [] },
        headers: { 'cart-token': 'rotated-token', nonce: 'nonce-2' },
      },
    ]);

    const result = await readStoreCart({ cartToken: 'token-1', nonce: null });

    expect(stub.callsTo('/wc/store/v1/cart')[0].url).toContain('/staging/wp-json/wc/store/v1/cart');
    expect(stub.callsTo('/wc/store/v1/cart')[0].headers['Cart-Token']).toBe('token-1');
    // The token is rotated by the store, so the caller must adopt the new one or
    // the next request is a different cart.
    expect(result.session).toEqual({ cartToken: 'rotated-token', nonce: 'nonce-2' });
  });

  it('sends only a product id and quantity on add — never a price', async () => {
    const stub = useWordPress([
      { path: '/wc/store/v1/cart/add-item', method: 'POST', body: { items: [] } },
    ]);

    await addStoreCartItem({ cartToken: 'token-1', nonce: 'nonce-1' }, '2493', 2);

    const call = stub.callsTo('/wc/store/v1/cart/add-item', 'POST')[0];
    expect(call.headers.Nonce).toBe('nonce-1');
    expect(call.body).toEqual({ id: 2493, quantity: 2 });
  });

  it('names the chosen variation on add, and only for a variable product', async () => {
    const stub = useWordPress([
      { path: '/wc/store/v1/cart/add-item', method: 'POST', body: { items: [] } },
    ]);

    await addStoreCartItem({ cartToken: 'token-1', nonce: 'nonce-1' }, '2492', 1, {
      attribute: 'pa_grain-size',
      value: 'coarse-grain',
    });

    // The parent id plus the option: WooCommerce prices and validates the pair, so
    // nothing here decides what is charged.
    expect(stub.callsTo('/wc/store/v1/cart/add-item', 'POST')[0].body).toEqual({
      id: 2492,
      quantity: 1,
      variation: [{ attribute: 'pa_grain-size', value: 'coarse-grain' }],
    });
  });

  it('omits the variation entirely when half of a pair arrives', async () => {
    const stub = useWordPress([
      { path: '/wc/store/v1/cart/add-item', method: 'POST', body: { items: [] } },
    ]);

    await addStoreCartItem({ cartToken: 'token-1', nonce: 'nonce-1' }, '2492', 1, {
      attribute: 'pa_grain-size',
      value: '   ',
    });

    // Half an option is not an option; sending it would add a line the shopper did
    // not ask for.
    expect(stub.callsTo('/wc/store/v1/cart/add-item', 'POST')[0].body).toEqual({
      id: 2492,
      quantity: 1,
    });
  });

  it('recovers from an expired nonce by re-reading the cart and retrying once', async () => {
    const attempts: Array<Record<string, string>> = [];
    globalThis.fetch = async (input: unknown, init?: unknown) => {
      const path = new URL(String(input)).pathname.replace(/^.*\/wp-json/, '');
      const headers = ((init as { headers?: Record<string, string> })?.headers ?? {}) as Record<string, string>;

      if (path.endsWith('/cart/add-item')) {
        attempts.push(headers);
        // First attempt carries the nonce the cookie still held, which has expired.
        if (attempts.length === 1) {
          return jsonResponse(
            { code: 'woocommerce_rest_invalid_nonce', message: 'Nonce is invalid.', data: { status: 403 } },
            403
          );
        }
        return jsonResponse({ items: [] }, 201, { 'cart-token': 'token-1', nonce: 'fresh-nonce' });
      }
      // The recovery read hands back a usable nonce.
      return jsonResponse({ items: [] }, 200, { nonce: 'fresh-nonce' });
    };

    const result = await addStoreCartItem({ cartToken: 'token-1', nonce: 'stale-nonce' }, '2493', 3);

    expect(attempts).toHaveLength(2);
    expect(attempts[0].Nonce).toBe('stale-nonce');
    expect(attempts[1].Nonce).toBe('fresh-nonce');
    expect(result.session.nonce).toBe('fresh-nonce');
  });

  it('recovers from a missing nonce (HTTP 400 woocommerce_rest_missing_nonce) by re-reading cart and retrying', async () => {
    const attempts: Array<Record<string, string>> = [];
    globalThis.fetch = async (input: unknown, init?: unknown) => {
      const path = new URL(String(input)).pathname.replace(/^.*\/wp-json/, '');
      const headers = ((init as { headers?: Record<string, string> })?.headers ?? {}) as Record<string, string>;

      if (path.endsWith('/cart/add-item')) {
        attempts.push(headers);
        if (attempts.length === 1) {
          return jsonResponse(
            { code: 'woocommerce_rest_missing_nonce', message: 'Missing the Nonce header. This endpoint requires a valid nonce.', data: { status: 400 } },
            400
          );
        }
        return jsonResponse({ items: [] }, 201, { 'cart-token': 'token-1', nonce: 'fresh-nonce' });
      }
      return jsonResponse({ items: [] }, 200, { nonce: 'fresh-nonce' });
    };

    const result = await addStoreCartItem({ cartToken: 'token-1', nonce: null }, '2493', 1);

    expect(attempts).toHaveLength(2);
    expect(attempts[0].Nonce).toBeUndefined();
    expect(attempts[1].Nonce).toBe('fresh-nonce');
    expect(result.session.nonce).toBe('fresh-nonce');
  });

  it('names the endpoint and flags a WordPress PHP fatal rather than reporting a JSON error', async () => {
    useWordPress([
      {
        path: '/wc/store/v1/cart',
        status: 500,
        raw: '<!DOCTYPE html><html><body><p>There has been a critical error on this website.</p></body></html>',
      },
    ]);

    await expect(readStoreCart({ cartToken: 'token-1', nonce: null })).rejects.toMatchObject({
      name: 'StoreCartError',
      isWordPressFatal: true,
      path: '/wc/store/v1/cart',
    });
  });

  it('reports an unreachable store as a plain error, not a fatal', async () => {
    globalThis.fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    const error = await readStoreCart({ cartToken: 'token-1', nonce: null }).catch((err) => err);
    expect(error).toBeInstanceOf(StoreCartError);
    expect((error as StoreCartError).isWordPressFatal).toBe(false);
    expect((error as StoreCartError).message).toContain('could not be reached');
  });
});

describe('clearStoreCart', () => {
  it('removes the lines the store reports, one at a time', async () => {
    const stub = useWordPress([
      {
        path: '/wc/store/v1/cart',
        body: { items: [cartLine({ key: 'k1' }), cartLine({ key: 'k2' })] },
        headers: { nonce: 'fresh-nonce' },
      },
      { path: '/wc/store/v1/cart/remove-item', method: 'POST', body: { items: [] } },
    ]);

    await clearStoreCart({ cartToken: 'token-1', nonce: null });

    const removals = stub.callsTo('/wc/store/v1/cart/remove-item', 'POST');
    expect(removals.map((call) => call.body)).toEqual([{ key: 'k1' }, { key: 'k2' }]);
    // The removals use the nonce the read handed back, so an expired cookie nonce
    // cannot make "empty my cart" silently do nothing.
    expect(removals[0].headers.Nonce).toBe('fresh-nonce');
  });
});

describe('failure handling', () => {
  it('does not retry a failure that is not a nonce problem', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return jsonResponse(
        { code: 'woocommerce_rest_product_not_purchasable', message: 'Not purchasable.' },
        400
      );
    };

    const error = await addStoreCartItem({ cartToken: null, nonce: null }, '2493', 1).catch((err) => err);

    expect(error).toBeInstanceOf(StoreCartError);
    // Retrying a refusal would not help and would double every failed add.
    expect(attempts).toBe(1);
    expect((error as StoreCartError).code).toBe('woocommerce_rest_product_not_purchasable');
  });

  it('reconciles and succeeds when mutation times out but WooCommerce added the item', async () => {
    let callIndex = 0;
    globalThis.fetch = async (url) => {
      callIndex += 1;
      const urlStr = String(url);
      if (urlStr.includes('/cart/add-item')) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (urlStr.includes('/cart')) {
        return jsonResponse(
          {
            items: [cartLine({ id: 2493, quantity: 1 })],
            items_count: 1,
          },
          200,
          { 'cart-token': 'token-1', nonce: 'fresh-nonce' }
        );
      }
      return jsonResponse({}, 404);
    };

    const result = await addStoreCartItem(
      { cartToken: 'token-1', nonce: 'nonce-1' },
      '2493',
      1,
      undefined,
      { previousQuantity: 0, settleMs: 0 }
    );

    expect(result.reconciled).toBe(true);
    expect(result.cart.items?.[0].id).toBe(2493);
    expect(result.cart.items?.[0].quantity).toBe(1);
  });

  it('re-throws STORE_TIMEOUT when mutation times out and item is not in authoritative cart', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/cart/add-item')) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (urlStr.includes('/cart')) {
        // Authoritative cart is still empty
        return jsonResponse(
          {
            items: [],
            items_count: 0,
          },
          200,
          { 'cart-token': 'token-1', nonce: 'fresh-nonce' }
        );
      }
      return jsonResponse({}, 404);
    };

    await expect(
      addStoreCartItem(
        { cartToken: 'token-1', nonce: 'nonce-1' },
        '2493',
        1,
        undefined,
        { previousQuantity: 0, settleMs: 0 }
      )
    ).rejects.toMatchObject({
      name: 'StoreCartError',
      code: 'store_timeout',
    });
  });
});
