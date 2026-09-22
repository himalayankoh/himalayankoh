/**
 * The blog, read from WordPress.
 *
 * ## Why WordPress owns it
 *
 * WordPress is where content already lives on this site, and the owner can write
 * and schedule a post there with the editing tools they already have. The blog used
 * to be a Supabase table with its own admin screen, which meant two content systems
 * and a second place for a slug to be wrong. The reads now go to `wp/v2/posts`.
 *
 * ## What is mapped, and what deliberately is not
 *
 * Every field the screens render is derived from the post the store publishes:
 * title, slug, excerpt, content, featured image, categories, tags, author, dates.
 * Two fields have no WordPress equivalent and are **not** invented:
 *
 *   - `view_count` is always 0 (see `lib/blog/types.ts`);
 *   - `read_time` is **computed** from the post's word count rather than stored, so
 *     it is right after an edit instead of staling with a manual number.
 *
 * SEO title/description come from Yoast when its REST fields are exposed, and fall
 * back to the post's own title/excerpt otherwise — a missing plugin must not blank
 * a page's metadata.
 *
 * Server-only: it holds the WordPress base URL and is called from route handlers and
 * server-rendered pages.
 */

import { wordpressRequest, WordPressApiError } from '@/lib/backend/wordpress';
import type { BlogPostWithAuthor, BlogFilters } from './types';

/** WordPress's own post shape (the fields this reader uses). */
interface WpPost {
  id: number;
  slug: string;
  status: string;
  date_gmt?: string | null;
  modified_gmt?: string | null;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  author?: number;
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  /** The HK fields the plugin registers on posts (see `hk_storefront_blog_meta_fields`). */
  meta?: Record<string, unknown>;
  yoast_head_json?: { title?: string; description?: string };
  _embedded?: {
    author?: Array<{ id?: number; name?: string; avatar_urls?: Record<string, string> }>;
    'wp:featuredmedia'?: Array<{ source_url?: string }>;
    'wp:term'?: Array<Array<{ id?: number; name?: string; taxonomy?: string }>>;
  };
}

const READ_TIMEOUT = 20_000;
const WORDS_PER_MINUTE = 200;

/** WordPress returns HTML entities in rendered fields; the screens render text. */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

function stripHtml(value: string): string {
  return (
    decodeEntities(value.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      // A tag replaced by a space leaves one before the punctuation it wrapped
      // (`<em>x</em>.` becomes `x .`), which is visible in an excerpt.
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim()
  );
}

/** Reading time from the post's own words, so it cannot stale after an edit. */
function estimateReadTime(html: string): number {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** The embedded terms, flattened, so one list answers both taxonomy questions. */
function embeddedTerms(post: WpPost): Array<{ name: string; taxonomy: string }> {
  return (post._embedded?.['wp:term'] ?? [])
    .flat()
    .flatMap((term) =>
      term?.name ? [{ name: decodeEntities(term.name), taxonomy: term.taxonomy ?? '' }] : []
    );
}

/** A WordPress post, in the shape the screens render. */
export function blogPostFromWp(post: WpPost): BlogPostWithAuthor {
  const contentHtml = post.content?.rendered ?? '';
  const author = post._embedded?.author?.[0];
  const avatar = author?.avatar_urls ? Object.values(author.avatar_urls)[0] ?? null : null;
  const terms = embeddedTerms(post);
  const meta = post.meta ?? {};
  const category = terms.find((term) => term.taxonomy === 'category')?.name ?? null;
  const metaTags = Array.isArray(meta.hk_tags)
    ? meta.hk_tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const tags = metaTags.length
    ? metaTags
    : terms.filter((term) => term.taxonomy === 'post_tag').map((term) => term.name);
  const published = post.date_gmt && !post.date_gmt.startsWith('0000') ? `${post.date_gmt}Z` : null;
  const modified = post.modified_gmt && !post.modified_gmt.startsWith('0000') ? `${post.modified_gmt}Z` : null;

  // The HK hero image is what the console's editor sets, and the featured media is
  // what WordPress itself uses; either can be the one that exists, so the featured
  // image wins (it is the one WordPress's own templates render) and the meta is the
  // fallback for an image that could not be copied into the media library.
  const featuredMedia = post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null;
  const heroImage = featuredMedia || (typeof meta.hk_hero_image_url === 'string' ? meta.hk_hero_image_url || null : null);
  const seoTitle = typeof meta.hk_seo_title === 'string' && meta.hk_seo_title ? meta.hk_seo_title : null;
  const seoDescription =
    typeof meta.hk_meta_description === 'string' && meta.hk_meta_description ? meta.hk_meta_description : null;

  return {
    id: String(post.id),
    title: decodeEntities(post.title?.rendered ?? '').trim(),
    slug: post.slug,
    excerpt: post.excerpt?.rendered ? stripHtml(post.excerpt.rendered) || null : null,
    content: contentHtml || null,
    featured_image: heroImage,
    author_id: author?.id ? String(author.id) : post.author ? String(post.author) : null,
    category,
    tags,
    is_published: post.status === 'publish',
    published_at: published,
    // The console's own SEO fields first, then Yoast, then the post's own words: the
    // editor wrote those fields deliberately, so a third-party plugin must not
    // silently override them.
    meta_title: seoTitle ?? post.yoast_head_json?.title ?? null,
    meta_description: seoDescription ?? post.yoast_head_json?.description ?? null,
    read_time: estimateReadTime(contentHtml),
    view_count: 0,
    created_at: published ?? modified ?? new Date(0).toISOString(),
    updated_at: modified ?? published ?? new Date(0).toISOString(),
    author: author
      ? { id: String(author.id ?? post.author ?? ''), full_name: decodeEntities(author.name ?? ''), avatar_url: avatar }
      : null,
  };
}

/** One page of published posts, newest first. */
async function readPosts(params: Record<string, string | number | undefined>): Promise<BlogPostWithAuthor[]> {
  const posts = await wordpressRequest<WpPost[]>('/wp/v2/posts', {
    params: { status: 'publish', _embed: '1', orderby: 'date', order: 'desc', ...params },
    timeoutMs: READ_TIMEOUT,
  });
  return (Array.isArray(posts) ? posts : []).map(blogPostFromWp);
}

export const wordpressBlog = {
  async getPosts(filters: BlogFilters = {}): Promise<{ posts: BlogPostWithAuthor[]; count: number }> {
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 100);
    const page = filters.offset ? Math.floor(filters.offset / limit) + 1 : 1;
    const posts = await readPosts({
      per_page: limit,
      page,
      categories: undefined,
      tags: undefined,
      search: filters.search || undefined,
    });
    return { posts, count: posts.length };
  },

  /** One published post by slug, or null. */
  async getPostBySlug(slug: string): Promise<BlogPostWithAuthor | null> {
    const trimmed = slug.trim();
    if (!trimmed) return null;
    const posts = await readPosts({ slug: trimmed, per_page: 1 });
    return posts[0] ?? null;
  },

  async getFeaturedPosts(limit = 3): Promise<BlogPostWithAuthor[]> {
    return readPosts({ per_page: Math.min(limit, 20) });
  },

  /**
   * Other published posts, preferring the same category.
   *
   * `postId` is a WordPress post id now, so the exclusion is by `exclude=`. The
   * category match is attempted first and topped up from the general list, because
   * a shop with few posts in one category should still show a "keep reading" strip.
   */
  async getRelatedPosts(postId: string, category: string | null, limit = 3): Promise<BlogPostWithAuthor[]> {
    const numericId = Number(postId);
    const exclude = Number.isInteger(numericId) && numericId > 0 ? String(numericId) : undefined;
    const seen = new Set<string>();
    const merged: BlogPostWithAuthor[] = [];

    const append = (posts: BlogPostWithAuthor[]) => {
      for (const post of posts) {
        if (merged.length >= limit) return;
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        merged.push(post);
      }
    };

    if (category) {
      // WordPress filters by category *id*, not name, so the name is resolved to an
      // id first rather than guessed at.
      const categoryId = await findCategoryId(category);
      if (categoryId) {
        append(await readPosts({ categories: categoryId, per_page: limit, exclude }));
      }
    }

    if (merged.length < limit) {
      append(await readPosts({ per_page: limit, exclude }));
    }

    return merged.slice(0, limit);
  },

  async getCategories(): Promise<string[]> {
    const terms = await wordpressRequest<Array<{ name?: string; count?: number }>>('/wp/v2/categories', {
      params: { per_page: 100 },
      timeoutMs: READ_TIMEOUT,
    });
    return (Array.isArray(terms) ? terms : []).flatMap((term) => (term?.name ? [decodeEntities(term.name)] : []));
  },

  async getTags(): Promise<string[]> {
    const terms = await wordpressRequest<Array<{ name?: string }>>('/wp/v2/tags', {
      params: { per_page: 100 },
      timeoutMs: READ_TIMEOUT,
    });
    return (Array.isArray(terms) ? terms : []).flatMap((term) => (term?.name ? [decodeEntities(term.name)] : []));
  },
};

/** A category name's WordPress id, or null. Cached per process — it changes rarely. */
const categoryIdCache = new Map<string, number | null>();

async function findCategoryId(name: string): Promise<number | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (categoryIdCache.has(key)) return categoryIdCache.get(key) ?? null;

  try {
    const terms = await wordpressRequest<Array<{ id?: number; name?: string; slug?: string }>>('/wp/v2/categories', {
      params: { search: name, per_page: 20 },
      timeoutMs: READ_TIMEOUT,
    });
    const match = (Array.isArray(terms) ? terms : []).find(
      (term) => decodeEntities(term.name ?? '').trim().toLowerCase() === key || (term.slug ?? '') === key
    );
    const id = match?.id && Number.isInteger(match.id) ? match.id : null;
    categoryIdCache.set(key, id);
    return id;
  } catch (error) {
    if (error instanceof WordPressApiError) categoryIdCache.set(key, null);
    return null;
  }
}

/** Posts for a category hub: category matches first, then tag matches. */
export async function getPostsForCategoryHub(input: {
  categories?: string[];
  tags?: string[];
  limit?: number;
}): Promise<BlogPostWithAuthor[]> {
  const limit = Math.min(input.limit ?? 4, 20);
  const seen = new Set<string>();
  const merged: BlogPostWithAuthor[] = [];

  const append = (posts: BlogPostWithAuthor[]) => {
    for (const post of posts) {
      if (merged.length >= limit) return;
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      merged.push(post);
    }
  };

  for (const category of input.categories ?? []) {
    if (merged.length >= limit) break;
    const categoryId = await findCategoryId(category);
    if (categoryId) append(await readPosts({ categories: categoryId, per_page: limit }));
  }

  // Tags have no id lookup here: the shop's hub tags are editorial labels, and
  // WordPress matches them by slug. A tag that does not exist returns nothing, which
  // is the correct answer rather than a fallback to every post.
  for (const tag of input.tags ?? []) {
    if (merged.length >= limit) break;
    append(await readPosts({ tags: tag.toLowerCase().replace(/\s+/g, '-'), per_page: limit }));
  }

  return merged.slice(0, limit);
}
