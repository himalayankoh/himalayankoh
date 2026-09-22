/**
 * Customer session tokens — a WooCommerce customer identity, signed locally.
 *
 * ## What changed and why
 *
 * Customer accounts used to be Supabase identities: a shopper signed in with
 * Supabase Auth and the app carried a `profiles.id` uuid around as "the customer".
 * That uuid is not a customer in any sense the store understands — it cannot name
 * an order, a cart or a wishlist owner, because WooCommerce has never heard of it.
 * The two things that needed a *real* customer had to make one up:
 *
 *   - the cart was scoped to the browser, via a Store API `Cart-Token` cookie, so
 *     it did not follow the shopper to another device; and
 *   - the wishlist stored `owner` as that uuid, so the same shopper signing in
 *     somewhere else, or being re-created, orphaned their own rows.
 *
 * Now the customer identity **is** the WooCommerce customer id, and both hang off
 * it. There is no second identity to reconcile.
 *
 * ## Why the WordPress user id is the customer id
 *
 * In WooCommerce a registered customer *is* a WordPress user with the `customer`
 * role, and `/wc/v3/customers/<id>` is keyed by that user id. So the id the login
 * route verifies against WordPress is already the customer id, and nothing has to
 * be created or matched by email.
 *
 * ## Why this secret is not the admin one
 *
 * The payloads differ (this one may not claim `admin`) and so do the keys, so a
 * customer session cannot be replayed as an administrator even if one of the two
 * values leaks. Rotating `CUSTOMER_SESSION_SECRET` ends every customer session at
 * once, which is the only server-side revocation this design has — tokens are
 * stateless and expire on their own.
 *
 * ## What the session deliberately does not carry
 *
 * No Supabase id. Order history already comes from WooCommerce — the account
 * routes read `/wc/v3/orders` filtered by the customer's email, and never needed
 * the Supabase identity — so there is nothing to bridge for the outcome this pass
 * is for. What is still on Supabase is the profile and address book, which is the
 * remaining slice of the customer migration (see
 * `docs/STOREFRONT-WORDPRESS-CONTRACT.md`); carrying a uuid here would not make
 * those work, because the browser no longer holds a Supabase session to read them
 * with.
 *
 * Uses `./sessionToken` for the encoding, the same primitives the admin session
 * uses, so there is one implementation of the signing.
 */

import { openToken, signToken } from './sessionToken';

/** Default customer session lifetime: 30 days, because shoppers expect to stay signed in. */
const DEFAULT_TTL_HOURS = 24 * 30;

/** The shortest signing key we accept, so a placeholder cannot be used by accident. */
const MIN_SECRET_LENGTH = 16;

export interface CustomerSessionPayload {
  /**
   * The WooCommerce customer id — also the WordPress user id. Named `cid` rather
   * than `sub` so that the value a route reads is unmistakably a customer, not the
   * Supabase user id that used to sit in `sub`.
   */
  cid: number;
  email: string;
  name: string;
  role: 'customer';
  iat: number;
  exp: number;
}

/** What a verified sign-in knows about the customer. */
export interface CustomerIdentity {
  /** WooCommerce customer id (== WordPress user id). */
  customerId: number;
  email: string;
  name: string;
}

/**
 * The signing key, or null when customer sign-in is not configured. A too-short
 * value counts as unconfigured rather than accepted, so pasting a placeholder does
 * not create forgeable sessions.
 */
export function customerSessionSecret(): string | null {
  const secret = (process.env.CUSTOMER_SESSION_SECRET || '').trim();
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** True when customer sign-in is configured; every customer route fails closed without it. */
export function isCustomerAuthConfigured(): boolean {
  return customerSessionSecret() !== null;
}

/** Session lifetime in ms, from `CUSTOMER_SESSION_TTL_HOURS` (clamped, with a sane default). */
export function customerSessionTtlMs(): number {
  const raw = Number(process.env.CUSTOMER_SESSION_TTL_HOURS || DEFAULT_TTL_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 && raw <= 24 * 365 ? raw : DEFAULT_TTL_HOURS;
  return Math.round(hours * 3_600_000);
}

/**
 * Mint a signed customer session. Throws when `CUSTOMER_SESSION_SECRET` is missing
 * — the caller turns that into a 503 rather than issuing a token nothing could
 * verify.
 */
export async function createCustomerSession(
  identity: CustomerIdentity
): Promise<{ token: string; payload: CustomerSessionPayload }> {
  const secret = customerSessionSecret();
  if (!secret) {
    throw new Error(
      'Customer sign-in is not configured: set CUSTOMER_SESSION_SECRET in the server environment.'
    );
  }

  const customerId = Number(identity.customerId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new Error('A customer session needs a real WooCommerce customer id.');
  }

  const issuedAt = Date.now();
  const payload: CustomerSessionPayload = {
    cid: customerId,
    email: (identity.email || '').trim().toLowerCase(),
    name: (identity.name || '').trim(),
    role: 'customer',
    iat: issuedAt,
    exp: issuedAt + customerSessionTtlMs(),
  };

  const token = await signToken(payload, secret);
  return { token, payload };
}

/**
 * Verify a signed customer session. Returns the payload, or null for anything that
 * is not a currently-valid customer token: a bad signature, a malformed body, a
 * missing secret, an expired session, or an admin token presented here (the role
 * claim must be `customer`, and the admin module signs with a different key
 * anyway).
 */
export async function verifyCustomerSessionToken(
  token: string
): Promise<CustomerSessionPayload | null> {
  const secret = customerSessionSecret();
  if (!secret) return null;

  const raw = await openToken(token, secret);
  if (!raw) return null;

  const payload = raw as unknown as CustomerSessionPayload;

  if (payload.role !== 'customer') return null;
  if (!Number.isInteger(payload.cid) || payload.cid <= 0) return null;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  if (payload.exp <= Date.now()) return null;

  return payload;
}
