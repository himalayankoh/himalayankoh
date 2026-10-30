/**
 * Which links the router shim can resolve itself.
 *
 * This rule is one line of policy — *a destination that changes only the query
 * string, on the page the visitor is already on, is applied in place* — and it
 * exists because the alternative silently broke every category filter on the
 * storefront. It lives in its own module, rather than inside `router-compat.tsx`,
 * so it can be tested without a browser or a JSX transform.
 *
 * The measurement that made the rule necessary: on the deployed staging build,
 * clicking "Edible Pink Salt" on `/products` ran Next's `Link` handler, which
 * called `preventDefault()`, and then produced no client transition, no history
 * update, no document load and no error for the eight seconds it was watched. The
 * URL stayed `/products`, the grid stayed at 18 products and the active pill stayed
 * "All" — a dead control, and exactly the kind that makes a shopper conclude the
 * page is broken rather than that the filter is empty.
 */

/** The path part of a URL: everything before the query string. */
export function pathOnly(url: string): string {
  return url.split('?')[0] || '/';
}

/**
 * The href a same-path, query-only destination should become — or `null` when the
 * destination is not that.
 *
 * `null` means "leave this to Next's router": a different pathname, an in-page
 * anchor, an empty destination, or a link that points at the URL already in the
 * address bar (which must not add a history entry).
 *
 * A bare `?tab=orders` is resolved against the current path, which is how
 * react-router treated it and how every account/admin tab in this app writes it.
 */
export function queryOnlyDestination(destination: string, currentHref: string): string | null {
  const hashIndex = currentHref.indexOf('#');
  const current = hashIndex >= 0 ? currentHref.slice(0, hashIndex) : currentHref;
  const [currentPathPart, currentQuery = ''] = current.split('?');
  const currentPath = currentPathPart || '/';

  if (!destination || destination.startsWith('#')) return null;

  const resolved = destination.startsWith('?') ? `${currentPath}${destination}` : destination;
  const resolvedHashIndex = resolved.indexOf('#');
  const resolvedWithoutHash =
    resolvedHashIndex >= 0 ? resolved.slice(0, resolvedHashIndex) : resolved;
  const [resolvedPathPart, resolvedQuery = ''] = resolvedWithoutHash.split('?');

  if ((resolvedPathPart || '/') !== currentPath) return null;
  if (resolvedQuery === currentQuery) return null;
  return resolvedWithoutHash;
}
