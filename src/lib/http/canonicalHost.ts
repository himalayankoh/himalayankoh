/**
 * One canonical hostname for the shop, decided before anything renders.
 *
 * ## What this closes
 *
 * The apex and `www` are both attached to the storefront, and until this module existed
 * both answered **200 with the same page**: `/` and `/products` were reachable at two
 * hostnames, each with its own canonical pointing at the apex. That is the classic
 * duplicate-hostname shape — two URLs for one product, one of them competing with the
 * other in search, and every inbound `www` link (the form most people type and most
 * old print material and mail signatures carry) landing on the duplicate rather than
 * being consolidated onto the canonical host.
 *
 * Before the cutover this never showed up, because the 301 that collapsed `www` onto the
 * apex was **WordPress's own canonical redirect** (`x-redirect-by: WordPress`) — an
 * accident of the old apex being WordPress, not a property of the shop. When the apex
 * became this Worker, that redirect went with it, and the check that caught it is
 * recorded in `docs/production/CUTOVER-READINESS.md`.
 *
 * ## The two ways to get this wrong
 *
 * 1. **Redirecting on any method.** A `301` tells a client to re-issue the request, and
 *    in practice clients re-issue a redirected `POST` as a `GET` with no body. Silently
 *    converting a state-changing request into a bodyless read is worse than serving the
 *    duplicate — and nothing on this shop needs it: the only non-`GET` traffic is the
 *    WooCommerce callback, which is relayed before this rule runs, and the JSON API,
 *    which is addressed at the apex. So only `GET` and `HEAD` are redirected; every
 *    other method is served as it arrived.
 * 2. **Redirecting a hostname the shop does not own.** The rule keys on the exact
 *    arrival host, never on a suffix or a substring: `preview.himalayankoh.com` (the
 *    staging storefront), the deployment's `*.workers.dev` name and loopback addresses
 *    are all untouched, so staging keeps its own origin and its own canonical.
 *
 * The location is built from the arrival path and query **verbatim** — no re-encoding, no
 * trailing-slash or case normalisation — so a redirect cannot change which resource the
 * request names, and no query parameter is dropped on the way to the canonical host.
 */

/** The host every public URL is canonicalised onto. */
export const CANONICAL_APEX_HOST = 'himalayankoh.com';

/** The host that is permanently redirected to the apex. */
export const WWW_HOST = 'www.himalayankoh.com';

/** Methods a 301 may safely be answered with: they carry no body and change nothing. */
const REDIRECTABLE_METHODS = new Set(['GET', 'HEAD']);

/** A `Host` header as a bare lowercase hostname: no port, no surrounding whitespace. */
export function hostWithoutPort(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return '';
  // A bracketed IPv6 literal keeps its brackets; everything else is split at the port.
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  const colon = value.indexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

/**
 * The canonical location for a request that arrived on a non-canonical host, or `null`.
 *
 * Returns an absolute `https://himalayankoh.com…` URL whenever the request should be
 * redirected, and `null` in every other case, so the caller only has to ask once.
 */
export function canonicalHostRedirect(input: {
  /** The arrival `Host` header. */
  host?: string | null;
  /** The pathname exactly as received, leading slash included. */
  pathname: string;
  /** The query string exactly as received, including its leading `?`, or `''`. */
  search?: string;
  /** The request method. */
  method?: string;
}): string | null {
  const arrival = hostWithoutPort(input.host);
  if (arrival !== WWW_HOST) return null;
  if (!REDIRECTABLE_METHODS.has((input.method ?? 'GET').toUpperCase())) return null;

  const search = input.search ?? '';
  return `https://${CANONICAL_APEX_HOST}${input.pathname}${search}`;
}
