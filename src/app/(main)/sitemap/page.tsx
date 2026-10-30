import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import { fetchSeoBlogPosts } from '@/lib/seo/server';
import SitemapClient from './SitemapClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Sitemap - Himalayan Koh',
    description:
      'Directory of all Himalayan Koh pages: products, guides, quality standards, and policies.',
    path: '/sitemap',
  });
}

export default async function Page() {
  // Both reads degrade to an empty list on failure, and the catalogue one in
  // particular must not fail this page: a store outage costs the sitemap its
  // product links, not the whole route.
  const [{ products }, posts] = await Promise.all([
    getCatalogProducts().catch(() => ({ products: [] })),
    fetchSeoBlogPosts(),
  ]);

  const mappedProducts = products.map((p) => ({
    name: p.name,
    slug: p.slug,
    category: p.category,
  }));

  const mappedArticles = posts
    .filter((post) => post.slug)
    .map((post) => ({ title: post.title, slug: post.slug }));

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Sitemap', path: '/sitemap' },
        ])}
      />
      <SitemapClient products={mappedProducts} articles={mappedArticles} />
    </>
  );
}
