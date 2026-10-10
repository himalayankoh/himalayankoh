/**
 * The access gate for a deployment that holds live credentials but is not yet the store.
 *
 * ## The hole this closes
 *
 * The pre-cutover production Worker is reachable at its `*.workers.dev` name by anyone who
 * learns it, and it holds **live** Shippo and Stripe keys. Rate limiting the two public
 * Shippo routes bounded what one caller can spend; it did not stop a caller. The correct
 * control is an authenticating proxy in front of the deployment, and that is what
 * Cloudflare Access is — but Access is **not enabled on this account**
 * (`access.api.error.not_enabled`), and enabling it is a one-time dashboard action (choose
 * a team name, then policies can be created by API). Until that exists, the deployment
 * needs a gate it can enforce itself, which is this.
 *
 * ## Why the judgement is here and the enforcement is in `middleware.ts`
 *
 * The rule is pure: given a host, whether a token is configured, and what the request
 * carries, may it be served? Keeping it out of the middleware means every branch is
 * unit-testable without a running Worker, which matters because the failure modes are
 * both bad and asymmetric — a gate that is too loose leaves live keys exposed, and one
 * that is too tight locks the owner out of their own deployment.
 *
 * ## The three ways a real caller gets through, and the one that must not be blocked
 *
 * 1. **A production host is never gated.** `himalayankoh.com` and `www` are the store; a
 *    gate that also fired there would be a store-wide outage at the worst possible moment.
 *    The cutover is a routing change, so the same build serves both before and after it —
 *    which means this check has to be by *host*, not by deployment.
 * 2. **No token configured means no gate.** A deployment with no token behaves exactly as
 *    it did before, so this cannot break staging, `next dev`, or a build where the owner
 *    has not opted in.
 * 3. **A browser gets a cookie once**, by visiting `/?hk_preview=<token>`, so the owner uses
 *    the deployment normally afterwards. A script or a health probe sends
 *    `Authorization: Bearer <token>` instead, because that is what a non-browser can do.
 *
 * The comparison is exact string equality on the token itself. No prefix match, no
 * case-insensitivity, no timing tolerance: a partial token, a token with a character
 * appended and a token in the wrong case must all fail.
 *
 * ## The requests this gate does not govern at all
 *
 * A request with **no `Host`** and a request naming **a loopback host** are not public
 * requests, so there is nothing to protect and the gate stays out of the way. This is not a
 * loophole: Cloudflare routes by `Host`, so neither shape can reach this Worker from the
 * internet, and both are shapes this project generates itself.
 *
 * The no-host case is not hypothetical — it broke the build. `next build` and
 * `vinext build` prerender `/_not-found` by invoking the middleware with a synthetic
 * request that carries no `Host` (only Next's own `x-nextjs-prerender` marker). The gate
 * judged that request unauthenticated, answered it 401, and the export of the page failed
 * with an opaque `TypeError` from the webpack runtime. A token in `.env.local` — which is
 * where the deploy tooling needs it — therefore made `npm run build` fail outright. Next's
 * marker header is *not* what this keys on: a caller can send any header it likes, and a
 * gate that an arbitrary header switches off is not a gate. The absent host is the signal,
 * because a caller cannot remove the `Host` Cloudflare requires of a real request.
 *
 * Leading and trailing whitespace around the *whole* header value is stripped, and that is
 * deliberate rather than lax. `Authorization` is an HTTP header and may legitimately be
 * padded; stripping those characters cannot admit a token that differs in any other way, so
 * it removes a failure mode that would otherwise look like "the token is wrong" when the
 * token is right. Whitespace *inside* the token is not tolerated, because it would then be
 * part of the value being compared.
 */

/** The cookie a browser holds after the one-time exchange. */
export const PREVIEW_COOKIE = 'hk_preview';

/** The query parameter that performs the exchange. Long and specific, so it is not a typo trap. */
export const PREVIEW_QUERY_PARAM = 'hk_preview';

/** Why the gate decided what it decided. Returned rather than logged, so tests can assert it. */
export type PreviewAccessReason =
  | 'open'
  | 'production-host'
  | 'not-a-public-request'
  | 'authorized-header'
  | 'authorized-cookie'
  | 'missing'
  | 'mismatch';

export interface PreviewAccessDecision {
  required: boolean;
  authorized: boolean;
  reason: PreviewAccessReason;
}

export interface PreviewAccessInput {
  /** The normalized request host — no port, lowercase. */
  host: string | null | undefined;
  /** `PREVIEW_ACCESS_TOKEN`, or an empty/absent value when the gate is off. */
  configuredToken: string | null | undefined;
  /** The `Authorization` header, if any. */
  authorization: string | null;
  /** The value of the `hk_preview` cookie, if any. */
  cookie: string | null;
}

/** `host` header normalisation: lowercase, no port. Mirrors `@/lib/seo/indexing`. */
function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Hosts that can only mean "this machine", so the gate does not apply to them.
 *
 * `next dev` binds one of these, and a developer with the token in `.env.local` for the
 * deploy tooling should not have to present it to read their own localhost — the point of
 * the token is a *deployed* deployment that is reachable from outside.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

/** True when this request cannot have come from the public internet. */
export function isLocalOrAbsentHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host);
  return normalized === '' || LOCAL_HOSTS.has(normalized);
}

/**
 * True when this request must present the token before it is served.
 *
 * `productionHosts` is passed in rather than imported so this module keeps no opinion about
 * which hosts are production — `@/lib/seo/indexing` already owns that list, and two copies
 * of it would drift.
 */
export function requiresPreviewAccess(input: PreviewAccessInput, productionHosts: readonly string[]): boolean {
  const token = (input.configuredToken ?? '').trim();
  if (token === '') return false;

  // A build's own prerender, and a developer's localhost, are not public requests. See the
  // note at the top of this file for why this cannot be used to slip past the gate.
  if (isLocalOrAbsentHost(input.host)) return false;

  const host = normalizeHost(input.host);
  if (productionHosts.includes(host)) return false;

  return true;
}

/** The token this request presents, from the header a script sends or the cookie a browser holds. */
export function presentedPreviewToken(input: Pick<PreviewAccessInput, 'authorization' | 'cookie'>): string {
  const header = (input.authorization ?? '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();

  return (input.cookie ?? '').trim();
}

/**
 * The whole decision: does this request need the token, and does it present the right one?
 *
 * Returns the reason rather than a bare boolean so a test can assert *why* something was
 * refused instead of only that it was, and so a caller can tell a production host, an open
 * deployment and a non-public request apart when it needs to.
 */
export function previewAccessDecision(
  input: PreviewAccessInput,
  productionHosts: readonly string[],
): PreviewAccessDecision {
  if (!requiresPreviewAccess(input, productionHosts)) {
    return {
      required: false,
      authorized: true,
      reason: (input.configuredToken ?? '').trim() === ''
        ? 'open'
        : isLocalOrAbsentHost(input.host)
          ? 'not-a-public-request'
          : 'production-host',
    };
  }

  // Either carrier authorizes on its own: the admin console on a gated QA URL
  // sends the preview cookie alongside an unrelated admin `Authorization`
  // bearer, and a header-first single pick would let that bearer shadow a
  // valid cookie into a mismatch. Each carrier is still an exact comparison
  // against the configured token, so presenting neither (or only wrong values)
  // fails exactly as before.
  const expected = (input.configuredToken ?? '').trim();
  const header = (input.authorization ?? '').trim();
  const headerToken = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() ?? '';
  if (headerToken !== '' && headerToken === expected) return { required: true, authorized: true, reason: 'authorized-header' };
  if ((input.cookie ?? '').trim() !== '' && (input.cookie ?? '').trim() === expected) return { required: true, authorized: true, reason: 'authorized-cookie' };

  const presented = presentedPreviewToken(input);
  if (presented === '') return { required: true, authorized: false, reason: 'missing' };
  return { required: true, authorized: false, reason: 'mismatch' };
}
