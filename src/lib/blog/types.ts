/**
 * The shape every blog screen renders.
 *
 * These fields used to be the Supabase `blog_posts` row plus its `profiles` join.
 * They are declared here, on their own, so the screens that render a post do not
 * name a database — the blog is WordPress's now (`lib/blog/wordpressBlog.ts`), and
 * a view imports this file rather than the store module that used to define it.
 */

export interface BlogAuthor {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface BlogPostWithAuthor {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image: string | null;
  author_id: string | null;
  category: string | null;
  tags: string[];
  is_published: boolean;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  /** Estimated reading time in minutes, computed from the post's words. */
  read_time: number;
  /**
   * Always 0. WordPress has no native view counter, and this app no longer keeps
   * one of its own: an owner who wants view counts should use an analytics plugin
   * rather than have this app invent a number the store cannot verify.
   */
  view_count: number;
  created_at: string;
  updated_at: string;
  author: BlogAuthor | null;
}

export interface BlogFilters {
  category?: string;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
