/**
 * Is this deployment allowed to write an order at all?
 *
 * A separate question from "can this deployment take money" — that one is
 * `lib/stripe/server/readiness`, and it already fails closed. This module is about
 * the other half: the storefront can go public before its payments are finished,
 * presenting the catalogue, the product pages and the shipping information while
 * refusing to accept an order.
 *
 * ## Why it needs its own switch
 *
 * Charging is refused automatically when Stripe is not configured. Order *writing*
 * is not: `/api/orders/create` still writes a real WooCommerce order for an
 * invoice-type submission — deliberately, because an invoice order is billed
 * separately and has no payment to wait for. But that is also a live, unauthenticated
 * way to put an order into the store's order table, which is precisely what a
 * catalogue-only launch must not allow. Gating the card path alone would leave the
 * door open behind it.
 *
 * So the pause is explicit and deployment-level, and it is enforced on the server.
 * Hiding the buttons is not the control; the refusals below are.
 *
 * ## Why the default is "not paused"
 *
 * A deployment that says nothing keeps today's behaviour, so local development, the
 * test suite and the staging Worker are unchanged. What makes that safe rather than
 * merely convenient is that the **production** deployment does not rely on a default:
 * `STOREFRONT_ORDERS_PAUSED` is declared in `wrangler.production.jsonc`, and
 * `scripts/assert-production-config.mjs` refuses a build whose configuration lost it.
 * The switch cannot quietly go missing from the deployment that needs it, and turning
 * ordering back on is a deliberate `"false"` in a reviewed file rather than a deleted
 * variable.
 *
 * Pure over its input so every refusal is pinned in `ordering.test.ts` without a
 * deployment to test against.
 */

/** The deployment variable. A Worker var in `wrangler.production.jsonc`, or a line in `.env.local`. */
export const ORDERS_PAUSED_ENV_KEY = 'STOREFRONT_ORDERS_PAUSED';

/**
 * The same fact, for the browser bundle — inlined at build time by its `NEXT_PUBLIC_` name.
 *
 * The runtime variable above is what the server enforces, and it is enough to stop an
 * order. It is not enough to stop the shop *advertising* one: every product card and
 * product page renders a quantity stepper and an "Add to Cart" button, so a deployment
 * refusing every order would still look like a shop that takes them. A disabled button
 * with no reason is the other half of the same failure.
 *
 * A public build-time constant rather than a fetch, for the same reason the launch mode
 * is a declaration: the controls are rendered by client components on prerendered pages,
 * and one inlined boolean reaches all of them — home, listing, product page, wishlist,
 * quick view — with no request and no prop threaded through five components that could
 * each be forgotten. The two variables are asserted equal by
 * `scripts/assert-production-config.mjs`, so the screen and the refusal cannot disagree.
 *
 * Read as a literal member expression: Next and Vite only inline `process.env.X` written
 * out in full.
 */
export const ORDERS_PAUSED_PUBLIC_ENV_KEY = 'NEXT_PUBLIC_ORDERS_PAUSED';

/**
 * May this build's screens offer a purchase?
 *
 * Named as the positive because that is how every call site reads: a card asks whether it
 * may offer the cart, and the answer is `false` on a catalogue-only deployment.
 */
export const ORDERING_ENABLED = process.env.NEXT_PUBLIC_ORDERS_PAUSED !== 'true';

/**
 * What a customer is told while ordering is paused.
 *
 * Names a way to actually buy rather than only saying no: the shop is a real business
 * with a phone line and an inbox, and an order the owner takes by hand is better than
 * a shopper bouncing off a dead checkout. Deliberately silent about Stripe, keys and
 * configuration — a shopper is owed the fact, not the diagnosis.
 */
export const ORDERS_PAUSED_MESSAGE =
  'Online ordering is temporarily unavailable. Please contact us at sales@himalayankoh.com or (832) 224-6466 to place your order.';

/** Where the pause came from, for the admin console and for support. */
export type OrdersPausedSource = 'deployment' | 'default';

export interface OrderingState {
  /** True when this deployment must refuse to write an order. */
  paused: boolean;
  source: OrdersPausedSource;
}

/**
 * The whole decision: one variable, read once.
 *
 * `'true'` pauses, `'false'` orders, and anything else — unset, empty, misspelled,
 * `'1'`, `'yes'` — leaves the deployment on its existing behaviour rather than
 * guessing. That asymmetry is deliberate: this switch exists to stop a **launch**
 * from taking orders it is not ready to take, so it is declared in the production
 * config where a human reads it, not inferred from a value that might be a typo.
 * A typo here cannot silently enable ordering on a deployment that paused itself,
 * and it cannot silently take down a deployment that did not.
 */
export function resolveOrderingState(envValue: string | null | undefined): OrderingState {
  const value = (envValue ?? '').trim().toLowerCase();
  if (value === 'true') return { paused: true, source: 'deployment' };
  if (value === 'false') return { paused: false, source: 'deployment' };
  return { paused: false, source: 'default' };
}

/**
 * This deployment's own answer, read from its environment.
 *
 * Takes the environment as a plain map rather than `NodeJS.ProcessEnv`, so the answer
 * can be read for a *hypothetical* deployment — which is what the tests do — without
 * standing up one or casting an object into a type that requires a `NODE_ENV` the
 * switch has nothing to do with. `process.env` satisfies it as it is.
 */
export function orderingState(env: Record<string, string | undefined> = process.env): OrderingState {
  return resolveOrderingState(env[ORDERS_PAUSED_ENV_KEY]);
}

/** Convenience for the routes: may this request write an order? */
export function isOrderingPaused(env: Record<string, string | undefined> = process.env): boolean {
  return orderingState(env).paused;
}
