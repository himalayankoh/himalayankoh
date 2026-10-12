'use client';
import ResourceDetailPage from '@/views/ResourceDetailPage';
import type { ResourceArticle } from '@/data/resources';
import type { RelatedProductRef } from '@/lib/resources/relatedProducts';

export default function ResourceDetailClient({
  article,
  relatedProducts,
}: {
  article: ResourceArticle;
  relatedProducts: RelatedProductRef[];
}) {
  return <ResourceDetailPage article={article} relatedProducts={relatedProducts} />;
}
