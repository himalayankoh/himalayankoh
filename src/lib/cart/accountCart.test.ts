import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

/**
 * The Store API half is mocked, because the cart's *contents* are WooCommerce's
 * business and are covered by `lib/woo/storeCart`. What is under test here is the
 * binding: which cart token ends up attached to the customer, and which guest lines
 * are carried across.
 */
const store = vi.hoisted(() => ({
  readStoreCart: vi.fn(),
  addStoreCartItem: vi.fn(),
  updateStoreCartItem: vi.fn(),
  mapStoreCart: vi.fn((cart: { lines?: unknown[] }) => ({ items: cart.lines ?? [] })),
}));

vi.mock('@/lib/woo/storeCart', () => ({
  readStoreCart: store.readStoreCart,
  addStoreCartItem: store.addStoreCartItem,
  updateStoreCartItem: store.updateStoreCartItem,
  mapStoreCart: store.mapStoreCart,
}));

import {
  adoptAccountCart,
  clearAccountCart,
  describeCartBindingFailure,
  loadAccountCart,
  saveAccountCart,
} from './accountCart';
import { WordPressApiError } from '@/lib/backend/wordpress';

const realFetch = globalThis.fetch;

const CUSTOMER_ID = 42;
const ACCOUNT = { cartToken: 'acct-cart', nonce: 'acct-nonce' };
const GUEST = { cartToken: 'guest-cart', nonce: 'guest-nonce' };

const CART_SESSION = '/hk-storefront/v1/cart-session';

/** Routes for an active plugin: a stored cart, plus the save and delete halves. */
function activePlugin(saved: { cartToken: string; nonce: string } | null = ACCOUNT): WordPressStubRoute[] {
  return [
    {
      method: 'GET',
      path: CART_SESSION,
      body: { ok: true, session: saved ? { ...saved, updatedAt: '2026-01-01T00:00:00' } : null },
    },
    { method: 'POST', path: CART_SESSION, body: { ok: true } },
    { method: 'DELETE', path: CART_SESSION, body: { deleted: true } },
  ];
}

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/**
 * Answers `readStoreCart` per cart token, so one test can describe both carts.
 *
 * The two shapes are the store's own: an account cart is mapped (`productId`, `key`,
 * `editable`) because a line has to be addressed to be updated, while the guest cart
 * is read raw (`id`, `quantity`) because its lines are only ever added.
 */
function stubCarts(
  carts: Record<string, { lines?: unknown[]; items?: unknown[] }>
) {
  store.readStoreCart.mockImplementation(async (session: { cartToken: string | null }) => ({
    cart: carts[session.cartToken ?? ''] ?? {},
    session,
  }));
}

describe('the cart that follows the account', () => {
  beforeEach(() => {
    store.readStoreCart
      .mockReset()
      .mockImplementation(async (session) => ({ cart: {}, session }));
    store.addStoreCartItem.mockReset().mockImplementation(async (session) => ({ session, cart: {} }));
    store.updateStoreCartItem.mockReset().mockImplementation(async (session) => ({ session, cart: {} }));
    store.mapStoreCart.mockImplementation((cart: { lines?: unknown[] }) => ({ items: cart.lines ?? [] }));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("binds the guest cart when the account has none yet", async () => {
    const wp = useWordPress(activePlugin(null));

    const result = await adoptAccountCart(CUSTOMER_ID, GUEST);

    expect(result).toEqual({ session: GUEST, merged: 0, error: null });
    // No stored cart means nothing to read — and reading a cart mints one, which
    // would bind an empty cart to the account.
    expect(store.readStoreCart).not.toHaveBeenCalled();
    expect(wp.callsTo(CART_SESSION, 'POST')[0].body).toEqual({
      customerId: CUSTOMER_ID,
      cartToken: 'guest-cart',
      nonce: 'guest-nonce',
    });
  });

  it("adopts the account's cart on a device that has none", async () => {
    useWordPress(activePlugin());

    const result = await adoptAccountCart(CUSTOMER_ID, { cartToken: null, nonce: null });

    expect(result.session.cartToken).toBe('acct-cart');
    expect(result.merged).toBe(0);
    expect(result.error).toBeNull();
  });

  it('does nothing when this browser already holds the cart', async () => {
    const wp = useWordPress(activePlugin());

    const result = await adoptAccountCart(CUSTOMER_ID, ACCOUNT);

    expect(result).toMatchObject({ session: { cartToken: ACCOUNT.cartToken }, merged: 0, error: null });
    // Re-adding a cart's own lines to itself is how you double them, and re-saving
    // would only rewrite the binding that produced this token.
    expect(store.readStoreCart).not.toHaveBeenCalled();
    expect(wp.callsTo(CART_SESSION, 'POST')).toHaveLength(0);
  });

  it('carries the guest lines into the account cart, keeping the larger quantity', async () => {
    const wp = useWordPress(activePlugin());
    stubCarts({
      'acct-cart': { lines: [{ productId: 1, quantity: 2, key: 'line-1', editable: true }] },
      // 1 is already in the account cart: 5 beats 2. 2 is guest-only: added.
      'guest-cart': {
        items: [
          { id: 1, quantity: 5 },
          { id: 2, quantity: 3 },
        ],
      },
    });

    const result = await adoptAccountCart(CUSTOMER_ID, GUEST);

    expect(result.merged).toBe(2);
    expect(result.error).toBeNull();
    expect(store.updateStoreCartItem).toHaveBeenCalledWith(
      expect.objectContaining(ACCOUNT),
      'line-1',
      5
    );
    expect(store.addStoreCartItem).toHaveBeenCalledWith(expect.objectContaining(ACCOUNT), 2, 3);
    // The binding is re-saved because the store may have rotated the token during
    // the merge, and the binding must name the cart the shopper is looking at.
    expect(wp.callsTo(CART_SESSION, 'POST')).toHaveLength(1);
  });

  it('does not raise a quantity the shopper already chose higher', async () => {
    useWordPress(activePlugin());
    stubCarts({
      'acct-cart': { lines: [{ productId: 1, quantity: 5, key: 'line-1', editable: true }] },
      'guest-cart': { items: [{ id: 1, quantity: 2 }] },
    });

    const result = await adoptAccountCart(CUSTOMER_ID, GUEST);

    expect(store.updateStoreCartItem).not.toHaveBeenCalled();
    expect(store.addStoreCartItem).not.toHaveBeenCalled();
    expect(result.merged).toBe(0);
  });

  it('leaves a line the store will not let the app edit alone', async () => {
    useWordPress(activePlugin());
    stubCarts({
      'acct-cart': { lines: [{ productId: 1, quantity: 1, key: 'line-1', editable: false }] },
      'guest-cart': { items: [{ id: 1, quantity: 9 }] },
    });

    const result = await adoptAccountCart(CUSTOMER_ID, GUEST);

    expect(store.updateStoreCartItem).not.toHaveBeenCalled();
    expect(result.merged).toBe(0);
  });

  it('keeps the browser cart and says why when the plugin is not active', async () => {
    useWordPress([]);

    const result = await adoptAccountCart(CUSTOMER_ID, GUEST);

    expect(result.session).toEqual(GUEST);
    expect(result.error).toMatch(/storefront plugin is not active/);
  });

  it('does not multiply every request into an error for an unreachable origin', () => {
    const error = new WordPressApiError({
      message: 'WordPress did not answer.',
      path: CART_SESSION,
      status: 0,
    });

    expect(describeCartBindingFailure(error)).toMatch(/could not be used/);
    expect(describeCartBindingFailure(new Error('WORDPRESS_ADMIN_USER is not set'))).toBe(
      'WORDPRESS_ADMIN_USER is not set'
    );
  });

  it('reads the stored binding, and knows when there is none', async () => {
    useWordPress(activePlugin());
    expect(await loadAccountCart(CUSTOMER_ID)).toEqual({
      cartToken: 'acct-cart',
      nonce: 'acct-nonce',
      updatedAt: '2026-01-01T00:00:00',
    });

    useWordPress(activePlugin(null));
    expect(await loadAccountCart(CUSTOMER_ID)).toBeNull();
  });

  it('refuses to remember a cart that has no token', async () => {
    const wp = useWordPress(activePlugin());

    expect(await saveAccountCart(CUSTOMER_ID, { cartToken: null, nonce: null })).toBe(false);
    expect(wp.calls).toHaveLength(0);
  });

  it('forgets the binding by customer id', async () => {
    const wp = useWordPress(activePlugin());

    expect(await clearAccountCart(CUSTOMER_ID)).toBe(true);
    expect(wp.callsTo(CART_SESSION, 'DELETE')[0].query.get('customerId')).toBe(String(CUSTOMER_ID));
  });
});
