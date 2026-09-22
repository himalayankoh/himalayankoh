/**
 * The blog's admin write path — WordPress posts, through WordPress's own REST API.
 *
 * Reads already came from `wp/v2/posts` (`lib/blog/wordpressBlog.ts`); this is the
 * other half, so the blog console in HK Admin is complete without wp-admin and
 * without Supabase. WordPress owns posts, revisions and media, which means:
 *
 *   - a draft, a schedule and a publish are WordPress statuses (`draft`, `future`,
 *     `publish`), not a parallel state machine this app has to keep in step;
 *   - revision history is WordPress's own `wp/v2/posts/<id>/revisions`, not a
 *     `blog_revisions` table, and restoring reads that revision and writes its
 *     fields back onto the post;
 *   - the HK-specific fields (SEO, hero image, tags, FAQ) are post meta registered
 *     by the `hk-storefront` plugin, so they travel in the post object and are
 *     revisioned with the content.
 *
 * ## `context=edit` and raw fields
 *
 * Every read and write here uses `context=edit`, which returns `title.raw`,
 * `content.raw` and `excerpt.raw`. Using the rendered fields instead is how a post
 * acquires double-escaped entities after one round trip through the editor — the CMS
 * reads `Tom&amp;#8217;s`, saves it, and the storefront eventually shows `&amp;#8217;`.
 *
 * ## Server-only
 *
 * These calls carry an administrator application password. The console in the browser
 * talks to `/api/admin/blog/*` instead, which is where this module is used.
 */

import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { findMediaByUrl, uploadMediaToWordPress } from '@/lib/media/wordpressMedia';

const TIMEOUT_MS = 30_000;

/** WordPress's post statuses this app maps to and from. */
const READ_STATUSES = 'publish,future,draft,pending,private,trash';

/** A WordPress post as `context=edit` reports it. */
interface WpEditPost {
  id: number;
  slug: string;
  status: string;
  date_gmt?: string | null;
  modified_gmt?: string | null;
  author?: number;
  featured_media?: number;
  title?: { raw?: string; rendered?: string };
  content?: { raw?: string; rendered?: string };
  excerpt?: { raw?: string; rendered?: string };
  meta?: Record<string, unknown>;
  _embedded?: {
    author?: Array<{ id?: number; name?: string }>;
    'wp:featuredmedia'?: Array<{ source_url?: string }>;
  };
}

/** The row shape the blog console renders. Mirrors the console's own expectation. */
export interface CmsBlogRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  tags: string[] | null;
  author_name: string | null;
  author_id: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  published_at: string | null;
  date_label?: string | null;
  seo_title?: string | null;
  meta_description?: string | null;
  target_keyword?: string | null;
  secondary_keywords?: string[] | null;
  search_intent?: string | null;
  faq?: { q: string; a: string }[] | null;
  internal_links?: unknown[] | null;
  quality_score?: number | null;
  generated_by?: string | null;
  automation_run_id?: string | null;
  automation_locked?: boolean | null;
}

/** One revision, in the shape the console's history list renders. */
export interface CmsBlogRevision {
  id: string;
  blog_id: string;
  revision: number;
  previous: unknown | null;
  next: unknown | null;
  action: string;
  actor: string;
  actor_email?: string | null;
  created_at: string;
}

/** The fields a post can be created or updated with. */
export interface BlogPostInput {
  slug?: string;
  title?: string;
  content?: string;
  excerpt?: string | null;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  tags?: string[];
  authorName?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  targetKeyword?: string | null;
  secondaryKeywords?: string[];
  searchIntent?: string | null;
  faq?: { q: string; a: string }[];
  status?: 'draft' | 'scheduled' | 'published' | 'archived';
  scheduledAt?: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** A human date label from an ISO timestamp, or null. */
function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** WordPress's UTC timestamp (no zone suffix) as an ISO string, or null. */
function isoFromWp(value: string | null | undefined): string | null {
  if (!value || value.startsWith('0000')) return null;
  return `${value}Z`;
}

function rawText(field: { raw?: string; rendered?: string } | undefined): string {
  return field?.raw ?? field?.rendered ?? '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function faqFromMeta(value: unknown): { q: string; a: string }[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const entry = item as { q?: unknown; a?: unknown };
      return typeof entry?.q === 'string' && typeof entry?.a === 'string' ? [{ q: entry.q, a: entry.a }] : [];
    });
  } catch {
    return [];
  }
}

/** The console's status vocabulary, from a WordPress status. */
function statusFromWp(status: string): CmsBlogRow['status'] {
  if (status === 'publish' || status === 'private') return 'published';
  if (status === 'future') return 'scheduled';
  if (status === 'trash') return 'archived';
  return 'draft';
}

/** The WordPress status, from the console's vocabulary. */
function statusToWp(status: CmsBlogRow['status']): string {
  if (status === 'published') return 'publish';
  if (status === 'scheduled') return 'future';
  if (status === 'archived') return 'trash';
  return 'draft';
}

/** A WordPress post (edit context) as the console's row. */
export function rowFromWpPost(post: WpEditPost): CmsBlogRow {
  const meta = post.meta ?? {};
  const featured = post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null;
  const author = post._embedded?.author?.[0];
  const status = statusFromWp(String(post.status ?? 'draft'));
  const published = isoFromWp(post.date_gmt);
  const scheduled = status === 'scheduled' ? published : null;
  // The plugin's meta wins over the embedded taxonomy so an editor's free-text tags
  // survive a round trip; WordPress's own post_tag terms remain the site's taxonomy.
  const metaTags = stringArray(meta.hk_tags);

  return {
    id: String(post.id),
    slug: String(post.slug ?? ''),
    title: rawText(post.title),
    excerpt: rawText(post.excerpt) || null,
    content: rawText(post.content) || null,
    hero_image_url: (typeof meta.hk_hero_image_url === 'string' && meta.hk_hero_image_url) || featured,
    hero_image_alt: (typeof meta.hk_hero_image_alt === 'string' && meta.hk_hero_image_alt) || null,
    tags: metaTags.length ? metaTags : [],
    author_name: author?.name ?? null,
    author_id: post.author ? String(post.author) : null,
    status,
    created_at: published ?? new Date(0).toISOString(),
    updated_at: isoFromWp(post.modified_gmt) ?? published ?? new Date(0).toISOString(),
    scheduled_at: scheduled,
    published_at: status === 'published' ? published : null,
    date_label: dateLabel(published),
    seo_title: (typeof meta.hk_seo_title === 'string' && meta.hk_seo_title) || null,
    meta_description: (typeof meta.hk_meta_description === 'string' && meta.hk_meta_description) || null,
    target_keyword: (typeof meta.hk_target_keyword === 'string' && meta.hk_target_keyword) || null,
    secondary_keywords: stringArray(meta.hk_secondary_keywords),
    search_intent: (typeof meta.hk_search_intent === 'string' && meta.hk_search_intent) || null,
    faq: faqFromMeta(meta.hk_faq_json),
    internal_links: [],
    quality_score: null,
    generated_by: typeof meta.hk_generated_by === 'string' ? meta.hk_generated_by : 'manual',
    automation_locked: false,
  };
}

/** The `meta` object a write carries for the HK fields present in an input. */
function metaFromInput(input: BlogPostInput): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (input.heroImageUrl !== undefined) meta.hk_hero_image_url = input.heroImageUrl ?? '';
  if (input.heroImageAlt !== undefined) meta.hk_hero_image_alt = input.heroImageAlt ?? '';
  if (input.tags !== undefined) meta.hk_tags = input.tags;
  if (input.seoTitle !== undefined) meta.hk_seo_title = input.seoTitle ?? '';
  if (input.metaDescription !== undefined) meta.hk_meta_description = input.metaDescription ?? '';
  if (input.targetKeyword !== undefined) meta.hk_target_keyword = input.targetKeyword ?? '';
  if (input.secondaryKeywords !== undefined) meta.hk_secondary_keywords = input.secondaryKeywords;
  if (input.searchIntent !== undefined) meta.hk_search_intent = input.searchIntent ?? '';
  if (input.faq !== undefined) meta.hk_faq_json = JSON.stringify(input.faq ?? []);
  if (input.authorName !== undefined) meta.hk_author_name = input.authorName ?? '';
  return meta;
}

/**
 * The attachment id for a post's hero image, adding it to the media library if it is
 * not already there.
 *
 * The editor types or pastes a URL. The media library then owns a copy and the post's
 * `featured_media` points at it, which is what makes the image appear in WordPress's
 * own editors and in the theme. The URL is also kept in meta, so an image that could
 * not be copied still renders on the storefront instead of being silently dropped.
 *
 * The library is checked first: re-saving a post must not copy the same image in
 * again, which is how a media library ends up with ten copies of one photograph.
 */
async function resolveHeroImage(input: BlogPostInput): Promise<number | null> {
  const url = (input.heroImageUrl || '').trim();
  if (!url) return null;

  const existing = await findMediaByUrl(url);
  if (existing) return existing.id;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error(`content-type ${contentType || 'unknown'}`);

    const uploaded = await uploadMediaToWordPress({
      buffer: new Uint8Array(await response.arrayBuffer()),
      filename: url.split('/').pop()?.split('?')[0] || 'blog-hero.jpg',
      contentType,
      title: input.title,
      altText: input.heroImageAlt || undefined,
    });
    return uploaded.id;
  } catch (error) {
    console.warn('Blog hero image could not be added to the WordPress media library:', error);
    return null;
  }
}

/** Every post the console lists, newest first. */
export async function listPosts(): Promise<CmsBlogRow[]> {
  const posts = await wordpressRequest<WpEditPost[]>('/wp/v2/posts', {
    credentials: requireWordPressCredentials(),
    params: {
      context: 'edit',
      status: READ_STATUSES,
      per_page: 100,
      orderby: 'modified',
      order: 'desc',
      _embed: '1',
    },
    timeoutMs: TIMEOUT_MS,
  });
  return (Array.isArray(posts) ? posts : []).map(rowFromWpPost);
}

/** One post by id, or null when WordPress has no such post. */
export async function getPost(id: string): Promise<CmsBlogRow | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const post = await wordpressRequest<WpEditPost>(`/wp/v2/posts/${id}`, {
      credentials: requireWordPressCredentials(),
      params: { context: 'edit', _embed: '1' },
      timeoutMs: TIMEOUT_MS,
    });
    return post?.id ? rowFromWpPost(post) : null;
  } catch (error) {
    if (error instanceof WordPressApiError && error.status === 404) return null;
    throw error;
  }
}

/** True when another post already uses this slug. */
export async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const target = (slug || '').trim();
  if (!target) return false;
  const posts = await wordpressRequest<WpEditPost[]>('/wp/v2/posts', {
    credentials: requireWordPressCredentials(),
    params: { context: 'edit', status: READ_STATUSES, slug: target, per_page: 20 },
    timeoutMs: TIMEOUT_MS,
  });
  return (Array.isArray(posts) ? posts : []).some((post) => String(post.id) !== String(excludeId));
}

/** Creates a post. WordPress assigns the id, the timestamps and the revision. */
export async function createPost(input: BlogPostInput): Promise<CmsBlogRow> {
  const featuredMedia = await resolveHeroImage(input);
  const meta = metaFromInput(input);

  const created = await wordpressRequest<WpEditPost>('/wp/v2/posts', {
    method: 'POST',
    credentials: requireWordPressCredentials(),
    body: {
      title: input.title ?? '',
      slug: input.slug || undefined,
      content: input.content ?? '',
      excerpt: input.excerpt ?? '',
      status: statusToWp(input.status === 'published' ? 'published' : 'draft'),
      ...(featuredMedia ? { featured_media: featuredMedia } : {}),
      meta,
    },
    timeoutMs: TIMEOUT_MS,
  });

  return rowFromWpPost(created);
}

/**
 * Updates a post's fields.
 *
 * Only the fields the caller supplied are sent, so an SEO-only save (the console's
 * bulk Auto SEO) cannot blank a title or a body it never read.
 */
export async function updatePost(id: string, patch: Partial<BlogPostInput>): Promise<CmsBlogRow> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.slug !== undefined) body.slug = patch.slug;
  if (patch.content !== undefined) body.content = patch.content;
  if (patch.excerpt !== undefined) body.excerpt = patch.excerpt ?? '';

  if (patch.heroImageUrl !== undefined) {
    const featuredMedia = await resolveHeroImage({ ...patch, title: patch.title });
    if (featuredMedia) body.featured_media = featuredMedia;
  }

  const meta = metaFromInput(patch);
  if (Object.keys(meta).length) body.meta = meta;

  const updated = await wordpressRequest<WpEditPost>(`/wp/v2/posts/${id}`, {
    method: 'POST',
    credentials: requireWordPressCredentials(),
    body,
    timeoutMs: TIMEOUT_MS,
  });

  return rowFromWpPost(updated);
}

/**
 * A lifecycle transition: publish, schedule, unpublish, archive, restore.
 *
 * These are WordPress statuses plus, for a schedule, WordPress's own `date` field —
 * WordPress publishes a `future` post itself when that time arrives, so scheduling
 * needs no cron in this app.
 */
export async function setLifecycle(
  id: string,
  action: 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore',
  scheduledAt?: string | null
): Promise<CmsBlogRow> {
  const body: Record<string, unknown> = {};

  switch (action) {
    case 'publish':
      body.status = 'publish';
      break;
    case 'schedule':
      body.status = 'future';
      // WordPress takes the publish time as `date` in the site's timezone; the ISO
      // string the console holds is converted to the same wall-clock shape.
      if (scheduledAt) body.date = scheduledAt.replace('T', ' ').slice(0, 19);
      break;
    case 'unpublish':
    case 'restore':
      // Restore returns to draft so the owner decides the next state.
      body.status = 'draft';
      break;
    case 'archive':
      body.status = 'trash';
      break;
  }

  const updated = await wordpressRequest<WpEditPost>(`/wp/v2/posts/${id}`, {
    method: 'POST',
    credentials: requireWordPressCredentials(),
    body,
    timeoutMs: TIMEOUT_MS,
  });

  return rowFromWpPost(updated);
}

/**
 * Deletes a post: WordPress's trash by default, permanent only when asked.
 *
 * WordPress's trash is the same soft delete the console calls "archive", so the two
 * are one action here rather than two different states.
 */
export async function deletePost(id: string, permanent = false): Promise<void> {
  await wordpressRequest<unknown>(`/wp/v2/posts/${id}`, {
    method: 'DELETE',
    credentials: requireWordPressCredentials(),
    params: permanent ? { force: 'true' } : {},
    timeoutMs: TIMEOUT_MS,
  });
}

/** WordPress's own revision history for one post, newest first. */
export async function listRevisions(blogId: string): Promise<CmsBlogRevision[]> {
  const path = `/wp/v2/posts/${blogId}/revisions`;
  let revisions: WpEditPost[];
  try {
    revisions = await wordpressRequest<WpEditPost[]>(path, {
      credentials: requireWordPressCredentials(),
      params: { context: 'edit', per_page: 30 },
      timeoutMs: TIMEOUT_MS,
    });
  } catch (error) {
    // A trashed post has no revisions endpoint that answers; the console then shows
    // no history rather than an error dialog about a post it cannot restore into.
    if (error instanceof WordPressApiError && (error.status === 404 || error.status === 403)) return [];
    throw error;
  }

  return (Array.isArray(revisions) ? revisions : []).map((revision) => ({
    id: String(revision.id),
    blog_id: String(blogId),
    // The revision id *is* the number the console shows and restores with; inventing
    // a separate sequence would mean two ids for one revision.
    revision: Number(revision.id),
    previous: null,
    next: {
      title: rawText(revision.title),
      content: rawText(revision.content),
      excerpt: rawText(revision.excerpt),
      meta: revision.meta ?? {},
    },
    action: 'edit',
    actor: 'admin',
    actor_email: null,
    created_at: isoFromWp(revision.modified_gmt ?? revision.date_gmt) ?? new Date(0).toISOString(),
  }));
}

/** Restores a post to one of its revisions, by copying that revision's fields back. */
export async function restoreRevision(blogId: string, revisionId: number): Promise<CmsBlogRow> {
  const revision = await wordpressRequest<WpEditPost>(`/wp/v2/posts/${blogId}/revisions/${revisionId}`, {
    credentials: requireWordPressCredentials(),
    params: { context: 'edit' },
    timeoutMs: TIMEOUT_MS,
  });

  const updated = await wordpressRequest<WpEditPost>(`/wp/v2/posts/${blogId}`, {
    method: 'POST',
    credentials: requireWordPressCredentials(),
    body: {
      title: rawText(revision.title),
      content: rawText(revision.content),
      excerpt: rawText(revision.excerpt),
      ...(revision.meta ? { meta: revision.meta } : {}),
    },
    timeoutMs: TIMEOUT_MS,
  });

  return rowFromWpPost(updated);
}
