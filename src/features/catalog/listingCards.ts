import type { Product } from '../../data/products';
import { normalizeWeightUnits } from '../../lib/products/displayName';
import { priceDisplayFromRange } from '../../lib/products/price';

export function productCardPath(product: Product): string {
  return `/products/${product.slug}${product.selectedVariationId ? `?variation=${product.selectedVariationId}` : ''}`;
}

export function productCardKey(product: Product): string {
  return `${product.id}:${product.selectedVariationId ?? 'parent'}`;
}

/** Two views of genuine child records, never extra catalog products. */
export function listingCards(products: Product[]): Product[] {
  if (products.some(p => p.selectedVariationId)) return products;
  const lick = products.find(p => p.slug === 'salt-licks-for-horses' && p.variations?.attributeLabel === 'Size/Weight');
  const weights = ['2 lb', '6 lb'];
  const cards = weights.flatMap(weight => {
    const option = lick?.variations?.options.find(o => normalizeWeightUnits(o.value) === weight);
    if (!lick || !option) return [];
    return [{ ...lick, selectedVariationId: option.id, name: `Himalayan Pink Salt Lick — ${weight}`,
      price: priceDisplayFromRange(option.price), priceMin: option.price, priceMax: undefined, priceRange: false,
      inStock: option.inStock, stockStatus: option.inStock ? lick.stockStatus : 'out_of_stock' as const,
      stockQuantity: option.stockQuantity ?? null, sku: option.sku,
      image: option.image || lick.image }];
  });
  return cards.length ? [...cards, ...products.filter(p => p !== lick)] : products;
}
