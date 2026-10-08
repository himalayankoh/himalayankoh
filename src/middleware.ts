import { NextResponse, type NextRequest } from 'next/server';
import { offNicheTerm } from '@/lib/catalog/niche';
import { isCategoryFilterValue } from '@/lib/categoryContent/keys';
import {
  PREVIEW_COOKIE,
  PREVIEW_QUERY_PARAM,
  previewAccessDecision,
} from '@/lib/http/previewAccess';
import { PRODUCTION_HOSTS } from '@/lib/seo/indexing';

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
 * 3. **`?category=` values must be well-formed.** The shop's categories are built
 *    from its products now, so the edge cannot know which names are live — an
 *    invented shelf value rendered the whole catalogue under a different query
 *    string with a canonical to itself, and echoed the retired shelf name in the
 *    process. A URL-safe slug is therefore kept and validated against the
 *    catalogue by the page; anything that is not a slug is dropped.
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

/**
 * The pre-cutover access gate — see `@/lib/http/previewAccess` for the judgement and why.
 *
 * This runs first, before any URL normalisation, because it decides whether the request is
 * served at all. It is enforced here rather than in a route for the same reason the gate
 * exists: the deployment holds live credentials on every route, so the check has to be
 * ahead of every route, including the API ones the middleware previously did not touch.
 *
 * Three outcomes, and the second one is the whole user experience:
 *
 *   - **Not required** (a production host, or no token configured): nothing is added, and
 *     this function behaves exactly as it did before the gate existed. Nothing about the
 *     cutover path or staging is altered by this code.
 *   - **`?hk_preview=<token>` with the right token**: the cookie is set and the request is
 *     redirected to the same URL without the parameter, so the token stops appearing in the
 *     address bar, in history and in any `Referer` a later page sends. The redirect cannot
 *     loop: the follow-up request has no parameter and carries the cookie.
 *   - **Anything else without the token**: 401, with a body that says what to do and names
 *     no hostname, token or deployment detail.
 *
 * The refusal deliberately answers with a small HTML document and `noindex`, because the
 * only reader is a human who needs to know why the page they expected is not there.
 */
function enforcePreviewAccess(request: NextRequest): NextResponse | null {
  // A build is not a visitor. `next build` and `vinext build` both prerender `/_not-found`
  // by running the middleware on a synthetic request, and gating that request fails the
  // build: the page cannot be exported, and the error surfaces as an opaque
  // `TypeError … not a function` from the webpack runtime rather than as anything that names
  // this gate. A token in `.env.local` — where the deploy tooling needs it — is enough to
  // trigger it, so this check is what keeps `npm run build` runnable while a token exists.
  // `NEXT_PHASE` is process state, so no request can set it.
  if (process.env.NEXT_PHASE === 'phase-production-build') return null;

  const host = request.headers.get('host');
  const configuredToken = process.env.PREVIEW_ACCESS_TOKEN ?? '';
  const supplied = request.nextUrl.searchParams.get(PREVIEW_QUERY_PARAM);

  // The exchange: a correct `?hk_preview=` sets the cookie once. Checked before the
  // decision below so that a browser can get in through the query string at all —
  // `previewAccessDecision` only knows about the header and the existing cookie.
  const expected = configuredToken.trim();
  if (expected !== '' && supplied !== null && supplied.trim() === expected) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete(PREVIEW_QUERY_PARAM);
    const response = NextResponse.redirect(clean, 303);
    response.cookies.set(PREVIEW_COOKIE, expected, {
      httpOnly: true,
      // The whole point of this deployment is that it is reached over HTTPS; a cookie
      // that could travel plaintext is a cookie that leaks on a downgrade.
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  const decision = previewAccessDecision(
    {
      host,
      configuredToken,
      authorization: request.headers.get('authorization'),
      cookie: request.cookies.get(PREVIEW_COOKIE)?.value ?? null,
    },
    PRODUCTION_HOSTS,
  );

  if (!decision.required || decision.authorized) return null;

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="robots" content="noindex, nofollow">` +
      `<title>Not available</title></head><body style="font:16px/1.5 system-ui,sans-serif;` +
      `margin:4rem auto;max-width:34rem;padding:0 1.5rem;color:#2F3230">` +
      `<h1 style="font-size:1.25rem">This preview is not public yet</h1>` +
      `<p>This deployment holds live credentials and is not open to the public. It is ` +
      `reachable with its preview access token, which the owner has.</p>` +
      `</body></html>`,
    {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer',
      },
    },
  );
}

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
  return `${SHELF_PATH}/${shelf && isCategoryFilterValue(shelf) ? shelf : 'all'}`;
}

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
  // --- 0. The pre-cutover access gate ----------------------------------------
  const gated = enforcePreviewAccess(request);
  if (gated) return gated;

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
    // A category is a live name only if a product carries it, and the edge has no
    // catalogue — so it keeps any well-formed slug and lets the page resolve it
    // against the products it is showing (`resolveAvailableCategoryKey`). A value
    // that is not a slug at all is not a URL this shop serves and is dropped, so
    // an old link lands on the whole catalogue instead of a duplicate URL.
    const shelf = requestedShelf.trim().toLowerCase();
    if (isCategoryFilterValue(shelf)) params.set(CATEGORY_PARAM, shelf);
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

/**
 * Every route except the build's own static assets.
 *
 * The list used to be the two browse paths, because URL normalisation only concerned those.
 * The access gate concerns everything, including the API routes that hold the credentials,
 * so the matcher becomes a negative lookahead. `_next/static`, `_next/image` and
 * `favicon.ico` are excluded because the refusal page itself has to load without them
 * being gated — gating the gate's own assets would turn a 401 into a blank screen.
 *
 * The URL-normalisation rules below are unaffected: they still return early for any path
 * that is not `/products` or `/blog`, so this broadened matcher adds the gate and the
 * early exit, and changes no public behaviour on its own.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
