import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/serverCatalog', () => ({
  getCatalogProducts: async () => ({ products: [] }),
}));
vi.mock('@/lib/seo/server', () => ({
  siteOrigin: () => 'https://himalayankoh.com',
  fetchSeoBlogPosts: async () => [],
}));

import sitemap from '../../app/sitemap';

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
});
