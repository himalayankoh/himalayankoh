import { NextResponse } from 'next/server';
import { fetchSeoBlogPosts } from '@/lib/seo/server';

/**
 * The public blog listing, served from the server.
 *
 * `fetchSeoBlogPosts` is the same read the blog page and the sitemap use, and it
 * is the sealed one: the blog store still holds articles written for the livestock
 * and pet trade from the old site, and it withholds them. The browser used to read
 * the store itself and drop those posts after they arrived — which is not the same
 * thing as never sending them, and which put the withholding rule in a public
 * bundle as well. Now the rule lives only where it is applied.
 *
 * `no-store`, like `/api/catalog`: a listing that changes as the owner publishes is
 * not a listing to cache.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const posts = await fetchSeoBlogPosts();
  return NextResponse.json({ posts }, { headers: { 'Cache-Control': 'no-store' } });
}
