'use client';
import SitemapPage from '@/views/SitemapPage';

interface SitemapProduct {
  name: string;
  slug: string;
  category?: string;
}

interface SitemapArticle {
  title: string;
  slug: string;
}

export default function SitemapClient({
  products,
  articles,
}: {
  products?: SitemapProduct[];
  articles?: SitemapArticle[];
}) {
  return <SitemapPage products={products} articles={articles} />;
}
