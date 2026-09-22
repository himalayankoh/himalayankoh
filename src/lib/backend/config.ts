/**
 * Central backend configuration — the public facts only.
 *
 * WordPress/WooCommerce is the backend, full stop. There used to be a
 * `NEXT_PUBLIC_DATA_SOURCE` flag choosing between Supabase and WooCommerce; with
 * the Supabase path deleted the flag has no second branch to select, and a switch
 * with one position is a way for a deployment to read nothing.
 *
 * Credentials are NOT here. They live in `./credentials`, which only server
 * modules import, because this file is reachable from client components and
 * every "no secret in the browser bundle" rule needs a structural owner rather
 * than a convention.
 */

function normaliseBaseUrl(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

/**
 * Server-only value wins so a deployment can point the server at an internal
 * or staging origin without shipping it to the browser. The public var is the
 * fallback because the WordPress/WooCommerce read endpoints used by the
 * storefront are public (no secrets), and client components need the origin.
 */
const wordpressBaseUrl = normaliseBaseUrl(
  process.env.WORDPRESS_BASE_URL || process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL
);

const woocommerceBaseUrl = normaliseBaseUrl(
  process.env.WOOCOMMERCE_BASE_URL ||
    process.env.NEXT_PUBLIC_WOOCOMMERCE_BASE_URL ||
    // WooCommerce lives in the same WordPress install unless told otherwise.
    wordpressBaseUrl
);

export const backendConfig = {
  wordpressBaseUrl,
  woocommerceBaseUrl,
  /** WordPress REST API root, e.g. https://example.com/staging/wp-json */
  get wordpressApiRoot(): string {
    return wordpressBaseUrl ? `${wordpressBaseUrl}/wp-json` : '';
  },
  /** Default read timeout for backend calls, in ms. */
  requestTimeoutMs: Number(process.env.WORDPRESS_REQUEST_TIMEOUT_MS || 12000),
};

/** True when the storefront should read catalog data from WordPress/WooCommerce. */
/** The configuration facts readiness depends on, so the rule can be tested directly. */
export interface BackendReadinessInput {
  wordpressApiRoot: string;
  consumerKey: string;
  consumerSecret: string;
}

/**
 * Why a given configuration can or cannot serve a full catalog. Pure, so both
 * the blocked and the ready answer can be pinned in a test; the ambient
 * wrapper below passes the running configuration in.
 */
export function describeReadiness(input: BackendReadinessInput): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!input.wordpressApiRoot) {
    blockers.push('No WordPress/WooCommerce origin is configured for this deployment.');
  }
  if (!(input.consumerKey && input.consumerSecret)) {
    // Phrased for the owner rather than for the developer: the exact variable
    // names belong in the server-only credentials module and the setup docs,
    // not in a string that ships to the browser.
    blockers.push(
      'WooCommerce REST credentials are not configured on the server — price and stock cannot be read from any public endpoint (the public Store API products route is currently failing on staging).'
    );
  }
  return { ready: blockers.length === 0, blockers };
}

