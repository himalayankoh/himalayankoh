import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import {
  getAllResourceArticles,
  getResourceArticleBySlug,
} from '@/data/resources';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import {
  resolveRelatedProducts,
  type RelatedProductRef,
} from '@/lib/resources/relatedProducts';
import { AUTHORS } from '@/data/authors';
import ResourceDetailClient from './ResourceDetailClient';

type Params = { slug: string };

export function generateStaticParams() {
  return getAllResourceArticles().map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceArticleBySlug(slug);

  if (!article) {
    return buildMetadata({
      title: 'Resource Guide - Himalayan Koh',
      description: 'Educational guide on Himalayan pink salt applications and mineral management.',
      path: `/resources/${slug}`,
    });
  }

  return buildMetadata({
    title: `${article.title} | Himalayan Koh`,
    description: article.metaDescription || article.summary,
    path: `/resources/${article.slug}`,
    ogImage: article.featuredImage,
    ogType: 'article',
  });
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = getResourceArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const author = AUTHORS[article.authorId];

  // Resolve the guide's product links against the active catalogue at
  // prerender: a slug the catalogue no longer carries renders nothing instead
  // of a 404 card, and a failed catalogue read resolves to none for the same
  // reason — the bar is decorative, and a transient backend failure must not
  // publish dead links.
  let relatedProducts: RelatedProductRef[] = [];
  try {
    const { products } = await getCatalogProducts();
    relatedProducts = resolveRelatedProducts(article.relatedProductSlugs, products, article.productUse);
  } catch (err) {
    console.error('Could not resolve related products for /resources:', err);
  }

  return (
    <>
      <JsonLd
        data={articleJsonLd({
          title: article.title,
          description: article.metaDescription || article.summary,
          slug: article.slug,
          path: `/resources/${article.slug}`,
          image: article.featuredImage,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          authorName: author?.name || 'Himalayan Koh Editorial Team',
          authorType: 'Organization',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/resources' },
          { name: article.title, path: `/resources/${article.slug}` },
        ])}
      />
      <ResourceDetailClient article={article} relatedProducts={relatedProducts} />
    </>
  );
}
