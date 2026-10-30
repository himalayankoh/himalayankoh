import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
});

import {
  WishlistError,
  addWishlistProduct,
  listWishlist,
  readWishlistProducts,
  removeWishlistOwner,
  removeWishlistProduct,
  wishlistCount,
  wishlistProductIds,
} from './store';

// WordPress shows application passwords in spaced groups; the spaces are cosmetic.
const EXPECTED_BASIC = `Basic ${Buffer.from('app-admin:abcdEFGHijklMNOPqrstUVWX').toString('base64')}`;
// The catalog read authenticates as the store, not as the app's WordPress user:
// two credentials, two different systems.
const EXPECTED_WOO_BASIC = `Basic ${Buffer.from('ck_test:cs_test').toString('base64')}`;

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('listWishlist', () => {
  it('reads the owner\u2019s rows with the app credential', async () => {
    const stub = useWordPress([
      {
        path: '/hk-storefront/v1/wishlist',
        body: {
          items: [
            { id: 9, owner: 'user-1', product_id: 2493, created_at: '2026-09-01 10:00:00' },
            { id: 8, owner: 'user-1', product_id: 2497, created_at: '2026-08-01 10:00:00' },
          ],
        },
      },
    ]);

    const rows = await listWishlist('user-1');

    const call = stub.callsTo('/hk-storefront/v1/wishlist')[0];
    expect(call.headers.Authorization).toBe(EXPECTED_BASIC);
    expect(call.query.get('owner')).toBe('user-1');
    expect(rows.map((row) => row.id)).toEqual([9, 8]);
    expect(wishlistProductIds(rows)).toEqual([2493, 2497]);
  });

  it('drops rows whose product id is not usable', async () => {
    useWordPress([
      {
        path: '/hk-storefront/v1/wishlist',
        body: {
          items: [
            { id: 1, owner: 'user-1', product_id: '2493', created_at: '' },
            { id: 2, owner: 'user-1', product_id: 0, created_at: '' },
            { id: 3, owner: 'user-1', product_id: null, created_at: '' },
          ],
        },
      },
    ]);

    expect((await listWishlist('user-1')).map((row) => row.id)).toEqual([1]);
  });

  it('says which credential WordPress refused', async () => {
    useWordPress([
      { path: '/hk-storefront/v1/wishlist', status: 403, body: { code: 'rest_forbidden', message: 'Sorry.' } },
    ]);

    const error = await listWishlist('user-1').catch((err) => err);

    expect(error).toBeInstanceOf(WishlistError);
    // The owner debugging this needs to know it is the WordPress password and not
    // the WooCommerce consumer key.
    expect((error as WishlistError).message).toContain('WORDPRESS_ADMIN_APP_PASSWORD');
  });

  it('explains a missing endpoint as an inactive plugin', async () => {
    // The stub answers WordPress's own rest_no_route 404 when nothing matches.
    useWordPress([]);

    const error = await listWishlist('user-1').catch((err) => err);

    expect((error as WishlistError).message).toContain('plugin is not active');
  });
});

describe('addWishlistProduct', () => {
  it('posts the owner and the product id', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/wishlist', method: 'POST', body: { ok: true, item: { id: 1 } } },
    ]);

    await addWishlistProduct('user-1', 2493);

    const call = stub.callsTo('/hk-storefront/v1/wishlist', 'POST')[0];
    expect(call.headers.Authorization).toBe(EXPECTED_BASIC);
    expect(call.body).toEqual({ owner: 'user-1', productId: 2493 });
  });
});

describe('removeWishlistProduct', () => {
  it('reports whether anything was actually removed', async () => {
    useWordPress([
      { path: '/hk-storefront/v1/wishlist', method: 'DELETE', body: { ok: true, deleted: false } },
    ]);

    // False is the honest answer when the row was not there; swallowing it would
    // make a no-op look like a deletion.
    expect(await removeWishlistProduct('user-1', 2493)).toBe(false);
  });

  it('sends the deletion as a DELETE with the owner and product', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/wishlist', method: 'DELETE', body: { ok: true, deleted: true } },
    ]);

    expect(await removeWishlistProduct('user-1', 2493)).toBe(true);
    expect(stub.callsTo('/hk-storefront/v1/wishlist', 'DELETE')[0].body).toEqual({
      owner: 'user-1',
      productId: 2493,
    });
  });
});

describe('removeWishlistOwner', () => {
  it('clears every row for the owner and reports how many went', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/wishlist/owner', method: 'DELETE', body: { ok: true, deleted: 3 } },
    ]);

    expect(await removeWishlistOwner('user-1')).toBe(3);
    expect(stub.callsTo('/hk-storefront/v1/wishlist/owner', 'DELETE')[0].body).toEqual({
      owner: 'user-1',
    });
  });

  it('reports zero when the account had saved nothing', async () => {
    useWordPress([
      { path: '/hk-storefront/v1/wishlist/owner', method: 'DELETE', body: { ok: true, deleted: 0 } },
    ]);

    // Zero is a valid outcome, not a failure: a customer who never saved a product
    // must still be able to delete their account.
    expect(await removeWishlistOwner('user-1')).toBe(0);
  });

  it('surfaces a failure so the caller can decide, rather than reporting success', async () => {
    useWordPress([
      { path: '/hk-storefront/v1/wishlist/owner', method: 'DELETE', status: 403, body: { code: 'rest_forbidden' } },
    ]);

    await expect(removeWishlistOwner('user-1')).rejects.toBeInstanceOf(WishlistError);
  });
});

describe('wishlistCount', () => {
  it('reads the count from its own endpoint', async () => {
    const stub = useWordPress([{ path: '/hk-storefront/v1/wishlist/count', body: { count: 4 } }]);

    expect(await wishlistCount('user-1')).toBe(4);
    // Counting must not read the products: one digit should not cost a catalog read.
    expect(stub.callsTo('/wc/v3/products')).toHaveLength(0);
  });

  it('reports zero when the store says nothing', async () => {
    useWordPress([{ path: '/hk-storefront/v1/wishlist/count', body: {} }]);
    expect(await wishlistCount('user-1')).toBe(0);
  });
});

describe('readWishlistProducts', () => {
  const wooProduct = {
    id: 2493,
    // The store's legacy spelling. The catalogue normalizes the visible name to
    // `lb` at the backend boundary, which the assertion below proves.
    name: 'Himalayan Salt Coarse Grain — 6 lbs',
    slug: 'himalayan-salt-coarse-grain-6-lbs',
    price: '19.95',
    regular_price: '19.95',
    stock_status: 'instock',
    images: [{ src: 'https://cdn.test/6lbs.webp' }],
    categories: [{ id: 15, name: 'Salt', slug: 'salt' }],
  };

  it('reads every id in one request and maps to the card shape', async () => {
    const stub = useWordPress([
      { path: '/wc/v3/products', body: [wooProduct] },
    ]);

    const products = await readWishlistProducts([2493, 2488]);

    const call = stub.callsTo('/wc/v3/products')[0];
    // `include[]`, because WooCommerce reads only the last value of a repeated bare key:
    // this read used to come back with one product for a two-item wishlist.
    expect(call.query.getAll('include[]')).toEqual(['2493', '2488']);
    expect(call.headers.Authorization).toBe(EXPECTED_WOO_BASIC);

    const product = products.get(2493);
    expect(product).toMatchObject({
      id: 2493,
      name: 'Himalayan Salt Coarse Grain — 6 lb',
      price: '$19.95',
      priceMin: 19.95,
      image: 'https://cdn.test/6lbs.webp',
      inStock: true,
    });
  });

  it('leaves a product the catalog did not return out of the map', async () => {
    useWordPress([{ path: '/wc/v3/products', body: [wooProduct] }]);

    const products = await readWishlistProducts([2493, 9999]);

    expect(products.has(2493)).toBe(true);
    expect(products.has(9999)).toBe(false);
  });

  it('makes no request when there is nothing to resolve', async () => {
    const stub = useWordPress([{ path: '/wc/v3/products', body: [wooProduct] }]);

    expect((await readWishlistProducts([])).size).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('does not report a price the catalog could not supply', async () => {
    useWordPress([
      {
        path: '/wc/v3/products',
        body: [{ ...wooProduct, price: '', regular_price: '', sale_price: '' }],
      },
    ]);

    const product = (await readWishlistProducts([2493])).get(2493);

    // An unpriced product must render as unknown, not as $0.00.
    expect(product?.priceMin).toBeNull();
    expect(product?.price).toBe('');
  });
});
