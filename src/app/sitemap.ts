import type { MetadataRoute } from 'next';
import { siteOrigin, fetchSeoBlogPosts } from '@/lib/seo/server';
import { buildProductsCategoryPath, productShelfKey } from '@/lib/categoryContent';
import { NICHE_SECTIONS } from '@/lib/catalog/nicheSections';
import type { CategoryContentKey } from '@/lib/categoryContent';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import { RESOURCE_ARTICLES } from '@/data/resources';
import { getAllAuthors } from '@/data/authors';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** Static routes always present in the sitemap. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: ChangeFrequency }[] = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/products', priority: 0.9, changeFrequency: 'daily' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/quality', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/resources', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/gallery', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/faqs', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/disclaimer', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/sitemap', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/shipping', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/returns', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${origin}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // The catalog goes through the backend layer so the sitemap, the listing page
  // and the product page can never disagree about which products exist or what
  // they are called. The backend's Supabase source already applies the same
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
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  // A category hub with no real product isn't worth crawling — it's already
  // noindexed on the page itself (see products/page.tsx), so listing it here
  // would just send crawlers to a page that asks not to be indexed.
  //
  // Shelves come from the niche taxonomy and are counted by the same placement
  // function the shop grid uses, so the sitemap can never advertise a hub the
  // grid would render empty, or omit one that has products behind it.
  const shelvesWithProducts = new Set(
    realProducts.map((product) => productShelfKey(product)).filter(Boolean)
  );

  // Category hubs are real landing pages (own hero, copy, guides, SEO title) served
  // from /products?category=<key>. Without these the hub content is unreachable to
  // crawlers, which only ever see the unfiltered /products page.
  for (const section of NICHE_SECTIONS) {
    if (!section.visibleInStorefront || !shelvesWithProducts.has(section.key)) continue;

    entries.push({
      url: `${origin}${buildProductsCategoryPath(section.key)}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    });
  }

  for (const product of realProducts) {
    entries.push({
      url: `${origin}/products/${product.slug}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  for (const post of posts) {
    if (!post.slug) continue;
    entries.push({
      url: `${origin}/blog/${post.slug}`,
      lastModified: post.updated_at ? new Date(post.updated_at) : post.published_at ? new Date(post.published_at) : now,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  for (const article of RESOURCE_ARTICLES) {
    entries.push({
      url: `${origin}/resources/${article.slug}`,
      lastModified: new Date(article.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  for (const author of getAllAuthors()) {
    entries.push({
      url: `${origin}/author/${author.slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
