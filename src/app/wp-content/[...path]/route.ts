/**
 * `GET /wp-content/*` — the storefront's window onto WordPress's media library.
 *
 * ## Why this route exists
 *
 * The live catalogue stores image URLs exactly as WooCommerce reports them, and
 * they are absolute to the apex: `https://himalayankoh.com/wp-content/uploads/…`.
 * The same is true of every attachment a customer has ever seen on an order.
 * WordPress is a *directory* on that host today, so those URLs work because the
 * apex is WordPress.
 *
 * The moment the apex is attached to this Worker, they stop being WordPress
 * paths and become requests to the Worker — and an image request that reaches
 * the Next router is a 404. Every product photo, every gallery, every order line
 * would break at the same moment, which is the single largest risk in the
 * cutover and the reason the cutover is not a DNS change alone.
 *
 * So this route answers them: it takes the `/wp-content/…` path, resolves it
 * against the **configured backend origin**, and streams the file back. One
 * origin for the browser, no rewrite of the catalogue, and no media migration on
 * cutover day.
 *
 * ## Why it cannot loop
 *
 * The upstream is built from `backendConfig.wordpressBaseUrl`, which is the
 * *dedicated backend host* (`NEXT_PUBLIC_WORDPRESS_BASE_URL` /
 * `WORDPRESS_BASE_URL`) — never the origin this request arrived on. The design
 * rule that keeps production working is exactly this: the storefront must never
 * use its own public origin as a backend, because then every read would be the
 * Worker calling itself. `scripts/production-target.mjs` documents that at
 * length and the production guard refuses a build where the two are the same.
 *
 * Redirects are refused rather than followed (`redirect: 'manual'`, and a 3xx
 * becomes a 404). WordPress answers a static upload directly, so a redirect here
 * can only be a canonical-host bounce — following it is how a proxy acquires a
 * loop, and there is nothing to gain from one.
 *
 * ## What it deliberately is not
 *
 * It is not an image proxy for arbitrary URLs: the caller supplies only the path
 * under `/wp-content/`, the origin is fixed by configuration, and a path that
 * escapes its prefix (`..`, an encoded separator, a NUL) is refused before any
 * request is made. It is not a general WordPress proxy either — `/wp-json/`,
 * `/wp-admin/` and `/wp-login.php` are not forwarded, because the storefront's
 * own API calls go to the backend host directly and there is no reason to make
 * the shopping domain an entry point to the WordPress admin. Those paths live at
 * the backend hostname, where they belong.
 */

import { NextResponse } from 'next/server';
import { backendConfig } from '@/lib/backend/config';
import { safeWpContentPath } from '@/lib/images/wpContentPath';

export const dynamic = 'force-dynamic';

/** How long to wait for the backend before giving up on one file. */
const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Headers worth passing back to the browser.
 *
 * An allowlist rather than a copy of every upstream header: `set-cookie` is the
 * one that matters, because forwarding WordPress's session cookies onto the
 * storefront's origin would hand the shopping domain a WordPress session it has
 * no business holding.
 */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
] as const;

/** Request headers worth passing upstream — cache validators and range, nothing else. */
const FORWARDED_REQUEST_HEADERS = ['if-none-match', 'if-modified-since', 'range'] as const;

function notFound(reason: string): NextResponse {
  // 404 rather than 403 for a refused path: a crafted path is not a resource,
  // and the storefront should look the same whether the file is absent or the
  // request was malformed.
  return new NextResponse(reason, {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function serve(request: Request, segments: readonly string[], includeBody: boolean) {
  const backend = backendConfig.wordpressBaseUrl;
  if (!backend) {
    // No backend configured: this deployment has no media to serve, and saying
    // so is not an error in the shopping domain.
    return notFound('Not found');
  }

  const path = safeWpContentPath(segments);
  if (!path) return notFound('Not found');

  const upstreamUrl = new URL(`${backend.replace(/\/+$/, '')}/${path}`);
  // The query string is preserved (WordPress uses it for cache busting, and the
  // catalogue stores some URLs with one) but only as query text — it can never
  // move the request to another path.
  const inbound = new URL(request.url);
  if (inbound.search) upstreamUrl.search = inbound.search;

  const headers: Record<string, string> = { Accept: '*/*' };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: includeBody ? 'GET' : 'HEAD',
      headers,
      signal: controller.signal,
      // Refused rather than followed: see the file header. A canonical-host
      // bounce is the only redirect WordPress sends for a static file, and
      // following it is how a proxy acquires a loop.
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return new NextResponse('The store’s image host did not respond.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } finally {
    clearTimeout(timer);
  }

  // 200/206 are files; 304 is a cache validator answer and carries no body.
  const isFile = upstream.status === 200 || upstream.status === 206;
  if (!isFile && upstream.status !== 304) {
    // A 3xx lands here on purpose — see above. So does anything unexpected.
    return notFound('Not found');
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has('cache-control')) {
    // Uploads are content-addressed by name in practice, but the owner can
    // replace a file under the same name from the media library, so this is a
    // day rather than a year — and the edge may hold it longer than the browser.
    responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  }

  return new NextResponse(includeBody && upstream.body ? upstream.body : null, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  return serve(request, path ?? [], true);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  return serve(request, path ?? [], false);
}
