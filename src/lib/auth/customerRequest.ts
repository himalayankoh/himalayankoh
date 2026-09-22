/**
 * Who is calling — a WooCommerce customer, according to the session they presented.
 *
 * ## One verifier, not two
 *
 * There used to be two of these: this module (used by the wishlist routes) and
 * `verifyCustomerRequest.ts` (used by the account routes), both checking a Supabase
 * token and both returning the Supabase user id in a different shape. Two owners of
 * one question is how the wishlist and the order history could disagree about who
 * was signed in; the account version was deleted and its three callers now use this
 * one.
 *
 * ## What identifies the caller now
 *
 * A customer session minted by the app (`lib/auth/customerSession.ts`) after
 * WordPress verified the shopper's password. It is verified here offline — one HMAC
 * signature and an expiry check, no database and no network — and the **only** thing
 * trusted from it is the claim the signature covers.
 *
 * The identity is a **WooCommerce customer id**, which is also the WordPress user id.
 * That is what per-account data is keyed by: the wishlist `owner`, and the account's
 * cart binding. Routes must derive it from the session and never from the request
 * body — an `owner` a browser can name is an owner a browser can forge, which is how
 * one shopper reads another's wishlist.
 *
 * Server-only.
 */

import { readBearerToken } from './sessionToken';
import { verifyCustomerSessionToken } from './customerSession';

export interface CustomerIdentity {
  /** WooCommerce customer id (== WordPress user id). */
  id: number;
  /** The customer's email, lower-cased, as WordPress reported it. */
  email: string;
  /** Display name from the account, or an empty string. */
  name: string;
}

export type CustomerVerification =
  | { ok: true; customer: CustomerIdentity }
  | { ok: false; status: number; error: string };

/** The refusal every customer route answers with, so signed-out reads as "sign in". */
const UNAUTHENTICATED = {
  ok: false as const,
  status: 401,
  error: 'Sign in to your account to continue.',
};

/**
 * The verified caller, or a refusal carrying the status the route should return.
 *
 * A caller whose token is missing, malformed, forged or expired gets the same answer:
 * they are not signed in. That is a 401 — "sign in" — not a 403, because the shopper
 * has nothing to be forbidden from; they simply have no session.
 */
export async function verifyCustomerRequest(request: Request): Promise<CustomerVerification> {
  const token = readBearerToken(request);
  if (!token) return UNAUTHENTICATED;

  const payload = await verifyCustomerSessionToken(token);
  if (!payload) return UNAUTHENTICATED;

  return {
    ok: true,
    customer: {
      id: payload.cid,
      email: payload.email,
      name: payload.name,
    },
  };
}
