import { NextResponse, type NextRequest } from 'next/server';
import {
  getCatalogProducts,
  getFeaturedCatalogProducts,
  lookupCatalogProduct,
} from '@/lib/backend/serverCatalog';
import { publicReadKey, readThroughPublicCache } from '@/lib/backend/publicReadCache';
import { normalizeProductSlug } from '@/lib/products/slug';
import type { CatalogResult } from '@/lib/backend/products';

/**
 * The storefront's catalog read, served from the server.
 *
 * The browser must never read the source directly. Two reasons, both of them
 * about the shop's own rules rather than about convenience:
 *
 * 1. **The niche is enforced on the server.** WooCommerce staging still carries
 *    animal-feed products, and the seam in `lib/backend/products.ts` withholds
 *    them. If a component read the source itself, those records — names,
 *    categories, descriptions — would cross the wire and only be dropped
 *    afterwards, which is not the same thing as never being sent.
 * 2. **The source is server-side.** WooCommerce REST credentials and the
 *    WordPress read target stay on the server, so the browser cannot be pointed
 *    at an unfiltered route by editing a request, and the credentials can never
 *    be shipped by accident.
 *
 * The response shape is the same `CatalogResult` / `CatalogLookup` the server
 * renders use, so a caller cannot tell (and must not be able to tell) which side
 * of the boundary the read happened on.
 *
 * ## Why the read is reuse-able now, and why that is safe
 *
 * This route used to declare `dynamic = 'force-dynamic'`. That is stronger than
 * it looks: it sets the framework's fetch default to no-store for the whole
 * request, so even though `lib/backend/serverCatalog.ts` asks WooCommerce for a
 * one-minute window, the request was forced to ignore it. Every call therefore
 * made a full WordPress round trip before answering.
 *
 * That was already inconsistent with the layer above. `/products`,
 * `/products/[slug]`, the shelf routes and `/` serve **the same products,
 * prices and stock** under the one-minute window and are cached at the edge, so
 * the HTML a shopper was looking at could be a minute old while the JSON the
 * very same page fetched on the very same visit went to WordPress anyway.
 * Measured 2026-09-30, each of those reads cost **1.0–5.9 s** and none was
 * reused.
 *
 * Removing `force-dynamic` and declaring `revalidate` lets the read honour the
 * same window the page already used, so the JSON can never be staler than the
 * page that requested it.
 *
 * **What this is not.** The *response* is still not stored at the edge, and this
 * route cannot make it be. Vinext routes any route handler that reads the
 * request — `request.nextUrl.searchParams` below — to its bypass entrypoint, so
 * the answer keeps `Cache-Control: no-store, must-revalidate` and
 * `CF-Cache-Status: BYPASS`. A handler that read the request is also refused the
 * framework's revalidate header, which is the framework being right: a cache
 * whose key is built from a query string cannot be described by one path. What
 * the window buys is the *read* underneath — the WordPress round trip — not a
 * stored HTTP response.
 *
 * Measured on the preview deployment after the change: the same URL repeated
 * answers in **0.09–0.10 s** instead of 1.0–2.1 s, while a URL with a query
 * string nobody has asked for yet still costs the full ~1 s, because it really
 * is a different read. The origin load falls for browsing and stays honest for
 * genuinely new queries.
 *
 * Freshness where it matters is unchanged: add-to-cart, cart recalculation and
 * checkout read WooCommerce directly and uncached, and WooCommerce refuses a
 * quantity it cannot stock, so a minute-old listing cannot oversell, and a
 * freed cache entry can never serve a wrong order.
 *
 * Three cases are deliberately **not** cached, each for a reason the response
 * itself can report:
 *
 *  - **A degraded read** (`degraded: true` — WooCommerce unavailable, WordPress
 *    core answering without price or stock). Caching a failure would turn a
 *    moment of origin trouble into a minute of missing prices, and today it
 *    recovers on the next request.
 *  - **An error**, for the same reason.
 *  - **A search**, because the query string is free text. Every distinct search
 *    is a distinct cache key, and a cache whose keys are driven by user input is
 *    one an anonymous caller can fill; browsing parameters (`perPage`, `page`,
 *    `category`, `featured`, `slug`) are a small fixed set and are cached.
 */

// Declares the window this route's reads are allowed to reuse. It cannot make
// the response itself cacheable — see the note above on the bypass entrypoint —
// so its effect is on the WordPress read and nothing else.
export const revalidate = 60;

/**
 * ## The read behind this route is cached; this response still is not
 *
 * Because the framework refuses to store a response for a handler that reads its
 * own query string (see above), every request still reaches the Worker, and the
 * only place a repeat read can be saved is *inside* the handler. That is what
 * `lib/backend/publicReadCache.ts` does: the catalogue read itself is held for a
 * minute with a five-minute stale window, so two visitors asking for the same
 * shelf pay the WordPress round trip once between them instead of once each.
 *
 * The key is built from exactly the parameters that change the answer, each
 * normalized the same way the read normalizes it (`perPage` defaults to 24, the
 * page to 1, a slug through the slug normalizer), so equivalent requests share an
 * entry and two different categories can never share one. `search` is excluded
 * entirely: its key space is free text, and a cache an anonymous caller can fill
 * is not one worth having.
 *
 * Nothing here is personalized. This route reads no cookie and no session, and
 * every value it stores is the public projection from `serverCatalog`, so the
 * stored body is the same bytes for every visitor. Cart, checkout, account and
 * every admin read keep their own `no-store` and never touch this cache.
 */

const MAX_PER_PAGE = 100;

/** The cache namespace for every key this route builds. */
const READ_CACHE_NAMESPACE = 'catalog';

/**
 * The origin a stored read is keyed on.
 *
 * Cloudflare scopes the Workers Cache to the zone the Worker runs in, so the key
 * has to live on an origin inside it. The origin this request arrived on is the
 * one guaranteed to be, which is why it is taken from the request rather than
 * assumed.
 */
function keyOrigin(request: NextRequest): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

/**
 * The catalogue's own default page size, matched to `toProductQuery` in
 * `lib/backend/products.ts` so the key describes the read that will happen.
 */
const DEFAULT_PER_PAGE = 24;

/** Never stored at the edge: failures and free-text searches. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function readNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_PER_PAGE) : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const slug = params.get('slug');
  const search = params.get('search');

  // Free text drives the key space, so a search is answered but never stored.
  if (search) {
    try {
      const result = await getCatalogProducts({
        perPage: readNumber(params.get('perPage')),
        page: readNumber(params.get('page')),
        search,
        categorySlug: params.get('category') || undefined,
        isFeatured: params.get('featured') === 'true' ? true : undefined,
      });
      return NextResponse.json(result, { headers: NO_STORE });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('The catalog endpoint could not serve its search:', reason);
      return NextResponse.json({ error: reason }, { status: 502, headers: NO_STORE });
    }
  }

  try {
    // A single product (the PDP): resolved through the same seam, so an
    // off-niche slug answers "no product" rather than an off-niche record.
    if (slug) {
      // Keyed on the normalized slug, which is the slug the lookup will actually
      // resolve, so `/api/catalog?slug=X` and `?slug=x` share one entry.
      const normalized = normalizeProductSlug(slug) || slug.trim().toLowerCase();
      const key = publicReadKey(READ_CACHE_NAMESPACE, { kind: 'slug', slug: normalized });

      const lookup = await readThroughPublicCache({
        key,
        keyOrigin: keyOrigin(request),
        load: () => lookupCatalogProduct(slug),
        // A lookup that reports a failure is answered and dropped, never stored.
        cacheable: (value) => !value.error,
      });

      // A degraded lookup is still a 200: the in-process contract reports the
      // failure in `error` and resolves no product, and the caller must not have
      // to tell the two apart by status code. `error` is a diagnostic string, not
      // a stack — it never carries credentials.
      const headers = lookup.error ? NO_STORE : undefined;
      return NextResponse.json(lookup, headers ? { headers } : undefined);
    }

    if (params.get('featured') === '1') {
      const limit = readNumber(params.get('limit')) ?? 4;
      const key = publicReadKey(READ_CACHE_NAMESPACE, { kind: 'featured', limit });
      const products = await readThroughPublicCache({
        key,
        keyOrigin: keyOrigin(request),
        load: () => getFeaturedCatalogProducts(limit),
        // The featuring is a closed set of published products; an empty answer is
        // a real answer and is worth storing, unlike a failed one.
        cacheable: () => true,
      });
      return NextResponse.json({ products });
    }

    const key = publicReadKey(READ_CACHE_NAMESPACE, {
      kind: 'list',
      perPage: readNumber(params.get('perPage')) ?? DEFAULT_PER_PAGE,
      page: readNumber(params.get('page')) ?? 1,
      category: params.get('category'),
      featured: params.get('featured') === 'true' ? true : false,
    });

    // A degraded read is a moment of origin trouble, not a catalogue: it is
    // answered, given the same `no-store` it had before, and deliberately not
    // stored, so the next request can recover rather than inherit the failure.
    const result: CatalogResult = await readThroughPublicCache({
      key,
      keyOrigin: keyOrigin(request),
      load: () =>
        getCatalogProducts({
          perPage: readNumber(params.get('perPage')),
          page: readNumber(params.get('page')),
          categorySlug: params.get('category') || undefined,
          isFeatured: params.get('featured') === 'true' ? true : undefined,
        }),
      cacheable: (value) => !value.degraded,
    });

    return NextResponse.json(result, result.degraded ? { headers: NO_STORE } : undefined);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('The catalog endpoint could not serve its read:', reason);
    return NextResponse.json({ error: reason }, { status: 502, headers: NO_STORE });
  }
}
