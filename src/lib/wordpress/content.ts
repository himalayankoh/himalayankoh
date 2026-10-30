/**
 * WordPress content reads — posts, media and comments — server only.
 *
 * ## What the credential can and cannot do, measured rather than assumed
 *
 * This store's credential is a **WooCommerce consumer key/secret pair**. It
 * authenticates `/wc/v3/*` completely — products, orders, customers, coupons — and
 * it authenticates *nothing* under WordPress core's `/wp/v2/*`: WooCommerce's REST
 * authentication filter is not WordPress core's. Probing the live staging store
 * gives a consistent answer:
 *
 *   GET /wp/v2/posts?per_page=1                      200   (published only)
 *   GET /wp/v2/posts?per_page=1&status=draft         400   rest_invalid_param
 *   GET /wp/v2/users/me                              401   rest_not_logged_in
 *   GET /wp/v2/settings                              401   rest_forbidden
 *   GET /wp/v2/comments?type=review                  401   rest_forbidden_param
 *   GET /wp/v2/comments?status=hold                  401   rest_forbidden_param
 *
 * So: *published* posts, pages and media are readable, and nothing that requires a
 * logged-in WordPress user is. The consequence is stated in the console rather
 * than hidden — no draft list, no media upload, no review moderation, and no
 * "0 drafts" that would read as an empty state instead of an unreachable one. What
 * would fix it is named exactly once, here, and it is a WordPress **application
 * password** for an administrator account (or wp-admin access to create one),
 * which is not the WooCommerce key and cannot be derived from it.
 *
 * Reviews are read from the same limit: WooCommerce's REST API has no reviews
 * endpoint at all, and the comments route that holds them refuses the `type=review`
 * filter anonymously. Ratings therefore come from the product records — WooCommerce
 * reports `average_rating` and `rating_count` per product, which is real review
 * data — and the individual review text cannot be listed with this credential.
 */

import { wordpressRequest, wordpressRequestSafe } from '../backend/wordpress';
import { wooCredentials } from '../backend/credentials';
import { backendConfig } from '../backend/config';

/** A published WordPress post (or page) as REST v2 reports it. */
export interface WordPressPost {
  id: number;
  slug: string;
  date_gmt?: string;
  modified_gmt?: string;
  status?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  author?: number;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
}

/** A WordPress media item, with the alt text the storefront depends on. */
export interface WordPressMedia {
  id: number;
  date_gmt?: string;
  slug?: string;
  title?: { rendered?: string };
  alt_text?: string;
  caption?: { rendered?: string };
  mime_type?: string;
  source_url?: string;
  media_details?: {
    width?: number;
    height?: number;
    filesize?: number;
    sizes?: Record<string, { source_url?: string; width?: number; height?: number }>;
  };
}

/** An approved WordPress comment (WooCommerce reviews live in the same table). */
export interface WordPressComment {
  id: number;
  post?: number;
  parent?: number;
  author_name?: string;
  date_gmt?: string;
  content?: { rendered?: string };
  status?: string;
  type?: string;
  author_avatar_urls?: Record<string, string>;
}

/**
 * Whether this deployment can reach the parts of WordPress core that need a
 * logged-in user.
 *
 * Answered by asking, not by configuration: a route that 401s is the only
 * trustworthy signal that drafts and moderation are unreachable. Cached per
 * request by `fetch` deduplication at the Next layer rather than in a module
 * global, so a credential change is not hidden behind a stale flag.
 */
export interface WordPressContentCapability {
  /** Published posts/pages/media are readable. */
  canReadPublished: boolean;
  /** Drafts, pending comments and the moderation queue are reachable. */
  canReadDrafts: boolean;
  canModerate: boolean;
  canUpload: boolean;
  /** Whether a WooCommerce consumer key is configured at all. */
  hasWooCredentials: boolean;
  /** True when the WordPress origin is configured. */
  hasOrigin: boolean;
  /** The reason the write capabilities are unavailable, or null when they are. */
  writeBlocker: string | null;
}

export async function readWordPressContentCapability(): Promise<WordPressContentCapability> {
  const hasOrigin = Boolean(backendConfig.wordpressApiRoot);
  const hasWooCredentials = wooCredentials() !== null;

  if (!hasOrigin) {
    return {
      canReadPublished: false,
      canReadDrafts: false,
      canModerate: false,
      canUpload: false,
      hasWooCredentials,
      hasOrigin,
      writeBlocker: 'No WordPress origin is configured for this deployment.',
    };
  }

  const [published, identity] = await Promise.all([
    wordpressRequestSafe<unknown[]>('/wp/v2/posts', { params: { per_page: 1 } }),
    wordpressRequestSafe<unknown>('/wp/v2/users/me'),
  ]);

  const canReadPublished = published.error === null;
  const canReadDrafts = identity.error === null;

  return {
    canReadPublished,
    canReadDrafts,
    canModerate: canReadDrafts,
    canUpload: canReadDrafts,
    hasWooCredentials,
    hasOrigin,
    writeBlocker: canReadDrafts
      ? null
      : hasWooCredentials
        ? 'Drafts, media uploads and review moderation need a WordPress user session. The WooCommerce consumer key that reads products and orders does not authenticate WordPress core endpoints — a WordPress application password for an administrator account is required, and it is a different credential.'
        : 'Neither a WooCommerce key nor a WordPress user session is configured for this deployment.',
  };
}

export interface ContentPage<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  /** Set when the read failed; `items` is then empty rather than fabricated. */
  error: string | null;
}

/**
 * Published posts, newest first.
 *
 * `context=view` is the only context an unauthenticated read is allowed, which
 * also means the `content` field is the site's rendered HTML — the same text a
 * visitor gets. Drafts are not requested, because requesting them only earns a
 * 400 that would look like a broken endpoint.
 */
export async function listWordPressPosts(
  options: { page?: number; perPage?: number; search?: string } = {}
): Promise<ContentPage<WordPressPost>> {
  const page = Math.max(options.page ?? 1, 1);
  const perPage = Math.min(Math.max(options.perPage ?? 20, 1), 100);

  const result = await wordpressRequestSafe<WordPressPost[]>('/wp/v2/posts', {
    params: { page, per_page: perPage, search: options.search || undefined, status: 'publish' },
    timeoutMs: 20_000,
  });

  if (result.error || !Array.isArray(result.data)) {
    return { items: [], total: 0, totalPages: 1, page, error: result.error ?? 'The posts could not be read.' };
  }
  return { items: result.data, total: result.data.length, totalPages: 1, page, error: null };
}

/** Published media, newest first, with the alt text stored against each asset. */
export async function listWordPressMedia(
  options: { page?: number; perPage?: number; search?: string; mimeType?: string } = {}
): Promise<ContentPage<WordPressMedia>> {
  const page = Math.max(options.page ?? 1, 1);
  const perPage = Math.min(Math.max(options.perPage ?? 40, 1), 100);

  const result = await wordpressRequestSafe<WordPressMedia[]>('/wp/v2/media', {
    params: {
      page,
      per_page: perPage,
      search: options.search || undefined,
      media_type: options.mimeType ? undefined : 'image',
      mime_type: options.mimeType,
    },
    timeoutMs: 25_000,
  });

  if (result.error || !Array.isArray(result.data)) {
    return { items: [], total: 0, totalPages: 1, page, error: result.error ?? 'The media library could not be read.' };
  }
  return { items: result.data, total: result.data.length, totalPages: 1, page, error: null };
}

/**
 * Approved comments.
 *
 * Approved only, because that is what an unauthenticated read returns: the
 * moderation queue is exactly the part that needs a session, and calling an
 * approved-only list "the queue" would be the mistake this module exists to stop.
 */
export async function listApprovedComments(
  options: { page?: number; perPage?: number; post?: number } = {}
): Promise<ContentPage<WordPressComment>> {
  const page = Math.max(options.page ?? 1, 1);
  const perPage = Math.min(Math.max(options.perPage ?? 50, 1), 100);

  const result = await wordpressRequestSafe<WordPressComment[]>('/wp/v2/comments', {
    params: { page, per_page: perPage, post: options.post, status: 'approve' },
    timeoutMs: 20_000,
  });

  if (result.error || !Array.isArray(result.data)) {
    return { items: [], total: 0, totalPages: 1, page, error: result.error ?? 'The comments could not be read.' };
  }
  return { items: result.data, total: result.data.length, totalPages: 1, page, error: null };
}

/** Review aggregates WooCommerce reports per product. */
export interface ProductRating {
  productId: number;
  name: string;
  averageRating: number | null;
  ratingCount: number;
}

interface WooProductRatingRow {
  id: number;
  name?: string;
  average_rating?: string;
  rating_count?: number;
}

/**
 * Review totals from the product records.
 *
 * WooCommerce's REST API has no reviews endpoint, but it does report each
 * product's `average_rating` and `rating_count`, which are the same figures the
 * product page shows. Individual review text is not reachable with this
 * credential, so the console reports the aggregate it can read and names the one
 * thing missing for the moderation queue.
 */
export async function readProductRatings(): Promise<{ ratings: ProductRating[]; error: string | null }> {
  const result = await wordpressRequestSafe<WooProductRatingRow[]>('/wc/v3/products', {
    useCredentials: true,
    params: { per_page: 100, status: 'any' },
    timeoutMs: 25_000,
  });

  if (result.error || !Array.isArray(result.data)) {
    return { ratings: [], error: result.error ?? 'The product ratings could not be read.' };
  }

  const ratings = result.data.map((row) => {
    const count = Number(row.rating_count ?? 0) || 0;
    const average = Number(row.average_rating ?? 0);
    return {
      productId: row.id,
      name: String(row.name ?? `Product ${row.id}`),
      // An unrated product reports '0.00' and a count of 0: a rating of zero
      // would be a claim about the product, so it is null instead.
      averageRating: count > 0 && Number.isFinite(average) ? average : null,
      ratingCount: count,
    };
  });

  return { ratings, error: null };
}

/** A single post by slug, for a preview link. */
export async function getWordPressPostBySlug(slug: string): Promise<WordPressPost | null> {
  const result = await wordpressRequestSafe<WordPressPost[]>('/wp/v2/posts', {
    params: { slug, per_page: 1, status: 'publish' },
    timeoutMs: 15_000,
  });
  if (result.error || !Array.isArray(result.data)) return null;
  return result.data[0] ?? null;
}

/** Exported so a caller can build a link without re-deriving the origin. */
export function wordpressOrigin(): string {
  return backendConfig.wordpressBaseUrl;
}

/** Raw text of a rendered field, with tags removed. */
export function plainText(rendered: string | undefined, limit = 240): string {
  const text = String(rendered ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Request helper kept exported for callers that need the raw shape. */
export { wordpressRequest };
