import { NextResponse, type NextRequest } from 'next/server';
import { offNicheTerm } from '@/lib/catalog/niche';
import { NICHE_SECTIONS } from '@/lib/catalog/nicheSections';

/**
 * Request-URL normalisation for the public shop, decided before anything renders.
 *
 * This runs ahead of the page because **Next serialises the request into the
 * response it streams**: every response body carries the requested path and query
 * in its flight payload, so a URL that names an animal product is echoed back in
 * the raw HTML of a pink salt shop. That is not a rendering bug that can be fixed
 * inside a component — measured on the running build, `/products/salt-licks-for-horses`
 * returned the word three times and `/blog/why-do-dairy-cows-need-trace-minerals`
 * eight, while no such product or article was served, and `/products?search=horses`
 * echoed the query. The only place a URL can be refused is before the page runs,
 * which is here. Nothing off-niche is serialised into any response — not payload,
 * not metadata, not JSON-LD.
 *
 * Three rules, all of them about URL text the shop must not carry:
 *
 * 1. **A retired blog URL whose last segment names something off-niche is
 *    redirected.** The blog guard withholds the articles themselves; this closes
 *    the same door on the URL space, so a retired article slug answers with a
 *    redirect instead of a page that repeats the name back.
 * 2. **`?query=` values that name something off-niche are dropped.** A search term
 *    is serialised too, so it is judged the same way, and the rest of the request
 *    (sort, page, a valid shelf) is left alone.
 * 3. **`?category=` values must be live shelves.** An unknown value rendered the
 *    whole catalogue under a different query string with a canonical to itself, and
 *    echoed the retired shelf name in the process.
 *
 * One denylist, one shelf list, both borrowed from the modules that already own
 * them — no second copy of either judgement lives here.
 *
 * ## Product detail URLs are *not* judged by their text here
 *
 * They used to be, and it was wrong. The shop's own approved lines carry
 * animal-named slugs ("…-for-horses…"), and the owner can now approve such a
 * product from the console — a fact no URL-text rule at the edge can know. So the
 * product decision moved to the route that resolves the product
 * (`app/(main)/products/[slug]/page.tsx`), which withholds the record without
 * naming it back (a 404 today; see the note in that file for why not a redirect on
 * this runtime). Middleware keeps the rules that are genuinely about request text.
 *
 * Scoped to the two public browse routes that take user-supplied text. Admin,
 * account, checkout, order confirmation and API routes are untouched: their query
 * strings carry payment and session parameters and are never rewritten.
 *
 * One rewrite completes the picture: a query-bearing `/products` request is
 * answered by the shelf route without changing the URL, so the bare catalogue
 * can stay prerendered and edge-cached while a shelf keeps its own metadata.
 */

/** Routes whose trailing segment is user-supplied, and where a refused URL lands. */
const CONTENT_ROUTES: ReadonlyArray<{ pattern: RegExp; fallback: string }> = [
  { pattern: /^\/blog\/([^/]+)\/?$/, fallback: '/blog' },
];

/** Browse routes whose query string names content, and so is judged for the niche. */
const BROWSE_PATHS = new Set(['/products', '/blog']);

const CATALOG_PATH = '/products';
const CATEGORY_PARAM = 'category';

/**
 * Where a query-bearing catalogue request is answered.
 *
 * `/products` itself reads no `searchParams`, which is what lets it be
 * prerendered and cached at the edge; the query string therefore has to reach a
 * route that is allowed to read it. That route is a rewrite target, never a
 * URL a shopper sees: the address bar keeps `/products?category=edible`, so the
 * canonical, the links and the shopper's history are all unchanged.
 */
const SHELF_PATH = '/products/shelf';

/** The shelf the catalogue request actually names, or `all` for any other query. */
function shelfRouteFor(params: URLSearchParams): string {
  const shelf = params.get(CATEGORY_PARAM);
  return `${SHELF_PATH}/${shelf && VALID_SHELF_KEYS.has(shelf) ? shelf : 'all'}`;
}

const VALID_SHELF_KEYS = new Set<string>(NICHE_SECTIONS.map((section) => section.key));

/** A path segment as text, or the raw segment when it is not valid escaping. */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Where a refused content URL goes: the index of the section it belonged to. */
function retireOffNicheContentUrl(request: NextRequest, pathname: string): NextResponse | null {
  for (const route of CONTENT_ROUTES) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;

    if (offNicheTerm(decodePathSegment(match[1]))) {
      const url = request.nextUrl.clone();
      url.pathname = route.fallback;
      url.search = '';
      return NextResponse.redirect(url, 308);
    }

    return null;
  }

  return null;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  // --- 1. Content URLs that name something the shop does not sell ------------
  const retired = retireOffNicheContentUrl(request, pathname);
  if (retired) return retired;

  // --- 2 and 3. The browse routes' own query strings -------------------------
  if (!BROWSE_PATHS.has(pathname)) return NextResponse.next();

  const params = new URLSearchParams(searchParams);

  // A term that names an animal product is not a filter this shop can answer, and
  // the response would repeat it verbatim — key or value, both are URL text.
  for (const [key, value] of [...params.entries()]) {
    if (offNicheTerm(key) || offNicheTerm(value)) params.delete(key);
  }

  const requestedShelf = params.get(CATEGORY_PARAM);
  if (requestedShelf !== null) {
    // A retired, invented or mis-cased shelf value is not a URL this shop serves:
    // it is dropped, so an old link lands on the whole catalogue instead of on a
    // duplicate URL that names a shelf the shop no longer has.
    const shelf = requestedShelf.trim().toLowerCase();
    if (VALID_SHELF_KEYS.has(shelf)) params.set(CATEGORY_PARAM, shelf);
    else params.delete(CATEGORY_PARAM);
  }

  const query = params.toString();
  if (query !== searchParams.toString()) {
    // The requested URL names something this shop does not serve. Normalise it
    // first, so the rewrite below only ever sees a clean query string.
    const url = request.nextUrl.clone();
    url.search = query ? `?${query}` : '';
    return NextResponse.redirect(url, 308);
  }

  // A bare `/products` is the cacheable default shelf and is served as-is. Any
  // query string rides to the shelf route, which owns the per-shelf title,
  // canonical and breadcrumb — and which keeps the bare page's edge cache entry
  // free of one entry per search term.
  if (pathname !== CATALOG_PATH || !query) return NextResponse.next();

  const shelfUrl = request.nextUrl.clone();
  shelfUrl.pathname = shelfRouteFor(params);
  return NextResponse.rewrite(shelfUrl);
}

export const config = {
  matcher: ['/products', '/products/:path*', '/blog', '/blog/:path*'],
};
