import { describe, expect, it } from 'vitest';
import type { Product } from '../../data/products';
import { getProductDisplayName } from './productContent';

const product = (name: string): Product => ({
  id: 'display-test', slug: 'display-test', name, category: 'Live Stock',
  price: '$19.95', priceMin: 19.95, sku: 'HK-ESF-3lbs', image: '', inStock: true,
});

describe('product display title endings', () => {
  it('cleans the actual 2704 title without changing its Woo fields', () => {
    const item = product('Himalayan Koh Pure Natural Himalayan Pink Salt for Livestock – Fine Grain (0.5–1mm), Unprocessed & Halal');
    const before = { ...item };
    expect(getProductDisplayName(item)).toBe('Himalayan Pink Salt for Livestock – Fine Grain (0.5–1mm)');
    expect(item).toEqual(before);
  });

  it.each(['&', '-', ',', '/', 'and', 'or', 'with', 'for'])(
    'removes a dangling %s caused by a cut', (connector) => {
      const prefix = `${'Himalayan Pink Salt '.repeat(3).trim()} ${connector}`;
      const title = getProductDisplayName(product(`${prefix} ${'Longdescription'.repeat(6)}`));
      expect(title.length).toBeLessThanOrEqual(72);
      expect(title.replace(/…$/, '')).not.toMatch(/(?:[&\-,/]|\b(?:and|or|with|for))$/i);
      expect(title).not.toContain('Longdescr');
    }
  );

  it('preserves complete short titles with meaningful internal conjunctions', () => {
    expect(getProductDisplayName(product('Himalayan Salt for Horses & Cattle'))).toBe('Himalayan Salt for Horses & Cattle');
  });
});
