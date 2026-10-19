import { describe, expect, it } from 'vitest';
import type { Product } from '../../data/products';
import { listingCards, productCardKey, productCardPath } from './listingCards';
import { productVariations } from '../../lib/woo/variationOptions';

const product = (): Product => ({
  id: 281,
  slug: 'salt-licks-for-horses',
  name: 'Licks',
  price: '$9.95 - $17.95',
  priceMin: 9.95,
  priceMax: 17.95,
  inStock: true,
  category: 'Live Stock',
  image: 'original.jpg',
  variations: productVariations(
    [{ name: 'Size/Weight', variation: true, options: ['2 lbs.', '4 lbs.'] }],
    [
      { id: 1549, regular_price: '9.95', weight: '0.907', sku: '5483976372749', stock_status: 'instock', attributes: [{ name: 'Size/Weight', option: '2 lbs.' }] },
      { id: 1547, regular_price: '14.95', weight: '1.814', sku: '5483976372749', stock_status: 'instock', attributes: [{ name: 'Size/Weight', option: '4 lbs.' }] },
      { id: 1548, regular_price: '17.95', weight: '3', sku: '5483976372749', stock_status: 'outofstock', attributes: [{ name: 'Size/Weight', option: '6 lbs.' }] },
    ]
  ),
});

describe('canonical single salt lick product card', () => {
  it('renders exactly one canonical parent card without synthetic child splitting', () => {
    const p = product();
    const cards = listingCards([p]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(281);
    expect(cards[0].name).toBe('Licks');
    expect(productCardKey(cards[0])).toBe('281:parent');
    expect(productCardPath(cards[0])).toBe('/products/salt-licks-for-horses');
    expect(cards[0].variations?.options).toHaveLength(3);
  });

  it('correctly maps production product 2543 as exactly ONE card with 2 lb and 6 lb variations', () => {
    const prod: Product = {
      id: 2543,
      slug: 'himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh',
      name: 'Himalayan Pink Salt Lick',
      price: '$12.95 - $19.95',
      priceMin: 12.95,
      priceMax: 19.95,
      inStock: true,
      category: 'Live Stock',
      image: '/images/products/himalayan-salt-lick-rope-front.webp',
      variations: productVariations(
        [{ name: 'Weight', variation: true, options: ['2 lb', '6 lb'] }],
        [
          { id: 2560, regular_price: '12.95', weight: '0.907', sku: 'HK-LFH-2lbs', stock_status: 'instock', attributes: [{ name: 'Weight', option: '2 lb' }] },
          { id: 2561, regular_price: '19.95', weight: '2.721', sku: 'HK-LFH-6lbs', stock_status: 'instock', attributes: [{ name: 'Weight', option: '6 lb' }] },
        ]
      ),
    };

    const cards = listingCards([prod]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(2543);
    expect(cards[0].name).toBe('Himalayan Pink Salt Lick');
    expect(cards[0].selectedVariationId).toBeUndefined();
    expect(cards[0].variations?.options.map(o => o.id)).toEqual([2560, 2561]);
    expect(cards[0].variations?.options.map(o => o.price)).toEqual([12.95, 19.95]);
    expect(productCardPath(cards[0])).toBe('/products/himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh');
  });

  it('deduplicates duplicate product inputs by canonical parent id', () => {
    const p1 = product();
    const p2 = { ...product() };
    const cards = listingCards([p1, p2]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(281);
  });
});
