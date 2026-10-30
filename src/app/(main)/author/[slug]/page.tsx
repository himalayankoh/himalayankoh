import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import { getAuthorBySlug, getAllAuthors } from '@/data/authors';
import AuthorClient from './AuthorClient';

type Params = { slug: string };

export function generateStaticParams() {
  return getAllAuthors().map((author) => ({
    slug: author.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = getAuthorBySlug(slug);

  if (!author) {
    return buildMetadata({
      title: 'Author Profile - Himalayan Koh',
      description: 'Author profile and research contributions at Himalayan Koh.',
      path: `/author/${slug}`,
    });
  }

  return buildMetadata({
    title: `${author.name} - ${author.role} | Himalayan Koh`,
    description: author.bio.slice(0, 160),
    path: `/author/${author.slug}`,
  });
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const author = getAuthorBySlug(slug);

  if (!author) {
    notFound();
  }

  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    jobTitle: author.role,
    description: author.bio,
    knowsAbout: author.expertise,
  };

  return (
    <>
      <JsonLd data={personJsonLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/resources' },
          { name: author.name, path: `/author/${author.slug}` },
        ])}
      />
      <AuthorClient author={author} />
    </>
  );
}
