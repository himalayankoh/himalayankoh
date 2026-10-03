'use client';
import SitemapPage from '@/views/SitemapPage';

interface SitemapProduct {
  name: string;
  slug: string;
  category?: string;
}

export default function SitemapClient({ products }: { products?: SitemapProduct[] }) {
  return <SitemapPage products={products} />;
}
