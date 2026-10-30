import { describe, expect, it } from 'vitest';
import { buildMetadata } from './metadata';

/**
 * The `robots` meta tag is a *denial* channel only.
 *
 * Staging and temporary deployments are made non-indexable per request, by the
 * `X-Robots-Tag` header and `robots.txt` (`lib/seo/indexing.ts`), because a
 * static build cannot know which host will serve it. That makes an `index,
 * follow` tag in the HTML actively harmful: the deployed staging page was found
 * carrying one while its own headers said `noindex, nofollow`, so two signals
 * disagreed about the same response.
 *
 * The page-level denial still has to exist, because `/login`, `/account` and the
 * admin routes must stay out of the index on production as well.
 */
describe('buildMetadata robots', () => {
  it('emits no robots tag when a page may be indexed', () => {
    const metadata = buildMetadata({ path: '/products' });
    expect(metadata.robots).toBeUndefined();
  });

  it('emits an explicit denial when a page must not be indexed', () => {
    expect(buildMetadata({ path: '/login', noindex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it('never emits a permitting tag, whatever the path', () => {
    // A regression guard for the shape rather than one route: `index: true` is
    // the value that must not come back.
    for (const path of ['/', '/products', '/about', '/checkout']) {
      const robots = buildMetadata({ path }).robots as { index?: boolean } | undefined;
      expect(robots?.index).not.toBe(true);
    }
  });
});
