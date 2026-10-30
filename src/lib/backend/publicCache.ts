/**
 * Purging the public pages a write just invalidated.
 *
 * Caching the storefront is only safe if a saved change reaches the page. This
 * module is the other half of that: every admin write that can change what a
 * shopper sees calls one of these after the store has accepted the change, so
 * the pages affected stop being served from the edge immediately instead of
 * waiting out their one-minute window.
 *
 * ## Why path purging, and not a tag registry
 *
 * Each rendered public page already carries its own path tags — the build
 * records `_N_T_/products`, `_N_T_/products/[slug]` and so on for every route —
 * and the Cloudflare CDN adapter turns those tags into a `Cache-Tag` header and
 * purges the edge by tag. Purging a path therefore needs no second list of tag
 * names to keep in sync with the routes: the routes are the registry. A
 * hand-maintained tag list is exactly the thing that goes stale and silently
 * leaves a sold-out product on a shelf.
 *
 * ## What is deliberately *not* purged
 *
 * Cart, checkout, account, admin and order pages are not cached publicly in the
 * first place, so there is nothing to purge, and nothing here may be called for
 * them: purging is for public browsing pages only.
 *
 * ## Failure is logged, never thrown
 *
 * A purge runs after a write has already succeeded, so throwing would turn a
 * saved product into a failed save for the owner. Outside a request scope (a
 * script, a test) there is no cache to purge and the call is a no-op; the worst
 * case is a page that stays stale for its one-minute window, which is the
 * behaviour the site had before this module existed.
 */

import { revalidatePath } from 'next/cache';
import { purgePublicReadCache } from './publicReadCache';

/** Purge one public path, reporting whether the cache accepted the purge. */
function purgePath(path: string, reason: string): boolean {
  try {
    revalidatePath(path);
    return true;
  } catch (error) {
    console.warn(
      `[cache] could not purge ${path} after ${reason}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Purge the pages built from the catalogue.
 *
 * The listing is one of these paths; the sitemap is the other, because it is a
 * public page built from the same products and a product that has just been
 * archived must not stay in it for the next hour.
 *
 * `/api/catalog` is here for the same reason the listing is. It serves the same
 * products, prices and stock to the browser's own catalogue client, off the same
 * one-minute window the pages own — so if a saved product purged the page and not
 * the endpoint, a client-rendered shelf would keep offering the old price while
 * the server-rendered one had already changed, which is the exact disagreement
 * this module exists to prevent. The endpoint's own response is never stored (a
 * route handler that reads the request cannot be edge-cached), but the catalogue
 * read behind it is tagged with the route, and this purge is what clears it.
 */
export function purgePublicCatalog(reason: string): string[] {
  // The catalogue *read* behind `/api/catalog` is held in the Worker's own cache
  // rather than at the edge (the route reads its query string, so the framework
  // never stores its response — see that route's doc-comment), which means
  // `revalidatePath` below clears the page and nothing at all clears the read.
  // Without this call a saved price would reach `/products` immediately and the
  // endpoint the client-rendered shelves read for up to a minute longer, which is
  // exactly the disagreement this module exists to prevent.
  void purgePublicReadCache();
  return ['/products', '/sitemap', '/api/catalog'].filter((path) => purgePath(path, reason));
}

/**
 * Purge one product's page, plus the catalogue it appears on.
 *
 * Both matter and they are purged together: a price or stock change is visible
 * on the shelf as well as on the page, and a page whose canonical shelf still
 * offers the old price is the more confusing of the two.
 *
 * A slug that is not known (a create that returned no slug, a delete of an
 * unknown id) still purges the catalogue, which is where the change is visible.
 */
export function purgePublicProduct(slug: string | null | undefined, reason: string): string[] {
  const purged = purgePublicCatalog(reason);
  const trimmed = typeof slug === 'string' ? slug.trim() : '';
  if (!trimmed) return purged;
  const path = `/products/${trimmed}`;
  return purgePath(path, reason) ? [...purged, path] : purged;
}

/**
 * Purge the blog index and, when known, one article.
 *
 * Blog reads are cached longer than the catalogue because articles are
 * published rarely, so this purge is what makes "publish" feel immediate
 * rather than "up to five minutes from now".
 */
export function purgePublicBlog(slug: string | null | undefined, reason: string): string[] {
  const purged = purgePath('/blog', reason) ? ['/blog'] : [];
  const trimmed = typeof slug === 'string' ? slug.trim() : '';
  if (!trimmed) return purged;
  const path = `/blog/${trimmed}`;
  return purgePath(path, reason) ? [...purged, path] : purged;
}

/** The slug a Woo write result carried, when it carried one. */
export function slugOf(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as { slug?: unknown }).slug;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
