import type { Product } from '../../data/products';

/**
 * Price display rules, in one place.
 *
 * A catalog source may not be able to report a price (the WordPress core
 * product route cannot). In that case the model carries `priceMin: null` and an
 * empty `price`, and the UI must say so rather than showing `$0.00`.
 */

/** Rendered wherever a price would go but the source reported none. */
export const PRICE_UNAVAILABLE_LABEL = 'Price unavailable';

/** True only when a source actually reported a price. */
export function isPriceKnown(product: Pick<Product, 'priceMin'>): boolean {
  return typeof product.priceMin === 'number' && Number.isFinite(product.priceMin);
}

/** Display price, or the explicit unknown label. Never fabricates a number. */
export function formatPriceDisplay(product: Pick<Product, 'price' | 'priceMin'>): string {
  return isPriceKnown(product) && product.price ? product.price : PRICE_UNAVAILABLE_LABEL;
}

/**
 * Builds the display string for a resolved price range.
 *
 * `priceMax` is the top of a *variant* range, not a compare-at/discount price —
 * see the note on `Product.priceMax`. The " - " separator and the truthiness
 * check reproduce the long-standing Supabase mapper output exactly, so the two
 * backends cannot drift into different-looking prices.
 */
export function priceDisplayFromRange(priceMin: number | null, priceMax?: number | null): string {
  if (priceMin === null || !Number.isFinite(priceMin)) return '';
  const min = `$${priceMin.toFixed(2)}`;
  return priceMax ? `${min} - $${priceMax.toFixed(2)}` : min;
}

/**
 * What a variable product's price should read, given the option chosen so far.
 *
 * WooCommerce reports a variable product's own `price` as the cheapest of its
 * variations, so showing that number as *the* price asserts that every option
 * costs the same — the shopper reads the 1kg figure while looking at 2kg. Until an
 * option is chosen the product's range stands (`$12.34 - $23.45`), and once one is
 * chosen that option's own price does.
 *
 * An option the store reported no price for falls back to the range rather than
 * rendering `$0.00`: a price we did not receive is not a free product.
 */
export function variationPriceDisplay(
  product: Pick<Product, 'price' | 'priceMin'>,
  option: { price: number | null } | undefined | null
): string {
  return option && typeof option.price === 'number'
    ? priceDisplayFromRange(option.price)
    : formatPriceDisplay(product);
}

/** Catalog fields a source did not supply, so callers can render them as unknown. */
export function collectMissingCatalogFields(input: {
  priceMin: number | null;
  sku: string | null;
  stockStatus: Product['stockStatus'];
  images: string[];
}): string[] {
  const missing: string[] = [];
  if (input.priceMin === null) missing.push('price');
  if (input.sku === null) missing.push('sku');
  if (!input.stockStatus || input.stockStatus === 'unknown') missing.push('stockStatus');
  if (input.images.length === 0) missing.push('images');
  return missing;
}
