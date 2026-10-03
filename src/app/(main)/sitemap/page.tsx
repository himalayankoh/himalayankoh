import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import SitemapClient from './SitemapClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Sitemap - Himalayan Koh',
    description:
      'Directory of all Himalayan Koh pages: products, educational resources, quality standards, and policies.',
    path: '/sitemap',
  });
}

export default async function Page() {
  const { products } = await getCatalogProducts().catch(() => ({ products: [] }));
  const mappedProducts = products.map((p) => ({
    name: p.name,
    slug: p.slug,
    category: p.category,
  }));

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Sitemap', path: '/sitemap' },
        ])}
      />
      <SitemapClient products={mappedProducts} />
    </>
  );
}
