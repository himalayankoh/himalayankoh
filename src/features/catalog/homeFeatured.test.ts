import { describe, expect, it } from 'vitest';

import type { Product } from '../../data/products';
import { HOME_FEATURED_LIMIT, selectHomeFeatured } from './homeFeatured';

const product = (id: number, isFeatured?: boolean): Product =>
  ({
    id,
    slug: `product-${id}`,
    name: `Product ${id}`,
    price: `$${id}.00`,
    priceMin: id,
    image: `/images/products/product-${id}.webp`,
    category: 'Livestock',
    inStock: true,
    ...(isFeatured === undefined ? {} : { isFeatured }),
  }) as Product;

describe('selectHomeFeatured', () => {
  it('shows the products the store marked as featured', () => {
    const catalogue = [product(1), product(2, true), product(3), product(4, true), product(5)];

    const featured = selectHomeFeatured(catalogue);

    expect(featured.map((p) => p.id)).toEqual([2, 4]);
  });

  it('falls back to the first products when nothing is marked, which is the live catalogue', () => {
    // Every published product on the preview deployment reports isFeatured: false,
    // so the fallback is the path the shop actually renders today.
    const catalogue = [product(1, false), product(2, false), product(3, false), product(4, false), product(5, false)];

    const featured = selectHomeFeatured(catalogue);

    expect(featured.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(featured).toHaveLength(HOME_FEATURED_LIMIT);
  });

  it('keeps the catalogue order rather than the order the marks appear in', () => {
    const catalogue = [product(1, true), product(2), product(3, true)];

    expect(selectHomeFeatured(catalogue, 2).map((p) => p.id)).toEqual([1, 3]);
  });

  it('shows fewer than the limit when the catalogue is smaller, rather than padding it', () => {
    expect(selectHomeFeatured([product(1, false), product(2, false)]).map((p) => p.id)).toEqual([1, 2]);
  });

  it('answers an empty catalogue with an empty featuring', () => {
    expect(selectHomeFeatured([])).toEqual([]);
  });

  it('clamps a negative limit to nothing instead of slicing from the end', () => {
    expect(selectHomeFeatured([product(1, true), product(2, true)], -1)).toEqual([]);
  });

  it('leaves the catalogue it was given untouched', () => {
    const catalogue = [product(1), product(2, true)];
    const snapshot = JSON.stringify(catalogue);

    selectHomeFeatured(catalogue);

    expect(JSON.stringify(catalogue)).toBe(snapshot);
  });
});
