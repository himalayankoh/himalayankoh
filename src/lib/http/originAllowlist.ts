import { publicEnv } from '@/lib/env';

/**
 * Which browser origins may call this app's own JSON APIs, and reflect back in
 * `Access-Control-Allow-Origin`.
 *
 * The rule is "same site", expressed in a way that survives moving off Vercel.
 *
 * The previous version read `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` and
 * fell back to the literal `https://himalayan-koh.vercel.app`. None of those mean
 * anything on Cloudflare Workers: the two variables are simply absent, and the
 * fallback named a *different deployment* — so after the move the check was
 * answering "is this the old Vercel host", which is not the question. An
 * allowlist that silently degrades to a stale host is worse than no allowlist,
 * because it still looks correct in review.
 *
 * Two origins are allowed instead, and neither is deployment-specific:
 *
 * 1. **The origin this deployment is served from**, taken from the request's own
 *    URL. A preview, a temporary `*.workers.dev` host and production all satisfy
 *    it without being named anywhere, and a third party cannot satisfy it —
 *    `Origin` is set by the browser to the requesting page's origin, and over
 *    HTTPS the request URL's host is the host Cloudflare routed to us.
 * 2. **The configured public origin** (`NEXT_PUBLIC_SITE_URL`), for the case
 *    where the app is reached through one host but the browser page is on
 *    another — e.g. the preview domain in front of a temporary deployment.
 *
 * Loopback is allowed in development only, so `npm run dev` works without
 * teaching the allowlist about every port.
 *
 * Deliberately not `.endsWith('.vercel.app')` (or any other shared suffix): that
 * would let every unrelated project on the shared domain ride this API and its
 * rate limit.
 */
export function isAllowedRequestOrigin(origin: string, requestUrl: string | URL): boolean {
  if (!origin) return false;

  let caller: URL;
  let self: URL;
  try {
    caller = new URL(origin);
    self = new URL(String(requestUrl));
  } catch {
    return false;
  }

  const isLoopback = (hostname: string) =>
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';

  if (process.env.NODE_ENV === 'development' && isLoopback(caller.hostname)) return true;

  // https only: an origin claiming `http://` must not be reflected from a page
  // served over TLS.
  if (caller.protocol !== 'https:') return false;

  if (caller.hostname === self.hostname) return true;

  const configured = publicEnv.siteUrl?.trim();
  if (!configured) return false;
  try {
    const site = new URL(configured);
    return caller.hostname === site.hostname;
  } catch {
    return false;
  }
}
