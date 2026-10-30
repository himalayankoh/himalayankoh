import { describe, expect, it } from 'vitest';
import { formatPriceDisplay, variationPriceDisplay } from './price';

/** A variable product as the catalog read models it: cheapest first, range set. */
const VARIABLE = {
  price: '$12.34 - $23.45',
  priceMin: 12.34,
  priceMax: 23.45,
};

const SINGLE_PRICE = {
  price: '$9.95',
  priceMin: 9.95,
};

const UNPRICED = {
  price: '',
  priceMin: null,
};

describe('variationPriceDisplay', () => {
  it('shows the product range until an option is chosen', () => {
    // Nothing chosen: no single figure may stand for every option, so the range
    // the store reported does. This is the case that used to print the cheapest
    // option's price as if it were the product's.
    expect(variationPriceDisplay(VARIABLE, undefined)).toBe('$12.34 - $23.45');
  });

  it('shows the chosen option’s own price once there is one', () => {
    expect(variationPriceDisplay(VARIABLE, { price: 23.45 })).toBe('$23.45');
    expect(variationPriceDisplay(VARIABLE, { price: 12.34 })).toBe('$12.34');
  });

  it('falls back to the range when the option carries no price', () => {
    // A price the store never sent is not a free product, and it is not $0.00.
    expect(variationPriceDisplay(VARIABLE, { price: null })).toBe('$12.34 - $23.45');
  });

  it('keeps a single-price product as one figure', () => {
    expect(variationPriceDisplay(SINGLE_PRICE, undefined)).toBe('$9.95');
    expect(variationPriceDisplay(SINGLE_PRICE, { price: 9.95 })).toBe('$9.95');
  });

  it('never fabricates a price for an unpriced product', () => {
    expect(variationPriceDisplay(UNPRICED, undefined)).toBe('Price unavailable');
    expect(variationPriceDisplay(UNPRICED, { price: null })).toBe('Price unavailable');
    // An option WITH a price still speaks for itself, even when the parent has none.
    expect(variationPriceDisplay(UNPRICED, { price: 4.5 })).toBe('$4.50');
  });

  it('agrees with the plain display when there is nothing to choose', () => {
    for (const product of [VARIABLE, SINGLE_PRICE, UNPRICED]) {
      expect(variationPriceDisplay(product, undefined)).toBe(formatPriceDisplay(product));
    }
  });
});
