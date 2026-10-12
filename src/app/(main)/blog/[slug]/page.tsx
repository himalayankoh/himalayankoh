import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import { lookupSeoBlogPostFull } from '@/lib/seo/server';
import { isOffNicheBlogPost } from '@/lib/catalog/nicheBlog';
import { SITE_NAME } from '@/lib/seo/constants';
import JsonLd from '@/components/seo/JsonLd';
import BlogDetailClient from './BlogDetailClient';

type Params = { slug: string };

/**
 * Reading the slug once per render is deliberate: metadata and body must agree
 * about whether the post exists, and the lookup now answers `missing` (a fact —
 * answer 404), `found`, or `unavailable` (the read failed — never 404).
 */
async function readSlug(slug: string) {
  return lookupSeoBlogPostFull(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await readSlug(slug);

  // A slug the store says does not exist is a 404, decided before anything is
  // flushed, so the response status can still be set.
  if (lookup.state === 'missing') notFound();

  if (lookup.state === 'unavailable') {
    // The store could not be read. The page still renders (the browser refetch may
    // yet find the article), but until it does this URL holds no article, so it is
    // not offered to crawlers as one. The next successful read drops the noindex
    // on its own.
    return buildMetadata({
      title: 'Guides - Himalayan Koh',
      description: 'Himalayan pink salt guides: grain sizes, cooking, storage and buying in bulk.',
      path: `/blog/${slug}`,
      noindex: true,
    });
  }

  const post = lookup.post;

  return buildMetadata({
    // Matches the title the hydrated view sets, so the tab title does not
    // change on hydration and crawlers see one consistent title.
    title: post.meta_title || `${post.title} | ${SITE_NAME}`,
    description: post.meta_description || post.excerpt || undefined,
    path: `/blog/${post.slug}`,
    ogImage: post.featured_image,
    ogType: 'article',
    // Articles written for the livestock/pet trade are still in the blog store
    // from the old site. They stay readable at their old URL so nothing that was
    // ever public 404s, but they are noindexed and kept out of the listing and
    // the sitemap, because this storefront sells Himalayan pink salt for people.
    noindex: isOffNicheBlogPost({ title: post.title, slug: post.slug, excerpt: post.excerpt }),
  });
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const lookup = await readSlug(slug);

  if (lookup.state === 'missing') notFound();

  const post = lookup.state === 'found' ? lookup.post : null;

  return (
    <>
      {post && (
        <>
          <JsonLd
            data={articleJsonLd({
              title: post.title,
              description: post.meta_description || post.excerpt,
              slug: post.slug,
              image: post.featured_image,
              publishedAt: post.published_at,
              updatedAt: post.updated_at,
              authorName: post.author?.full_name,
              authorType: post.author?.full_name?.startsWith('Himalayan Koh') ? 'Organization' : 'Person',
            })}
          />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Blog', path: '/blog' },
              { name: post.title, path: `/blog/${post.slug}` },
            ])}
          />
        </>
      )}
      {/* Seeding the client view with the server-fetched post puts the article
          body in the initial HTML instead of a loading spinner. The key remounts
          the view on post-to-post navigation so the new seed is picked up.
          `unavailable` tells the view the server could not read the store, so it
          shows an honest retryable state rather than a spinner that never
          resolves if the refetch fails too. */}
      <BlogDetailClient
        key={post?.slug ?? slug}
        initialPost={post}
        unavailable={lookup.state === 'unavailable'}
      />
    </>
  );
}
