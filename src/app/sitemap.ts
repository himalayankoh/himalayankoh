import type { MetadataRoute } from 'next';
import { siteOrigin, fetchSeoBlogPosts } from '@/lib/seo/server';
import { buildProductsCategoryPath, productsCategoryTabs } from '@/lib/categoryContent';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import { getAllAuthors } from '@/data/authors';
import { getAllResourceArticles } from '@/data/resources';
import { isLegacyProductRedirectSource } from '@/lib/seo/legacyRedirects';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** Static routes always present in the sitemap. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: ChangeFrequency }[] = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/products', priority: 0.9, changeFrequency: 'daily' },
  { path: '/resources', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/gallery', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/faqs', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/disclaimer', priority: 0.5, changeFrequency: 'monthly' },
  // How the guides are researched, sourced, edited and corrected. It is linked from
  // the footer and the HTML sitemap but was missing here, so the one page that
  // explains who is responsible for the educational content was the one page a
  // crawler could not reach from the sitemap.
  { path: '/editorial-policy', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/sitemap', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/shipping', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/returns', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${origin}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // The catalog goes through the backend layer so the sitemap, the listing page
  // and the product page can never disagree about which products exist or what
  // they are called. The WooCommerce backend already applies the same
  // "real catalog product" gate this file used to apply itself. Category
  // membership now comes from each product's resolved category name, so the
  // separate categories query is no longer needed to join the two.
  // The posts read goes through the blog layer rather than a query of its own, so
  // an unreachable CMS costs the sitemap its article URLs instead of failing the
  // prerender — which is what took a deployment build down.
  const [{ products: realProducts }, posts] = await Promise.all([
    getCatalogProducts(),
    fetchSeoBlogPosts(),
  ]);

  // `/blog` is listed only when a pink-salt article is actually published. The
  // blog store still holds the livestock-era posts, and `fetchSeoBlogPosts`
  // withholds them — so the listing can legitimately be empty, and advertising an
  // empty listing sends crawlers to a page with nothing on it. It returns to the
  // sitemap on its own as soon as a suitable article exists.
  if (posts.length > 0) {
    entries.push({
      url: `${origin}/blog`,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  // A category hub with no real product isn't worth crawling — it's already
  // noindexed on the page itself (see products/page.tsx), so listing it here
  // would just send crawlers to a page that asks not to be indexed.
  //
  // Use exactly the active pills' keys, including owner-created Woo categories.
  // Heuristic size shelves must not advertise a URL the grid cannot filter by.
  for (const tab of productsCategoryTabs(realProducts)) {
    if (!tab.key) continue;

    entries.push({
      url: `${origin}${buildProductsCategoryPath(tab.key)}`,
      changeFrequency: 'weekly',
      priority: 0.85,
    });
  }

  for (const product of realProducts) {
    // The source can still contain a historical product slug after its page has
    // been permanently redirected to a replacement. Sitemaps should advertise
    // destinations, not URLs that require another crawl hop (or describe a
    // different current SKU).
    if (isLegacyProductRedirectSource(product.slug)) continue;

    entries.push({
      url: `${origin}/products/${product.slug}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : undefined,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  for (const post of posts) {
    if (!post.slug || post.id?.startsWith('res-')) continue;
    entries.push({
      url: `${origin}/blog/${post.slug}`,
      lastModified: post.updated_at ? new Date(post.updated_at) : post.published_at ? new Date(post.published_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  // These twelve published guides are indexable, canonical pages, independent
  // of the WordPress blog. Their own recorded edits are the source of lastmod.
  for (const article of getAllResourceArticles()) {
    entries.push({
      url: `${origin}/resources/${article.slug}`,
      lastModified: new Date(article.updatedAt || article.publishedAt),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  for (const author of getAllAuthors()) {
    entries.push({
      url: `${origin}/author/${author.slug}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
