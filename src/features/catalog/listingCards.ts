import type { Product } from '../../data/products';

export function productCardPath(product: Product): string {
  return `/products/${product.slug}${product.selectedVariationId ? `?variation=${product.selectedVariationId}` : ''}`;
}

export function productCardKey(product: Product): string {
  return `${product.id}:${product.selectedVariationId ?? 'parent'}`;
}

/**
 * Returns canonical product cards without synthetic child-card duplication.
 * Exactly one card per canonical WooCommerce parent product.
 */
export function listingCards(products: Product[]): Product[] {
  if (!Array.isArray(products) || products.length === 0) return [];

  // Deduplicate products by canonical parent id to ensure exactly one card per product
  const seen = new Set<string | number>();
  const canonical: Product[] = [];

  for (const p of products) {
    const key = p.id;
    if (!seen.has(key)) {
      seen.add(key);
      canonical.push(p);
    }
  }

  return canonical;
}
