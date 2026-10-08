/**
 * The one place a `/wp-content/…` request is turned into a path that is safe to
 * append to the backend origin.
 *
 * It lives here rather than beside the route for the same reason
 * `lib/ai/statusCache.ts` does: Next.js validates the exports of a `route.ts`
 * against the set of route handlers it allows, and a helper exported from one
 * fails the build's generated route types with
 * `Property 'safeWpContentPath' is incompatible with index signature`. The route
 * keeps only `GET`, `HEAD` and `dynamic`, and imports this.
 *
 * `src/app/wp-content/[...path]/route.ts` explains why the passthrough exists at
 * all; what matters here is the shape of the guarantee.
 *
 * ## The prefix is supplied here, not by the caller
 *
 * The route is mounted at `/wp-content/`, so what arrives is already relative to
 * it. Rebuilding the prefix from a constant is what makes the confinement
 * structural: there is no input that produces a path outside `wp-content/`,
 * however the URL was crafted.
 *
 * ## Encoding, not a character denylist
 *
 * Each segment is percent-encoded on the way out, and that is the part doing the
 * real work. A denylist would have to choose between refusing `,` `@` `+` `'`
 * `&` — all of which appear in real WordPress filenames, so refusing them 404s
 * real images — and guessing at every structural character. Encoding instead
 * makes `?`, `#` and `/` *inside* a segment inert, so a crafted segment can
 * never become a query string, a fragment or an extra path separator upstream.
 *
 * A traversal segment is refused outright, before there is anything to encode,
 * because an upstream that decodes twice would read an encoded `..` back as a
 * separator. That is the traversal this module exists to make impossible.
 */

/**
 * A path relative to the backend origin's `wp-content/` directory, or null when
 * the segments cannot describe one.
 */
export function safeWpContentPath(segments: readonly string[]): string | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const encoded: string[] = [];
  for (const raw of segments) {
    const segment = String(raw ?? '');
    // An empty segment is `//` or a trailing slash — not a path WordPress stores,
    // and the shape a crafted request uses to reshape what follows.
    if (!segment) return null;
    if (segment === '.' || segment === '..') return null;
    // A slash inside a segment means an encoded separator was decoded on the way
    // in — the router splits on real slashes, so this segment was built by hand.
    // It is refused rather than encoded because an upstream that decodes twice
    // would read it back as a separator.
    if (segment.includes('/')) return null;
    // NUL, control characters and backslashes never appear in an upload, and a
    // backslash is the one separator some servers normalise after decoding.
    if (/[\u0000-\u001f\u007f\\]/.test(segment)) return null;
    encoded.push(encodeURIComponent(segment));
  }

  return `wp-content/${encoded.join('/')}`;
}
