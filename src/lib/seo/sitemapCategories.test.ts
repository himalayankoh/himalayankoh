import { describe, expect, it, vi } from 'vitest';
import { productsCategoryTabs, buildProductsCategoryPath } from '../categoryContent/keys';

const { catalogue } = vi.hoisted(() => ({ catalogue: [
  { name: 'Salt Rock for Cattle 30 Lbs', slug: 'cattle-rock', category: 'Salt Blocks' },
  { name: 'Himalayan Salt Block for Serving', slug: 'serving-block', category: 'Salt Blocks' },
  { name: 'Himalayan Pink Salt for Livestock 45 lbs', slug: 'livestock-bag', category: 'Live Stock' },
  { name: 'Himalayan Pink Salt for Livestock 6 lbs', slug: 'livestock-pouch', category: 'Live Stock' },
  { name: 'Himalayan Pink Salt Gift Trio', slug: 'gift-trio', category: 'Gift Sets & Samplers' },
] }));
vi.mock('@/lib/backend/serverCatalog', () => ({ getCatalogProducts: async () => ({ products: catalogue }) }));
vi.mock('@/lib/seo/server', () => ({
  siteOrigin: () => 'https://preview.himalayankoh.com', fetchSeoBlogPosts: async () => [],
}));
import sitemap from '../../app/sitemap';

describe('sitemap uses actual storefront categories', () => {
  it('includes exactly the pills, including active cooking and Live Stock, once each', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const categoryUrls = urls.filter((url) => url.includes('?category='));
    expect(categoryUrls).toEqual(productsCategoryTabs(catalogue)
      .filter((tab) => tab.key)
      .map((tab) => `https://preview.himalayankoh.com${buildProductsCategoryPath(tab.key)}`));
    expect(categoryUrls.some((url) => url.endsWith('category=cooking-serving'))).toBe(true);
    expect(categoryUrls.some((url) => url.endsWith('category=live-stock'))).toBe(true);
    expect(new Set(categoryUrls).size).toBe(categoryUrls.length);
    expect(categoryUrls.some((url) => url.endsWith('category=bulk'))).toBe(false);
    expect(urls.some((url) => /\/resources(?:\/|$)|grain-size-guide/.test(url))).toBe(false);
  });
});
