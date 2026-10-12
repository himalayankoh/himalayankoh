import { describe, expect, it } from 'vitest';
import { POLICY_PAGES, STATIC_PAGES } from '@/views/SitemapPage';

/**
 * The HTML sitemap is the one crawlable index the site publishes itself, so it has
 * to point at the educational content. It did not: the guides block was rendered
 * behind a `false &&` for the retired `/resources` library, so `/sitemap` shipped
 * with no link to `/blog` and no link to any article, while the article itself was
 * live and in the XML sitemap.
 */
describe('HTML sitemap links', () => {
  it('advertises the blog and the editorial policy', () => {
    expect(STATIC_PAGES.some((page) => page.href === '/blog')).toBe(true);
    expect(POLICY_PAGES.some((page) => page.href === '/editorial-policy')).toBe(true);
  });

  it('keeps every entry a real relative route', () => {
    for (const page of [...STATIC_PAGES, ...POLICY_PAGES]) {
      expect(page.href.startsWith('/'), `${page.name} should be a site-relative route`).toBe(true);
    }
  });

  it('links the active twelve-guide resources library alongside the blog', () => {
    expect(STATIC_PAGES.filter((page) => page.href === '/resources')).toHaveLength(1);
  });
});
