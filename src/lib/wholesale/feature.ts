/**
 * Whether the wholesale side is switched on for this deployment.
 *
 * ## Why a switch at all
 *
 * Wholesale is a second business on the same site: its own plugin, its own tables, its
 * own portal. If the plugin is not installed, or the workspace is being changed, the
 * owner must be able to take the B2B side down **without touching retail** — the shop,
 * the cart, the account and the console do not consult this value, so they cannot
 * break because of it.
 *
 * ## Default: on
 *
 * An unset variable means on, because a deployment that installs the plugin and
 * forgets the flag should get the feature it installed. Only an explicit off value
 * turns it off, so a typo in a variable name cannot silently disable a business.
 *
 * ## What "off" does, and does not do
 *
 * Off hides the rail entry and answers the portal and admin screens with a stated
 * "not available" instead of a broken form. It does **not** delete anything: accounts,
 * quotations and orders stay in the database, and turning it back on restores them.
 *
 * Isomorphic — the value is public because the console renders it, and it is not a
 * secret: knowing that a shop has a trade portal is not privileged information.
 */

/** The environment values that mean "off". Everything else means on. */
const OFF_VALUES = new Set(['0', 'false', 'off', 'no', 'disabled']);

/** True when the wholesale side should be reachable. */
export function isWholesaleEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_WHOLESALE_ENABLED ?? process.env.WHOLESALE_ENABLED ?? '').trim();
  if (!raw) return true;
  return !OFF_VALUES.has(raw.toLowerCase());
}
