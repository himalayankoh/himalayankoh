/**
 * Where each kind of signed-in user belongs — the one place that decides it.
 *
 * This existed in four places before, and they disagreed. The login page sent
 * an admin to `/admin` only when the typed email matched the *demo* admin
 * address (a development-only list), so a real administrator signed in and
 * landed on the storefront. The header offered "My Account" → `/account` to
 * everyone, so an admin clicking their own name was dropped into the customer
 * portal. `/orders` bounced an admin to `/admin/orders` while `/account` let
 * them in. And a customer who typed `/admin` got an "Admin Access Required"
 * dead end rather than their own account page.
 *
 * The store has exactly two authenticated destinations and one role bit:
 *
 *   admin    → `/admin`    the console (products, orders, customers, settings)
 *   customer → `/account`  the storefront account portal, My Orders first
 *
 * Everything else is a redirect to one of those. `from` is honoured, but only
 * when it points into the destination's own world: an admin who was on their
 * way to `/admin/products` keeps that, and a customer who was on their way to
 * `/wishlist` keeps that — but neither role is ever handed the other's area,
 * and a login that started at an account page always ends at a real page
 * rather than bouncing back to `/login` (see `resolvePostLoginDestination`).
 */

/** The admin console. */
export const ADMIN_HOME = '/admin';

/** The customer account portal, which opens on My Orders. */
export const CUSTOMER_HOME = '/account';

/** Paths that belong to the console. */
const ADMIN_PREFIXES = ['/admin'] as const;

/** Paths that belong to the customer's own account. */
const CUSTOMER_PREFIXES = ['/account', '/orders', '/wishlist'] as const;

/**
 * Redirects for the account routes this app used to have separately.
 *
 * `next.config.ts` installs these, so they are answered by the router before any
 * page renders — an old bookmark resolves to the canonical route instead of
 * rendering a second account layout that could drift from the first. Kept here
 * beside the canonical routes because a redirect list is the other half of
 * "these two paths are one page".
 */
export const LEGACY_ACCOUNT_REDIRECTS: ReadonlyArray<{ source: string; destination: string }> = [
  // `/orders` was a second, standalone orders screen. It is now the first tab
  // of the account portal. One page, one layout, one fetch.
  { source: '/orders', destination: `${CUSTOMER_HOME}?tab=orders` },
  // `/orders/<id>` stays its own route (order detail) — see the prefix test.
  { source: '/my-account', destination: CUSTOMER_HOME },
  { source: '/my-orders', destination: `${CUSTOMER_HOME}?tab=orders` },
  { source: '/account/orders', destination: `${CUSTOMER_HOME}?tab=orders` },
  { source: '/profile', destination: `${CUSTOMER_HOME}?tab=profile` },
];

/** True when `path` names a route inside the admin console. */
export function isAdminPath(path: string | null | undefined): boolean {
  const value = (path ?? '').trim();
  return ADMIN_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`),
  );
}

/** True when `path` names a route inside the customer's account area. */
export function isCustomerPath(path: string | null | undefined): boolean {
  const value = (path ?? '').trim();
  return CUSTOMER_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`),
  );
}

/** The destination a role is sent to for "my account", "dashboard", sign-in. */
export function homeForRole(isAdmin: boolean): string {
  return isAdmin ? ADMIN_HOME : CUSTOMER_HOME;
}

/**
 * Where to land after a successful sign-in.
 *
 * A role's own area always wins over `from`, because `from` is attacker- and
 * accident-shaped input: it arrives as a query parameter. An admin is not sent
 * into the customer portal, a customer is not sent into the console, and a
 * customer whose `from` was an account page is not bounced back to `/login`
 * (those pages re-run their guard on arrival, so returning there signed-in is
 * correct — the guard now sees a session and lets them through; the hop only
 * ever looked like a loop when the guard was the thing that was wrong).
 */
export function resolvePostLoginDestination(options: {
  isAdmin: boolean;
  from?: string | null;
}): string {
  const from = (options.from ?? '').trim();

  if (options.isAdmin) {
    return isAdminPath(from) ? from : ADMIN_HOME;
  }

  // `/` is what the login page substitutes when nothing sent the visitor there,
  // so it means "no destination" rather than "the homepage, please" — and a
  // customer with no destination belongs on their account page, not the shop
  // front. Any *other* path is a real intent (a checkout in progress, a
  // wishlist, an order detail) and is honoured. Anything inside the console is
  // replaced, because that is not somewhere a customer can be.
  if (from === '' || from === '/' || isAdminPath(from)) return CUSTOMER_HOME;
  if (from.startsWith('/')) return from;

  return CUSTOMER_HOME;
}
