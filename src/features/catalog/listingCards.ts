import type { Product } from '../../data/products';
import { normalizeWeightUnits } from '../../lib/products/displayName';
import { priceDisplayFromRange } from '../../lib/products/price';

export function productCardPath(product: Product): string {
  return `/products/${product.slug}${product.selectedVariationId ? `?variation=${product.selectedVariationId}` : ''}`;
}

export function productCardKey(product: Product): string {
  return `${product.id}:${product.selectedVariationId ?? 'parent'}`;
}

function isSaltLickProduct(p: Product): boolean {
  if (p.slug === 'salt-licks-for-horses' || p.slug === 'himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh') return true;
  if ((p.id === 2543 || p.id === '2543') && p.slug.includes('salt-lick')) return true;
  return false;
}

function isWeightAttribute(label?: string): boolean {
  if (!label) return false;
  return ['Size/Weight', 'Weight', 'Size / Weight', 'Size'].some(
    target => label.localeCompare(target, undefined, { sensitivity: 'accent' }) === 0 || label.toLowerCase() === target.toLowerCase()
  );
}

/** Two views of genuine child records, never extra catalog products. */
export function listingCards(products: Product[]): Product[] {
  if (products.some(p => p.selectedVariationId)) return products;
  const lick = products.find(p => isSaltLickProduct(p) && isWeightAttribute(p.variations?.attributeLabel));
  const weights = ['2 lb', '6 lb'];
  const cards = weights.flatMap(weight => {
    const option = lick?.variations?.options.find(o => {
      const val = normalizeWeightUnits(o.value).trim();
      const lbl = normalizeWeightUnits(o.label).trim();
      return val === weight || lbl === weight || val.startsWith(weight) || lbl.startsWith(weight);
    });
    if (!lick || !option) return [];
    const cardImage = option.image || (weight === '6 lb' && !lick.image.includes('original.jpg') ? '/images/products/himalayan-6lb-salt-lick-front.webp' : lick.image);
    return [{ ...lick, selectedVariationId: option.id, name: `Himalayan Pink Salt Lick — ${weight}`,
      price: priceDisplayFromRange(option.price), priceMin: option.price, priceMax: undefined, priceRange: false,
      inStock: option.inStock, stockStatus: option.inStock ? lick.stockStatus : 'out_of_stock' as const,
      stockQuantity: option.stockQuantity ?? null, sku: option.sku,
      image: cardImage }];
  });
  return cards.length ? [...cards, ...products.filter(p => p !== lick)] : products;
}
