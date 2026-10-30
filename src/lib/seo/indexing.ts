/**
 * Which hosts may be indexed — the one judgement both the HTTP layer
 * (`next.config.ts`, which sets `X-Robots-Tag`) and the `robots.txt` route read.
 *
 * This is an **allowlist of production hosts**, inverted from the denylist it
 * replaced, because the deployment story it has to survive is no longer "one
 * preview subdomain":
 *
 * - `preview.himalayankoh.com` serves this same build on a second domain, so a
 *   preview request and a production request render identical HTML — nothing
 *   exists at build time to branch on.
 * - Temporary deployments (Vercel previews, and now Cloudflare Workers on
 *   `<worker>.<account>.workers.dev`) each get a hostname that is new on every
 *   deploy. A denylist needs an entry per deployment and goes stale the moment
 *   one is missed; an allowlist names the two hosts that are production and
 *   leaves every other host — known, unknown, or invented tomorrow —
 *   non-indexable by default.
 *
 * Two things follow, and both are deliberate:
 *
 * 1. **A new deployment is private until it is deliberately published** by
 *    being served on a host listed here. That is the safe direction for the
 *    mistake to fall in.
 * 2. **The cost of a wrong entry is asymmetric**, so the list is short, exact
 *    and covered by tests that pin the apex: adding a host here publishes it,
 *    and removing one un-publishes it. Never match on a suffix of a production
 *    domain (`notpreview.himalayankoh.com` must not be treated as production
 *    either way round).
 *
 * The guard is applied per request at the HTTP layer rather than in
 * `generateMetadata`: reading the request's host there is a dynamic API call,
 * which would opt every public route that is currently prerendered (`/`,
 * `/about`, `/contact`, … — 38 of them) into on-demand server rendering.
 */

/** The only hosts that may be indexed. Everything else is treated as a deployment. */
export const PRODUCTION_HOSTS: readonly string[] = [
  'himalayankoh.com',
  'www.himalayankoh.com',
];

/** The `host` header may carry a port (`localhost:3002`) and any casing. */
function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

/** True for a host that serves the published storefront. */
export function isProductionHost(raw: string | null | undefined): boolean {
  const host = normalizeHost(raw);
  return host !== '' && PRODUCTION_HOSTS.includes(host);
}

/**
 * True when a response on this host must carry `noindex, nofollow` and its
 * `robots.txt` must refuse crawling — i.e. for every host that is not
 * production, including a missing `Host` header.
 */
export function requiresNoindex(raw: string | null | undefined): boolean {
  return !isProductionHost(raw);
}
