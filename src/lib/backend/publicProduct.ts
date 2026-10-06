/**
 * The public shape of a product: what a visitor may be told.
 *
 * `readCatalogProducts` in `./products` reports everything the source holds,
 * which is exactly right for the owner. It is not right for a shopper, and until
 * this module existed the very same objects crossed the wire: `/api/catalog` is
 * a public, unauthenticated route, and every storefront render serialized its
 * products into the response, so fields the shop never intended to publish
 * travelled with them.
 *
 * Measured on the preview deployment (2026-10-06), an anonymous `GET
 * /api/catalog` returned each product with `costPrice`, `supplierSource`,
 * `usInventory`, `riskFlags`, `safetyReviewStatus`, `ownerApproved`,
 * `commerceReadiness` and `missing` attached. None of that is needed to draw a
 * card or a product page, and some of it is the owner's own bookkeeping:
 * `costPrice` is the buying price, `supplierSource` says where stock came from,
 * `usInventory` is unverified sourcing evidence, and the risk and review stamps
 * are internal decisions about what may be sold at all.
 *
 * So the storefront seam now names the fields that may leave, and the rest are
 * dropped. An allowlist rather than a denylist, because a denylist only removes
 * the fields someone remembered: a new internal field added to `Product` would
 * be published the moment it is populated, whereas here it stays private until
 * it is deliberately named below.
 *
 * ## Where this is applied, and the one ordering rule
 *
 * `lib/backend/serverCatalog.ts` calls this at the point a product leaves the
 * server, which covers the server renders (`/products`, `/products/[slug]`,
 * the shelves and `/`) and `/api/catalog` from one place. The admin console is
 * untouched: it reads the raw adapters in `./products`, so the owner still sees
 * the cost, the supplier and the risk stamps they have to act on.
 *
 * It must be applied **after** the storefront policies, never before. The niche
 * guard and `storefrontListingReason` decide whether a product may be served at
 * all by reading `supplierSource`, `costPrice`, `usInventory`, `riskFlags` and
 * `safetyReviewStatus`; stripping those first would change which products the
 * shop sells, not just what the shopper can see.
 *
 * ## What is deliberately kept
 *
 * Everything the storefront genuinely renders: identity (`id`, `slug`, `name`),
 * what it costs (`price`, `priceMin`, `priceMax`, `priceRange`), its images and
 * the store's own responsive candidates for them (`image`, `images`,
 * `imageResponsive`), where it is filed (`category`), its copy (`description`),
 * whether it can be bought (`inStock`, `stockStatus`, `stockQuantity`), the
 * variation options the cart is addressed with (`variations`, `grainSizes`), the
 * SKU the product page prints beside a variation, and the published SEO strings
 * (`metaTitle`, `metaDescription`).
 */

import type { Product } from '../../data/products';

/**
 * The only product fields a storefront read may carry.
 *
 * Typed as `keyof Product` so a name that no longer exists stops compiling, and
 * so the copy below stays index-checked rather than stringly typed.
 */
export const PUBLIC_PRODUCT_FIELDS: readonly (keyof Product)[] = [
  'id',
  'slug',
  'name',
  'price',
  'priceRange',
  'priceMin',
  'priceMax',
  'isFeatured',
  'image',
  'images',
  'imageResponsive',
  'category',
  'description',
  'grainSizes',
  'variations',
  'inStock',
  'metaTitle',
  'metaDescription',
  'sku',
  'stockStatus',
  'stockQuantity',
  'updatedAt',
];

/**
 * The internal fields this module exists to strip, named so the policy can be
 * read and tested without diffing two object literals.
 *
 * These are the owner's, not the shopper's: the buying price, where the stock
 * came from, unverified sourcing evidence, the readiness stamp, the risk flags
 * and the safety-review outcome that decide whether a product may be sold, the
 * explicit niche approval, and the list of fields the source could not supply.
 */
export const DENIED_PRODUCT_FIELDS: readonly (keyof Product)[] = [
  'commerceReadiness',
  'supplierSource',
  'costPrice',
  'usInventory',
  'riskFlags',
  'safetyReviewStatus',
  'ownerApproved',
  'missing',
];

/**
 * One product reduced to what the public may be told.
 *
 * A key is copied only when the source actually carries it, so the result has
 * the same shape the caller already had minus the private fields: a product with
 * no `priceMax` still has no `priceMax` rather than an `undefined` one, which
 * keeps every `'priceMax' in product` and `=== undefined` check in the app
 * behaving exactly as before.
 */
export function toPublicProduct(product: Product): Product {
  const publicProduct: Partial<Product> = {};

  for (const field of PUBLIC_PRODUCT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(product, field)) {
      // A named write per field, so the compiler does not have to reason about
      // one union-typed index write and the accumulator stays `Partial<Product>`.
      Object.assign(publicProduct, { [field]: product[field] });
    }
  }

  return publicProduct as Product;
}

/**
 * A list of products reduced to what the public may be told.
 *
 * Tolerates an absent list, because a lookup with no related products, or a
 * failed read, reaches here as `undefined` rather than as an empty array.
 */
export function toPublicProducts(products: Product[] | undefined | null): Product[] {
  if (!Array.isArray(products)) return [];
  return products.map(toPublicProduct);
}
