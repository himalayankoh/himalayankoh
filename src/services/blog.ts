// ============================================================================
// HIMALAYAN KOH — BLOG CMS CLIENT
//
// The blog is WordPress's. Posts, revisions and media live there
// (`lib/blog/wordpressAdminBlog.ts`), and this module is the console's client for
// them: every call goes to `/api/admin/blog/*`, which verifies the signed-in
// admin's session and then talks to WordPress with a credential the browser never
// sees.
//
// It used to be a Supabase client that reached `blog_posts` and `blog_revisions`
// directly from the browser, which meant the console could only edit what one
// database held and the storefront needed its own read path. Now there is one
// article store, one editor (WordPress's, reachable through this console) and one
// published read.
//
// The exported types are declared in the server module and imported with
// `import type`, so they are erased at compile time — this file adds no server code
// to a browser bundle.
// ============================================================================

import type { BlogPost } from '../App';
import type { BlogPostWithAuthor } from '../lib/blog/types';
import { getFreshAccessToken } from './wordpressAdminAuth';
import type { CmsBlogRow, CmsBlogRevision } from '../lib/blog/wordpressAdminBlog';

export type { CmsBlogRow, CmsBlogRevision };

/** The console's create payload. */
export interface CmsBlogCreateInput {
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  heroImageUrl?: string;
  heroImageAlt?: string;
  tags?: string[];
  authorName?: string;
  seoTitle?: string;
  metaDescription?: string;
  targetKeyword?: string;
  secondaryKeywords?: string[];
  searchIntent?: string;
  faq?: { q: string; a: string }[];
  internalLinks?: unknown[];
  scheduleAt?: string | null;
}

/** The console's edit payload — the row's own fields, minus the id. */
export type CmsBlogPatch = Partial<Omit<CmsBlogRow, 'id'>>;

/** The wire shape the admin routes accept (camelCase, only what was supplied). */
type BlogWireInput = Record<string, unknown>;

const POSTS_PATH = '/api/admin/blog/posts';

/** A request with the admin's session attached. Throws a readable error otherwise. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error('Sign in as an administrator to manage the blog.');

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `Request failed (HTTP ${response.status}).`);
  }
  return body as T;
}

/** A console row patch as the wire payload, sending only the fields it carried. */
function toWire(patch: CmsBlogPatch): BlogWireInput {
  const wire: BlogWireInput = {};
  if ('slug' in patch) wire.slug = patch.slug;
  if ('title' in patch) wire.title = patch.title;
  if ('content' in patch) wire.content = patch.content;
  if ('excerpt' in patch) wire.excerpt = patch.excerpt ?? '';
  if ('hero_image_url' in patch) wire.heroImageUrl = patch.hero_image_url ?? '';
  if ('hero_image_alt' in patch) wire.heroImageAlt = patch.hero_image_alt ?? '';
  if ('tags' in patch) wire.tags = patch.tags ?? [];
  if ('author_name' in patch) wire.authorName = patch.author_name ?? '';
  if ('seo_title' in patch) wire.seoTitle = patch.seo_title ?? '';
  if ('meta_description' in patch) wire.metaDescription = patch.meta_description ?? '';
  if ('target_keyword' in patch) wire.targetKeyword = patch.target_keyword ?? '';
  if ('secondary_keywords' in patch) wire.secondaryKeywords = patch.secondary_keywords ?? [];
  if ('search_intent' in patch) wire.searchIntent = patch.search_intent ?? '';
  if ('faq' in patch) wire.faq = patch.faq ?? [];
  return wire;
}

/** Every post, drafts and archive included. */
export async function adminListAll(): Promise<CmsBlogRow[]> {
  const body = await call<{ posts?: CmsBlogRow[] }>(POSTS_PATH);
  return Array.isArray(body.posts) ? body.posts : [];
}

/** Creates a draft. WordPress returns it with its own id and timestamps. */
export async function adminCreate(input: CmsBlogCreateInput): Promise<CmsBlogRow> {
  const body = await call<{ post: CmsBlogRow }>(POSTS_PATH, {
    method: 'POST',
    body: JSON.stringify({
      slug: input.slug,
      title: input.title,
      content: input.content,
      excerpt: input.excerpt ?? '',
      heroImageUrl: input.heroImageUrl ?? '',
      heroImageAlt: input.heroImageAlt ?? '',
      tags: input.tags ?? [],
      authorName: input.authorName ?? '',
      seoTitle: input.seoTitle ?? '',
      metaDescription: input.metaDescription ?? '',
      targetKeyword: input.targetKeyword ?? '',
      secondaryKeywords: input.secondaryKeywords ?? [],
      searchIntent: input.searchIntent ?? '',
      faq: input.faq ?? [],
    }),
  });
  return body.post;
}

/** Saves an edit. Only the fields the patch carried are sent. */
export async function adminUpdate(id: string, patch: CmsBlogPatch): Promise<CmsBlogRow> {
  const body = await call<{ post: CmsBlogRow }>(`${POSTS_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(toWire(patch)),
  });
  return body.post;
}

/** publish / schedule / unpublish / archive / restore. */
export async function adminSetLifecycle(
  id: string,
  action: 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore',
  patch: { scheduled_at?: string | null } = {}
): Promise<CmsBlogRow> {
  const body = await call<{ post: CmsBlogRow }>(`${POSTS_PATH}/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ action, scheduledAt: patch.scheduled_at ?? null }),
  });
  return body.post;
}

/** Soft delete (archive) by default; `permanent` is WordPress's force delete. */
export async function adminDelete(blogId: string, permanent = false): Promise<void> {
  await call(`${POSTS_PATH}/${encodeURIComponent(blogId)}${permanent ? '?permanent=1' : ''}`, {
    method: 'DELETE',
  });
}

/** WordPress's revision history for one post, newest first. */
export async function adminListRevisions(blogId: string): Promise<CmsBlogRevision[]> {
  const body = await call<{ revisions?: CmsBlogRevision[] }>(
    `${POSTS_PATH}/${encodeURIComponent(blogId)}/revisions`
  );
  return Array.isArray(body.revisions) ? body.revisions : [];
}

/** Restores a post to one of its revisions. */
export async function adminRestoreRevision(blogId: string, revision: number): Promise<CmsBlogRow> {
  const body = await call<{ post: CmsBlogRow }>(
    `${POSTS_PATH}/${encodeURIComponent(blogId)}/revisions`,
    { method: 'POST', body: JSON.stringify({ revision }) }
  );
  return body.post;
}

// ---------------------------------------------------------------------------
// The published read used by the media hub's related-articles strip
// ---------------------------------------------------------------------------

/** A published WordPress post, in the storefront's `BlogPost` shape. */
function toBlogPost(post: BlogPostWithAuthor): BlogPost {
  const image = post.featured_image ?? '';
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt || post.title,
    content: post.content || '',
    image,
    images: image ? [image] : [],
    tags: post.tags,
    authorId: post.author_id ?? '',
    authorName: post.author?.full_name || 'Himalayan Koh Editorial Team',
    status: post.is_published ? 'published' : 'draft',
    date: (post.published_at || post.created_at || '').slice(0, 10),
  };
}

/**
 * Published posts for a storefront surface that needs the list.
 *
 * Returns null on a failed read and [] on a reachable-but-empty one — the same
 * contract this function has always had, so a caller keeps its own fallback policy
 * without re-learning it.
 */
export async function loadPublishedBlogs(): Promise<BlogPost[] | null> {
  try {
    const response = await fetch('/api/blog/articles', { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { posts?: BlogPostWithAuthor[] };
    if (!Array.isArray(body.posts)) return null;
    return body.posts.map(toBlogPost);
  } catch {
    return null;
  }
}
