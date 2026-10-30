/**
 * Safe resolver for guide-to-product links.
 *
 * A resource guide names related products by slug, but slugs die: products are
 * renamed, retired, or never existed in the active catalogue (measured
 * 2026-10-12: 27 guide links across 12 guides pointed at 10 slugs that all
 * answered HTTP 404). Rendering those slugs is serving a broken card under a
 * "Verified Catalog" heading.
 *
 * This resolver intersects a guide's static slugs with the slugs the active
 * catalogue actually carries, preserving order and dropping everything else —
 * unknown slugs, retired slugs and blanks. The caller reads the catalogue
 * through the same seam the shop renders (`getCatalogProducts`), so a future
 * catalogue change shrinks the bar on the next render instead of serving a
 * 404, and `relatedProducts.test.ts` pins the static data to the catalogue
 * fixture so the drift also fails loudly in CI.
 */

import { nicheSectionKeyForWooCategory } from '@/lib/catalog/nicheSections';

export interface RelatedProductRef {
  slug: string;
  /** The catalogue's own display name, so cards never title-case a slug. */
  name: string;
}

export function resolveRelatedProducts(
  slugs: readonly string[],
  catalog: ReadonlyArray<{ slug: string; name: string; category?: string; description?: string }>,
  productUse?: 'food'
): RelatedProductRef[] {
  const bySlug = new Map(catalog.map((product) => [product.slug, product]));
  const seen = new Set<string>();
  const resolved: RelatedProductRef[] = [];
  for (const raw of slugs) {
    const slug = (raw ?? '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const product = bySlug.get(slug);
    // A reachable livestock listing is still a wrong recommendation in a kitchen
    // guide. Require an explicit edible category and reject conflicting animal
    // copy; a missing category cannot establish food-grade suitability.
    if (productUse === 'food' && (!product || !product.category?.trim() ||
      nicheSectionKeyForWooCategory(product.category, product.name) !== 'edible-pink-salt' ||
      /\b(?:livestock|animals?|horses?|cattle|feed|licks?|wildlife)\b/i.test(`${product.name} ${product.description ?? ''}`))) continue;
    const name = product?.name;
    if (typeof name === 'string' && name.trim()) {
      resolved.push({ slug, name });
    }
  }
  return resolved;
}
