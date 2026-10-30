/**
 * The browser's half of the wishlist.
 *
 * Same shape as the cart client: thin transport over a route that owns the
 * authorisation. Note what these functions no longer take — a user id. The route
 * derives the owner from the session, so there is no parameter a caller could fill
 * in with somebody else's id, and no place for a component to pass one by
 * mistake.
 *
 * The session token is the **customer session** — minted after WordPress verified
 * the shopper's password, and carrying their WooCommerce customer id
 * (`lib/auth/customerClient.ts`). It used to come from Supabase, which is why the
 * rows were keyed by an id only this app understood.
 */

import { getCustomerAccessToken } from '../auth/customerClient';

/** What a wishlist card renders, resolved from the catalog. */
export interface WishlistProduct {
  id: number;
  name: string;
  /** Catalog display string, e.g. "$19.95". Empty when the price is unknown. */
  price: string;
  priceMin: number | null;
  slug: string;
  image: string;
  images: string[];
  inStock: boolean;
}

export interface WishlistItem {
  id: number;
  product_id: number;
  created_at: string;
  product: WishlistProduct;
}

function authorizedHeaders(): Record<string, string> {
  const token = getCustomerAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...authorizedHeaders(), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || 'Your wishlist could not be reached right now.');
  }
  return body;
}

export const wishlistApi = {
  /** The customer's saved products, newest first. */
  async getWishlist(): Promise<WishlistItem[]> {
    const body = await call<{ items: WishlistItem[] }>('/api/wishlist');
    return body.items ?? [];
  },

  /** Saves or unsaves a product, returning the state it ended in. */
  async toggleWishlist(productId: string | number): Promise<boolean> {
    const body = await call<{ inWishlist: boolean }>('/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({ productId: String(productId), action: 'toggle' }),
    });
    return body.inWishlist === true;
  },

  /** Unsaves a product. */
  async removeFromWishlist(productId: string | number): Promise<void> {
    await call('/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({ productId: String(productId), action: 'remove' }),
    });
  },

  /** How many products are saved. */
  async getWishlistCount(): Promise<number> {
    const body = await call<{ count: number }>('/api/wishlist/count');
    return Number(body.count ?? 0) || 0;
  },
};
