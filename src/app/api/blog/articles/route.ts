/**
 * Published blog posts for a category hub, matched by category or tag.
 *
 * `Footer` links to the hub pages, which made `lib/categoryContent/index.ts` —
 * and through it the category blog loader — part of the storefront shell. That
 * loader read Supabase directly, so importing the barrel put the SDK on every
 * page in the `(main)` group, including `/about` and `/terms`. The read is
 * public and its result is a handful of cards, so it belongs on this side.
 *
 * An empty list is a normal answer (a hub with no published article falls back to
 * its own editorial registry), so a failed read answers `posts: []` rather than an
 * error: the caller's fallback is already the right behaviour.
 *
 * ## Four questions, one read
 *
 *   (default)     posts for a category hub, matched by category or tag
 *   ?slug=        one published post, for the article page's client refetch
 *   ?related=<id> the "keep reading" strip beside an article
 *   ?posts=       the list the blog index renders
 *
 * They share one route because they are one question — "what has been published?"
 * — asked with different filters, and because they share one table and one
 * permission. The article page used to read this table from the browser, which put
 * the SDK on `/blog/[slug]`; a route serves the same query without shipping the
 * database client to the reader.
 */

import { NextResponse } from 'next/server';
import { getPostsForCategoryHub, wordpressBlog } from '@/lib/blog/wordpressBlog';

export const dynamic = 'force-dynamic';

function listParam(url: URL, name: string): string[] {
  const raw = url.searchParams.get(name) ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const categories = listParam(url, 'categories');
  const tags = listParam(url, 'tags');
  const limit = Number(url.searchParams.get('limit') ?? '4') || 4;
  const slug = (url.searchParams.get('slug') ?? '').trim();
  const related = (url.searchParams.get('related') ?? '').trim();

  try {
    if (slug) {
      const post = await wordpressBlog.getPostBySlug(slug);
      // An unpublished or unknown slug is an empty list rather than a 404: the
      // article page distinguishes "no post" itself, with the copy it already has.
      return NextResponse.json({ posts: post ? [post] : [] });
    }

    if (related) {
      const category = (url.searchParams.get('category') ?? '').trim() || null;
      const posts = await wordpressBlog.getRelatedPosts(related, category, Math.min(limit, 20));
      return NextResponse.json({ posts });
    }

    if (categories.length === 0 && tags.length === 0) {
      return NextResponse.json({ posts: [] });
    }

    const posts = await getPostsForCategoryHub({ categories, tags, limit: Math.min(limit, 20) });
    return NextResponse.json({ posts });
  } catch (error) {
    console.warn('Blog read failed; the caller will use its own fallback:', error);
    return NextResponse.json({ posts: [] });
  }
}
