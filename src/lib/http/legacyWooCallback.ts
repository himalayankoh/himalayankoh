/**
 * The legacy WooCommerce callback surface — the one piece of WordPress's request
 * space the shopping domain has to keep answering after the cutover.
 *
 * ## Why the apex has to answer it at all
 *
 * The live WooCommerce install's payment gateway is configured with a webhook URL on
 * the **apex** (`https://himalayankoh.com/?wc-api=wc_stripe`), which is where the
 * plugin registers itself, and that URL lives in the Stripe dashboard — not in this
 * repository, and not something a deploy can edit. Today it works because the apex is
 * WordPress. The moment the apex is attached to the Worker it becomes this Worker's
 * request, and an unrecognised query string on `/` is a homepage render: Stripe would
 * get a 200 for an HTML page and the shop would silently stop being told about its
 * payments. That failure is invisible in the browser and only shows up as orders that
 * never flip to paid, which is why it is a pre-cutover blocker rather than a
 * post-cutover bug report.
 *
 * ## What this module decides, and what it deliberately does not
 *
 * It decides *whether a request is the legacy WooCommerce callback surface* — nothing
 * else. Forwarding is the middleware's job (it needs a backend origin and a fetch), and
 * the judgement is kept pure here so every accept and refuse case is unit-testable
 * without a deployment:
 *
 *   - **`?wc-api=<anything>`** anywhere in the query string. This is WooCommerce's own
 *     legacy API convention and the form every gateway plugin's webhook uses; the value
 *     names the handler (`wc_stripe`), and validating the *value* here would mean
 *     tracking which plugins are installed. The backend is the only thing that can
 *     answer that, so the shape is what this matches.
 *   - **`/wc-api/<handler>`** — the pretty-permalink form of the same convention, for an
 *     install whose rewrite rules publish it that way.
 *
 * Nothing else is forwarded. In particular this is **not** a general WordPress proxy:
 * `/wp-json/`, `/wp-admin/`, `/wp-login.php`, `/product/`, `/my-account/` and the rest
 * of the install stay at the backend hostname, where the owner and the admin console
 * reach them. Widening this surface is how the shopping domain becomes an entry point
 * into WordPress, which is exactly what the `/wp-content/` route refuses to do.
 *
 * The callback never carries a signature of *ours*: Stripe signs the body, and the
 * plugin verifies it against its own `whsec_`. The bridge therefore has to preserve the
 * body byte for byte (see the middleware) — a re-encoded or truncated body fails the
 * plugin's verification and looks, from Stripe's side, like a broken endpoint.
 */

/** WooCommerce's legacy API query parameter. */
export const LEGACY_WOO_CALLBACK_PARAM = 'wc-api';

/** The path form of the same convention. */
export const LEGACY_WOO_CALLBACK_PATH = '/wc-api';

export interface LegacyCallbackMatch {
  /** Whether this request belongs to the legacy WooCommerce callback surface. */
  forward: boolean;
  /** Why, for a log line or a test — never sent to a caller. */
  reason: 'wc-api-query' | 'wc-api-path' | 'not-a-callback';
}

/**
 * Whether a request URL is the legacy WooCommerce callback surface.
 *
 * Matched on the **shape** of the request rather than on a list of handler names: the
 * handler is a plugin's own registration, and the set of installed plugins is a fact
 * about the backend, not about this build. A request that names an unknown handler gets
 * the backend's own answer (WooCommerce replies `-1` or a 4xx), which is the honest
 * outcome — and it keeps a plugin the owner installs later working with no change here.
 */
export function legacyWooCallback(pathname: string, search: URLSearchParams): LegacyCallbackMatch {
  if (search.has(LEGACY_WOO_CALLBACK_PARAM)) {
    return { forward: true, reason: 'wc-api-query' };
  }

  if (pathname === LEGACY_WOO_CALLBACK_PATH || pathname.startsWith(`${LEGACY_WOO_CALLBACK_PATH}/`)) {
    return { forward: true, reason: 'wc-api-path' };
  }

  return { forward: false, reason: 'not-a-callback' };
}

/**
 * Request headers that must not travel to the backend.
 *
 * Three groups, each for its own reason:
 *
 *  - **`host` (and its `x-forwarded-` companions).** The backend is addressed by the URL,
 *    so a copied arrival host is at best noise and at worst a routing accident: measured
 *    locally, passing `host: 127.0.0.1:3005` upstream to a Cloudflare-proxied backend gets
 *    the callback **403** while the identical request without it is answered normally —
 *    the edge routes on `Host`, and it is a mystery to the gateway.
 *  - **`cookie` and `authorization`.** The callback authenticates with the plugin's own
 *    signature, not with a session or a credential, so forwarding the caller's WordPress
 *    cookies would hand the backend a session it was not given by a person, and forwarding
 *    an `Authorization` header would make the shopping domain a relay for *any* credential
 *    the backend accepts — the one shape of request a webhook relay must never carry. A
 *    gateway that needs HTTP basic auth does not use `?wc-api=`.
 *  - **Hop-by-hop and recomputed headers** (`connection`, `te`, `transfer-encoding`,
 *    `content-length`, `accept-encoding`): the bridge buffers the body and re-sends it, so
 *    both are recomputed rather than copied — and a stale `content-length` is exactly how a
 *    relay truncates a signed body.
 */
export const LEGACY_CALLBACK_HEADERS_TO_DROP: readonly string[] = [
  'host',
  'x-forwarded-host',
  'x-forwarded-proto',
  'cookie',
  'authorization',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
];
