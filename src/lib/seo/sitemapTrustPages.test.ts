import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/serverCatalog', () => ({
  getCatalogProducts: async () => ({ products: [] }),
}));
vi.mock('@/lib/seo/server', () => ({
  siteOrigin: () => 'https://himalayankoh.com',
  fetchSeoBlogPosts: async () => [],
}));

import sitemap from '../../app/sitemap';
import { RESOURCE_ARTICLES } from '@/data/resources';

/**
 * `/editorial-policy` explains how the guides are researched, sourced, edited and
 * corrected, and it is the page that answers "who is responsible for this
 * content?". It was linked from the footer and the HTML sitemap but absent from the
 * XML sitemap, so the trust page was reachable from every page except the index a
 * crawler actually reads.
 */
describe('XML sitemap trust pages', () => {
  it('lists the editorial policy exactly once, on the canonical origin', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const policyUrls = urls.filter((url) => url.endsWith('/editorial-policy'));

    expect(policyUrls).toEqual(['https://himalayankoh.com/editorial-policy']);
  });

  it('includes the active resource library and all twelve guides with recorded dates', async () => {
    const entries = await sitemap();
    expect(entries.filter(e => e.url.endsWith('/resources'))).toHaveLength(1);
    for (const article of RESOURCE_ARTICLES) {
      const matches = entries.filter(e => e.url === `https://himalayankoh.com/resources/${article.slug}`);
      expect(matches).toHaveLength(1);
      expect(matches[0].lastModified).toEqual(new Date(article.updatedAt));
    }
    expect(entries.find(e => e.url.endsWith('/about'))?.lastModified).toBeUndefined();
  });
});
