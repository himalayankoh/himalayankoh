/**
 * Which products the homepage features, from one catalogue read.
 *
 * This rule used to exist twice, in two shapes: the server read nothing at all,
 * and the browser filtered the catalogue itself after hydration. Both the server
 * render and that browser fallback now take their answer from here, so the cards
 * the shop renders and the cards a client would fetch for itself can never
 * disagree about which products are on the homepage.
 *
 * The one deliberate default: when the store marks **no** product as featured, the
 * first products in the catalogue are shown rather than nothing. That is not a
 * guess about merchandising, it is what the homepage did before this module
 * existed, and it is the current state of the catalogue — measured on the preview
 * deployment (2026-10-06), all six published products report `isFeatured: false`.
 * A featured grid that rendered itself empty because nobody had ticked a box would
 * be a worse answer than showing the shelf.
 *
 * The storefront's listing policy has already run by the time a product reaches
 * here: off-niche products, official/manufacturer reference pages and products
 * under an unapproved risk hold are not in the list at all.
 */

import type { Product } from '../../data/products';

/** How many cards the homepage featuring shows. */
export const HOME_FEATURED_LIMIT = 4;

/**
 * The homepage's featured products, in catalogue order.
 *
 * `limit` is clamped at zero so a caller cannot ask for a negative slice, which
 * would silently drop the last products instead of the first.
 */
export function selectHomeFeatured(products: Product[], limit = HOME_FEATURED_LIMIT): Product[] {
  if (!Array.isArray(products) || products.length === 0) return [];

  const marked = products.filter((product) => product.isFeatured);
  const chosen = marked.length > 0 ? marked : products;
  return chosen.slice(0, Math.max(0, limit));
}
