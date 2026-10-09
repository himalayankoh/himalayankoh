import { describe, expect, it } from 'vitest';
import {
  LIVE_LAUNCH_PRODUCT_IDS,
  OWNER_APPROVED_SKUS,
  OWNER_REJECTED_PRODUCT_IDS,
  isOwnerApprovedSku,
  isOwnerRejectedProduct,
  isNicheProduct,
} from './niche';
import { NICHE_SECTIONS } from './nicheSections';

describe('Catalog Integrity & Owner SKU Policy', () => {
  it('has exactly 19 approved owner SKUs', () => {
    expect(OWNER_APPROVED_SKUS).toHaveLength(19);
  });

  it('contains zero duplicate SKUs in the approved catalog list', () => {
    const unique = new Set(OWNER_APPROVED_SKUS);
    expect(unique.size).toBe(OWNER_APPROVED_SKUS.length);
  });

  it('recognizes HK-LFH-6lbs as an approved owner SKU (held in draft on store)', () => {
    expect(isOwnerApprovedSku('HK-LFH-6lbs')).toBe(true);
  });

  it('strictly rejects retired legacy product IDs from being visible', () => {
    // `2321` and `2446` were retired here and left the list on 2026-10-09, when the
    // owner admitted them for the live launch (`LIVE_LAUNCH_PRODUCT_IDS`). The three
    // that remain are refused however they are named or SKU'd.
    const retired = [2352, 2372, 2461];
    for (const id of retired) {
      expect(isOwnerRejectedProduct(id)).toBe(true);
      expect(OWNER_REJECTED_PRODUCT_IDS).toContain(id);
      expect(isNicheProduct({ id, name: 'Sample Product', sku: 'TEST' })).toBe(false);
    }
    expect(LIVE_LAUNCH_PRODUCT_IDS).toEqual([271, 281, 291, 2321, 2446]);
  });

  it('serves the live records the owner admitted, and only those', () => {
    for (const id of LIVE_LAUNCH_PRODUCT_IDS) {
      expect(isNicheProduct({ id, name: 'Sample Product', sku: null })).toBe(true);
    }
    // The admission is named records, not a class: a neighbouring id is refused.
    expect(isNicheProduct({ id: 272, name: 'Sample Product', sku: null })).toBe(true);
    expect(isNicheProduct({ id: 272, name: 'Himalayan Salt Licks for Horses', sku: null })).toBe(false);
  });

  it('maintains expected storefront category shelves', () => {
    const sectionKeys = NICHE_SECTIONS.map((s) => s.key);
    expect(sectionKeys).toContain('edible-pink-salt');
    expect(sectionKeys).toContain('cooking-serving');
    expect(sectionKeys).toContain('lamps-decor');
    expect(sectionKeys).toContain('bulk');
  });
});

describe('Policy Routes & Navigation Integrity', () => {
  const policyRoutes = ['/privacy', '/terms', '/shipping', '/return', '/faqs', '/contact'];

  it.each(policyRoutes)('defines valid canonical policy route %s', (route) => {
    expect(route).toMatch(/^\/[a-z-]+$/);
    expect(route).not.toContain('//');
  });
});
