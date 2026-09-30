// The storefront's per-product listing decision, as a pure function.
//
// `serverCatalog` enforces two independent policies before it serves anything:
// the niche guard (`lib/catalog/niche.ts`) and the shared public contract
// (`content/productEligibility.ts`). The first decides *what the shop sells*; the
// second applies the two rules that protect the shop — a manufacturer/official
// page is reference material rather than stock, and an unapproved risk hold
// stays off the storefront. Supplier cost and the readiness word are the owner's
// own bookkeeping and no longer withhold anything (see the contract).
//
// This module is that second policy, expressed against the storefront's own
// `Product` model so it can be unit-tested without standing up a store read
// (importing `serverCatalog` would drag in React's request cache). One module,
// one answer, both sides.

import {
  publicProductIneligibilityReason,
  type PublicProductFacts,
} from '../../content/productEligibility';

/** The storefront-facing subset of `data/products.Product` this policy reads. */
export interface StorefrontListingFacts {
  id?: number | string | null;
  slug?: string;
  name?: string | null;
  /** Display price; `priceMin` is the numeric one the contract checks. */
  priceMin?: number | null;
  price?: string;
  images?: string[];
  image?: string;
  description?: string | null;
  commerceReadiness?: string | null;
  supplierSource?: string | null;
  costPrice?: number | null;
  usInventory?: boolean | null;
  stockStatus?: string | null;
  stockQuantity?: number | null;
  riskFlags?: string[] | null;
  safetyReviewStatus?: string | null;
}

/**
 * Map a storefront product onto the shared public contract.
 *
 * The one deliberate default: a product with **no stored readiness** is treated
 * as `COMMERCE_READY`. That is not a guess — it is the console's own rule for the
 * same row (see `catalogRowToProduct`), and it is how an own-stock line that was
 * never put through the readiness workflow (the 16 oz jar) stays public. Without
 * it, switching the public read onto the contract would have hidden every
 * product the store never stamped, including the ones it is already selling.
 * A product the workflow *did* stamp carries its real value and is judged on it.
 */
export function publicFactsFromStoreProduct(p: StorefrontListingFacts): PublicProductFacts {
  const images = (p.images && p.images.length ? p.images : p.image ? [p.image] : []).filter(Boolean);
  return {
    id: String(p.id ?? ''),
    slug: p.slug,
    name: p.name,
    // The storefront read returns published products only, so a row here is
    // live by construction — the same fact `rowFromCatalogProduct` records.
    status: 'published',
    description: p.description ?? null,
    price: p.priceMin ?? null,
    image_url: images[0] ?? null,
    images,
    commerce_readiness: p.commerceReadiness ?? 'COMMERCE_READY',
    // Carried so the contract can read the owner's own record: an
    // official/manufacturer source is reference material, and a risk stamp is a
    // hold. A pending readiness word is bookkeeping and no longer withholds.
    supplier_source: p.supplierSource ?? null,
    cost_price: p.costPrice ?? null,
    us_inventory: p.usInventory ?? null,
    stock_status: p.stockStatus ?? null,
    inventory_qty: p.stockQuantity ?? null,
    risk_flags: p.riskFlags ?? [],
    safety_review_status: p.safetyReviewStatus ?? null,
  };
}

/** The reason the storefront must not serve this product, or `null` when it may. */
export function storefrontListingReason(p: StorefrontListingFacts): string | null {
  return publicProductIneligibilityReason(publicFactsFromStoreProduct(p));
}

/** True when the storefront may serve this product's PDP and list it. */
export function isStorefrontListable(p: StorefrontListingFacts): boolean {
  return storefrontListingReason(p) === null;
}
