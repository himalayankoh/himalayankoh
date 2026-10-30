/**
 * The wishlist, as WordPress stores it.
 *
 * ## Why it is not in WooCommerce
 *
 * WooCommerce has no wishlist — not in the Store API, not in REST v3, not in the
 * schema. The only honest options were a custom endpoint or leaving it on
 * Supabase, and the point of the migration is the second one. So the table lives
 * in our own plugin (`wordpress/himalayan-koh-storefront.php`) and this module is
 * the app's client for it. The cart went the other way — to WooCommerce — because
 * WooCommerce *does* own carts; the two halves of "account state" are split by
 * which system already owns the concern, not by convenience.
 *
 * ## Why the product details are read somewhere else
 *
 * WordPress stores product *ids*. The names, prices and images shown on the
 * wishlist come from the catalog, read here through `/wc/v3/products?include=…` —
 * the authenticated route that reports price and stock today.
 *
 * Deliberately **not** through `wc/store/v1/products`: that route answers HTTP 500
 * with a WordPress PHP fatal on this store. Reading the wishlist therefore works
 * while the public product route is broken, which is the whole reason it could
 * move in this pass.
 *
 * Server-only: it authenticates with the administrator application password.
 */

import {
  WordPressApiError,
  wordpressRequest,
} from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { mapRestV3Product, type RestV3Product } from '@/lib/backend/woocommerce';

const NAMESPACE = '/hk-storefront/v1';
const WOO_REST = '/wc/v3';

/** One stored row, as the plugin reports it. */
export interface WishlistRow {
  id: number;
  owner: string;
  product_id: number;
  created_at: string;
}

/**
 * What a wishlist card renders.
 *
 * `price` is the catalog's own display string rather than a number, because a
 * product whose price the source cannot report must be able to say so. The
 * previous shape carried a number and the card did `price.toFixed(2)`, so an
 * unknown price rendered as "$0.00" — a price the shop never quoted.
 */
export interface WishlistProduct {
  id: number;
  name: string;
  price: string;
  priceMin: number | null;
  slug: string;
  image: string;
  images: string[];
  /** False when the catalog reports the product as not purchasable. */
  inStock: boolean;
}

export interface WishlistItem {
  id: number;
  product_id: number;
  created_at: string;
  product: WishlistProduct;
}

export class WishlistError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WishlistError';
    this.status = status;
  }
}

export interface WordPressWishlistCredentials {
  username: string;
  password: string;
}

function toWishlistError(error: unknown, action: string): WishlistError {
  if (error instanceof WordPressApiError) {
    // A 403 is the plugin refusing the credential, and it is worth saying which
    // one: an owner debugging this needs to know it is the WordPress application
    // password and not the WooCommerce consumer key.
    if (error.status === 403 || error.status === 401) {
      return new WishlistError(
        'WordPress refused the app credential while reading the wishlist. Check WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD (create the password under Users → Profile → Application Passwords).',
        502
      );
    }
    if (error.status === 404) {
      return new WishlistError(
        'The wishlist endpoint is missing on WordPress — the Himalayan Koh storefront plugin is not active.',
        502
      );
    }
    return new WishlistError(`The wishlist could not be ${action}: ${error.message}`, 502);
  }
  return new WishlistError(
    `The wishlist could not be ${action}: ${error instanceof Error ? error.message : String(error)}`,
    502
  );
}

/**
 * The owner's saved rows, newest first.
 *
 * Rows rather than bare ids because the row is what the wishlist page keys on,
 * and a synthesised key would change identity under React on every re-read.
 */
export async function listWishlist(owner: string): Promise<WishlistRow[]> {
  try {
    const credentials = requireWordPressCredentials();
    const response = await wordpressRequest<{ items?: WishlistRow[] }>(`${NAMESPACE}/wishlist`, {
      params: { owner },
      credentials,
      timeoutMs: 20_000,
    });
    return (response.items ?? []).filter(
      (row) => Number.isFinite(Number(row.product_id)) && Number(row.product_id) > 0
    );
  } catch (error) {
    throw toWishlistError(error, 'read');
  }
}

/** The product ids from saved rows, for "is this one saved" questions. */
export function wishlistProductIds(rows: WishlistRow[]): number[] {
  return rows.map((row) => Number(row.product_id));
}

/** Number of saved products, without reading the products themselves. */
export async function wishlistCount(owner: string): Promise<number> {
  try {
    const credentials = requireWordPressCredentials();
    const response = await wordpressRequest<{ count?: number }>(`${NAMESPACE}/wishlist/count`, {
      params: { owner },
      credentials,
      timeoutMs: 20_000,
    });
    return Number(response.count ?? 0) || 0;
  } catch (error) {
    throw toWishlistError(error, 'counted');
  }
}

/** Saves a product. Idempotent — saving twice is not an error. */
export async function addWishlistProduct(owner: string, productId: number): Promise<void> {
  try {
    const credentials = requireWordPressCredentials();
    await wordpressRequest(`${NAMESPACE}/wishlist`, {
      method: 'POST',
      body: { owner, productId },
      credentials,
      timeoutMs: 20_000,
    });
  } catch (error) {
    throw toWishlistError(error, 'saved');
  }
}

/** Forgets a product. Returns false when nothing was saved to begin with. */
export async function removeWishlistProduct(owner: string, productId: number): Promise<boolean> {
  try {
    const credentials = requireWordPressCredentials();
    const response = await wordpressRequest<{ deleted?: boolean }>(`${NAMESPACE}/wishlist`, {
      method: 'DELETE',
      body: { owner, productId },
      credentials,
      timeoutMs: 20_000,
    });
    return response.deleted === true;
  } catch (error) {
    throw toWishlistError(error, 'removed');
  }
}

/**
 * Forgets everything one owner saved. Returns how many rows were removed.
 *
 * Used by account deletion. It lives here rather than as a loop of
 * `removeWishlistProduct` calls because the owner is being deleted: a partial
 * failure would leave exactly the rows the deletion was meant to remove, with no
 * account left that could ever reach them.
 */
export async function removeWishlistOwner(owner: string): Promise<number> {
  try {
    const credentials = requireWordPressCredentials();
    const response = await wordpressRequest<{ deleted?: number }>(
      `${NAMESPACE}/wishlist/owner`,
      {
        method: 'DELETE',
        body: { owner },
        credentials,
        timeoutMs: 20_000,
      }
    );
    return Number(response.deleted ?? 0) || 0;
  } catch (error) {
    throw toWishlistError(error, 'cleared');
  }
}

/**
 * Resolves the display details for a set of product ids.
 *
 * One request for all of them: `include` takes a list, so a wishlist of twenty
 * products is one round trip rather than twenty. A product that no longer exists
 * is simply absent from the map, and the caller drops that row — the alternative
 * is a card that renders a blank name the customer cannot act on.
 */
export async function readWishlistProducts(
  productIds: number[]
): Promise<Map<number, WishlistProduct>> {
  const ids = Array.from(new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return new Map();

  const rows = await wordpressRequest<RestV3Product[]>(`${WOO_REST}/products`, {
    params: { include: ids, per_page: Math.min(ids.length, 100), status: 'publish' },
    useCredentials: true,
    timeoutMs: 25_000,
  });

  const map = new Map<number, WishlistProduct>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const product = mapRestV3Product(row);
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      id,
      name: product.name,
      price: product.price,
      priceMin: product.priceMin,
      slug: product.slug,
      image: product.image,
      images: product.images ?? [],
      inStock: product.inStock,
    });
  }
  return map;
}
