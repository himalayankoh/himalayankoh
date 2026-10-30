import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import { fetchSeoBlogPosts } from '@/lib/seo/server';
import JsonLd from '@/components/seo/JsonLd';
import BlogClient from './BlogClient';

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Blog - Himalayan Pink Salt Guides | Himalayan Koh',
    description:
      'Guides on Himalayan pink salt: grain sizes, brining and cooking, storage, salt blocks, lamps and buying in bulk.',
    path: '/blog',
  });
}

export default async function Page() {
  const posts = await fetchSeoBlogPosts().catch(() => []);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ])}
      />
      {/* Server-fetched posts seed the listing so the article links are in the
          initial HTML for crawlers. */}
      <BlogClient initialPosts={posts} />
    </>
  );
}
