import { describe, expect, it } from 'vitest';
import { CATEGORY_FILTER_TABS, CATEGORY_LINK_BY_TITLE } from './keys';
import { NICHE_SECTIONS } from '../catalog/nicheSections';

describe('storefront category visibility', () => {
  it('carries the owner\'s WooCommerce category names as the public filter labels', () => {
    const labels = new Map(NICHE_SECTIONS.map((section) => [section.key, section.label]));
    expect(labels.get('edible-pink-salt')).toBe('Edible Pink Salt');
    expect(labels.get('licks-blocks')).toBe('Salt Licks');
    expect(labels.get('bulk')).toBe('Bulk and Rock Salt');

    // Every public shelf answers to the store category the owner files products
    // into, so a product filed in WooCommerce is reachable under that name.
    for (const section of NICHE_SECTIONS) {
      for (const wooLabel of section.wooCategoryLabels ?? []) {
        const owner = NICHE_SECTIONS.find((s) => (s.wooCategoryLabels ?? []).includes(wooLabel));
        expect(owner?.key).toBe(section.key);
      }
    }
  });

  it('publishes Bulk and Rock Salt, because the store files a live product under it', () => {
    const bulk = NICHE_SECTIONS.find((section) => section.key === 'bulk');
    expect(bulk).toMatchObject({ label: 'Bulk and Rock Salt', visibleInStorefront: true });
    expect(CATEGORY_FILTER_TABS.some((tab) => tab.label === 'Bulk and Rock Salt')).toBe(true);
    expect(CATEGORY_LINK_BY_TITLE['Bulk and Rock Salt']).toBe('bulk');
  });

  it('keeps the other public shelves visible', () => {
    expect(CATEGORY_FILTER_TABS.map((tab) => tab.label)).toEqual([
      'All',
      'Edible Pink Salt',
      'Cooking & Serving',
      'Salt Licks',
      'Live Stock',
      'Salt Lamps & Décor',
      'Bulk and Rock Salt',
    ]);
  });
});
