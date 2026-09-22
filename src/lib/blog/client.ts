/**
 * The browser's half of the blog read.
 *
 * The article page used to fetch its post (and its "keep reading" strip) straight
 * from Supabase, behind an `isSupabaseConfigured()` check. That is why
 * `/blog/[slug]` — a public page with no account on it — downloaded the Supabase
 * SDK, and why a missing Supabase env var turned the page into an empty shell
 * instead of an article. Both reads now go to `/api/blog/articles`, which owns the
 * database client and answers the same query.
 *
 * The post type is imported with `import type`, so it is erased at compile time:
 * the module it is declared in is never pulled into this bundle.
 */

import type { BlogPostWithAuthor } from './types';

export type { BlogPostWithAuthor };

interface ArticlesResponse {
  posts?: BlogPostWithAuthor[];
  error?: string;
}

async function call(params: URLSearchParams): Promise<BlogPostWithAuthor[]> {
  const response = await fetch(`/api/blog/articles?${params.toString()}`, { cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as ArticlesResponse;

  if (!response.ok) {
    throw new Error(body.error || 'The blog could not be reached right now.');
  }
  return body.posts ?? [];
}

export const blogPostApi = {
  /** One published post by slug, or null when there is none. */
  async getPostBySlug(slug: string): Promise<BlogPostWithAuthor | null> {
    const posts = await call(new URLSearchParams({ slug }));
    return posts[0] ?? null;
  },

  /** Other published posts, preferring the same category. */
  async getRelatedPosts(
    postId: string,
    category: string | null,
    limit = 3
  ): Promise<BlogPostWithAuthor[]> {
    const params = new URLSearchParams({ related: postId, limit: String(limit) });
    if (category) params.set('category', category);
    return call(params);
  },
};
