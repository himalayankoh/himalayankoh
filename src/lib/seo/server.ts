import { createClient } from '@supabase/supabase-js';
import type {
  Database,
  ProductWithCategory,
} from '@/lib/supabase/database.types';
import type { Product } from '@/data/products';
import { lookupCatalogProduct } from '@/lib/backend/serverCatalog';
import { isRealCatalogProduct } from '@/lib/catalog/realProduct';
import { filterNicheBlogPosts } from '@/lib/catalog/nicheBlog';
import type { BlogPostWithAuthor } from '@/lib/blog/types';
import { wordpressBlog } from '@/lib/blog/wordpressBlog';
import { SITE_ORIGIN } from '@/lib/site/origin';

/**
 * Server-only Supabase client for SEO/metadata fetches during server render.
 * Uses the public anon key (respects RLS — only published/active rows are
 * returned) and no session persistence. Separate from the browser client so
 * server components can fetch data without shipping it through the client.
 */
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function getSeoSupabase() {
  if (cached) return cached;
  // Read the variables directly rather than through `publicEnv`: this module is
  // server-only, and the client-safe object must not carry Supabase keys any
  // more — it lives in the root layout, so its fields reach every route's
  // bundle. Both spellings are accepted for the Vite-era migration.
  cached = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://disabled.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'disabled-anon-key',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return cached;
}

/**
 * Every server-rendered route (Products, product detail, blog) awaits one of
 * the fetches below before Next can send the page, and client-side
 * navigation waits for that same render to finish before the URL changes —
 * with no loading.tsx in (main), the old page just sits there in the
 * meantime. A Supabase request that stalls (cold serverless network blip,
 * DNS hiccup) used to hang that render indefinitely, which reads as
 * navigation being stuck until the visitor manually reloads. Bounding every
 * such request lets a stall fail fast instead: the page still renders, just
 * without that one piece of data, the same way a not-found row is handled.
 */
const SEO_FETCH_TIMEOUT_MS = 6_000;

export function seoFetchDeadline(): AbortSignal {
  return AbortSignal.timeout(SEO_FETCH_TIMEOUT_MS);
}

/**
 * Absolute site origin for canonical URLs / OG tags.
 *
 * Delegates to `@/lib/site/origin`, which owns the decision and refuses a
 * loopback origin in a production build; this function exists so the many SEO
 * call sites keep one import path.
 */
/**
 * Runs a server-side CMS read, degrading instead of throwing.
 *
 * Supabase is optional on this storefront and is disabled outright in some
 * environments (`disabled.supabase.co`), where a raw query rejects with a DNS
 * failure. Awaiting it directly meant the sitemap route failed its prerender and
 * took a whole deployment build down with it. A missing CMS must cost the page
 * its blog links, not the site its build.
 */
async function safeSeoRead<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`SEO read failed (${label}); rendering without it.`, error);
    return fallback;
  }
}

export function siteOrigin(): string {
  return SITE_ORIGIN;
}

export function absoluteUrl(path: string): string {
  const origin = siteOrigin();
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface SeoProduct {
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  price: number;
  images: string[] | null;
  thumbnail: string | null;
  sku: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

/** Server-side product-by-slug fetch for metadata + JSON-LD. Returns null if not found. */
export async function fetchSeoProduct(slug: string): Promise<SeoProduct | null> {
  const normalized = normalizeSlugParam(slug);
  if (!normalized) return null;

  const { data } = await getSeoSupabase()
    .from('products')
    .select(
      'name, slug, description, short_description, price, images, thumbnail, sku, meta_title, meta_description, tags'
    )
    .eq('slug', normalized)
    .eq('is_active', true)
    .abortSignal(seoFetchDeadline())
    .maybeSingle();

  if (!data || !isRealCatalogProduct(data as { tags?: string[] | null })) return null;
  return data as SeoProduct;
}

/** Route params arrive URL-encoded and case-inconsistent; slugs are stored lowercase. */
function normalizeSlugParam(slug: string): string {
  try {
    return decodeURIComponent(slug).trim().toLowerCase();
  } catch {
    return slug.trim().toLowerCase();
  }
}

/**
 * Full product row mapped to the same `Product` shape the client views use, so
 * server metadata and structured data are built by exactly the same helpers the
 * page renders with (no title/description drift between server HTML and the
 * hydrated page). Falls back to the bundled catalog when Supabase has no match,
 * which mirrors the client resolver.
 */
export async function fetchSeoProductModel(slug: string): Promise<Product | null> {
  const normalized = normalizeSlugParam(slug);
  if (!normalized) return null;

  // The backend owns catalog resolution, including the "real catalog product"
  // gate and the rule that a deliberately withheld product must never be
  // republished from the bundled demo catalog. Routing metadata through the
  // same resolver the page uses is what keeps the server-rendered title, the
  // JSON-LD and the hydrated page from drifting apart. `seoFetchDeadline()`
  // bounds the read so a stalled backend cannot hang the render.
  const lookup = await lookupCatalogProduct(normalized, seoFetchDeadline());
  return lookup.product;
}

export interface SeoBlogPost {
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  updated_at: string | null;
}

/**
 * Server-side published blog-post-by-slug fetch for metadata + JSON-LD.
 *
 * Read from WordPress; only the metadata fields are taken from the fuller post, so
 * this stays the light read it always was rather than pulling a whole article body
 * into a `<head>`.
 */
export async function fetchSeoBlogPost(slug: string): Promise<SeoBlogPost | null> {
  const normalized = slug?.trim();
  if (!normalized) return null;

  return safeSeoRead(
    `blog post ${normalized}`,
    async () => {
      const post = await wordpressBlog.getPostBySlug(normalized);
      if (!post) return null;
      return {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        featured_image: post.featured_image,
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        published_at: post.published_at,
        updated_at: post.updated_at,
      };
    },
    null
  );
}

/** Same shape the client blog API returns, so the view can be seeded with it directly. */
export type SeoBlogPostFull = BlogPostWithAuthor;

/**
 * Full published post including body content and author, for server rendering
 * the article into the initial HTML. Returns null when unpublished or missing.
 *
 * Read from WordPress, which owns the blog — see `lib/blog/wordpressBlog.ts`.
 */
export async function fetchSeoBlogPostFull(slug: string): Promise<SeoBlogPostFull | null> {
  const normalized = slug?.trim();
  if (!normalized) return null;

  return safeSeoRead(
    `blog article ${normalized}`,
    async () => wordpressBlog.getPostBySlug(normalized),
    null
  );
}

/**
 * Published posts, newest first, for server rendering the blog index. Without
 * this the listing ships as an empty grid and crawlers find no internal links
 * to the individual articles.
 */
export async function fetchSeoBlogPosts(limit = 24): Promise<SeoBlogPostFull[]> {
  return safeSeoRead(
    'blog index',
    async () => {
      const posts = await wordpressBlog.getFeaturedPosts(limit);

      // The store is Himalayan pink salt. Articles written for the livestock and
      // pet trade are still in the blog store from the old site, and listing them
      // here — or handing their URLs to crawlers through the sitemap, which reads
      // this same function — advertises a business this storefront no longer is.
      // The judgement lives in `lib/catalog/nicheBlog.ts`; the admin blog console
      // still reads the store unfiltered, because the owner is who decides what to
      // do with those posts.
      const niche = filterNicheBlogPosts(posts);
      const withheld = posts.length - niche.length;
      if (withheld > 0) {
        console.info(
          `${withheld} blog post${withheld === 1 ? '' : 's'} outside the Himalayan pink salt niche ${withheld === 1 ? 'was' : 'were'} withheld from public listings and the sitemap.`
        );
      }

      return niche;
    },
    []
  );
}
