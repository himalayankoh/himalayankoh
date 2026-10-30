/**
 * Wholesale session tokens — a buyer who has been through the portal's door.
 *
 * ## Why wholesale is not a retail customer session
 *
 * A retail customer signs in to buy a jar; a wholesaler signs in to price a
 * container. They are not the same authority: a wholesale session may see
 * ex-factory costs, tier pricing and freight, and a retail session must never see
 * any of it. So this is a third signed identity with its own key
 * (`WHOLESALE_SESSION_SECRET`), its own role claim and its own lifetime. A retail
 * customer token cannot be replayed here (different key, wrong role), and a
 * wholesale token cannot buy a jar as a retail customer.
 *
 * ## What the payload carries, and what it may never carry
 *
 * `accountId` is the plugin's `hk_wholesale_accounts.id` — the account the buyer
 * was approved under. Routes read buyer-facing quotes and orders by that id and by
 * nothing else: the browser never names its own account, so one buyer cannot read
 * another's quote by changing a number.
 *
 * The payload is a *bearer identity*: signed, readable, and only as trustworthy as
 * the server's verification of it. `role` is checked here, so a token minted by any
 * other module in this app is refused even if the secret ever leaked sideways.
 *
 * ## Where the identity comes from
 *
 * Not from this module. `POST /api/wholesale/login` verifies the buyer's
 * WordPress password through the storefront plugin's own customer endpoint and then
 * asks the wholesale plugin whether that email holds an ACTIVE account. Only then is
 * a token minted, with the account id the plugin returned.
 */

import { openToken, readBearerToken, signToken } from '@/lib/auth/sessionToken';
import type { WholesaleRole } from './types';

/** Default lifetime: 14 days. A buyer returns weekly; a shopper stays signed in for a month. */
const DEFAULT_TTL_HOURS = 24 * 14;

/** The shortest signing key accepted, so a placeholder cannot create forgeable sessions. */
const MIN_SECRET_LENGTH = 16;

export interface WholesaleSessionPayload {
  /** `hk_wholesale_accounts.id`. The only account reference a route will trust. */
  wid: number;
  email: string;
  company: string;
  role: WholesaleRole;
  iat: number;
  exp: number;
}

export interface WholesaleIdentity {
  accountId: number;
  email: string;
  company: string;
  role: WholesaleRole;
}

/**
 * The signing key, or null when the portal is not configured. A too-short value
 * counts as unconfigured rather than accepted.
 */
export function wholesaleSessionSecret(): string | null {
  const secret = (process.env.WHOLESALE_SESSION_SECRET || '').trim();
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** True when the wholesale portal can sign anyone in; every portal route fails closed without it. */
export function isWholesaleAuthConfigured(): boolean {
  return wholesaleSessionSecret() !== null;
}

/** Session lifetime in ms, from `WHOLESALE_SESSION_TTL_HOURS` (clamped). */
export function wholesaleSessionTtlMs(): number {
  const raw = Number(process.env.WHOLESALE_SESSION_TTL_HOURS || DEFAULT_TTL_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 && raw <= 24 * 365 ? raw : DEFAULT_TTL_HOURS;
  return Math.round(hours * 3_600_000);
}

/**
 * Mints a buyer's session. Only called after WordPress verified the password and
 * the plugin confirmed an ACTIVE account, so an id here is an approved buyer.
 */
export async function createWholesaleSession(identity: WholesaleIdentity): Promise<{
  token: string;
  payload: WholesaleSessionPayload;
}> {
  const secret = wholesaleSessionSecret();
  if (!secret) {
    throw new Error(
      'Wholesale sign-in is not configured: set WHOLESALE_SESSION_SECRET in the server environment.'
    );
  }

  const accountId = Number(identity.accountId);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error('A wholesale session needs a real wholesale account id.');
  }

  const issuedAt = Date.now();
  const payload: WholesaleSessionPayload = {
    wid: accountId,
    email: (identity.email || '').trim().toLowerCase(),
    company: (identity.company || '').trim(),
    role: identity.role === 'wholesale_customer' ? 'wholesale_customer' : 'wholesale_pending',
    iat: issuedAt,
    exp: issuedAt + wholesaleSessionTtlMs(),
  };

  return { token: await signToken(payload, secret), payload };
}

/**
 * Verifies a signed wholesale session. Null for anything that is not a currently
 * valid wholesale token: bad signature, malformed body, missing secret, expired, or
 * a token signed by another module (the `role` claim must be a wholesale role).
 */
export async function verifyWholesaleSessionToken(
  token: string
): Promise<WholesaleSessionPayload | null> {
  const secret = wholesaleSessionSecret();
  if (!secret) return null;

  const raw = await openToken(token, secret);
  if (!raw) return null;

  const payload = raw as unknown as WholesaleSessionPayload;
  if (payload.role !== 'wholesale_customer' && payload.role !== 'wholesale_pending') return null;
  if (!Number.isInteger(payload.wid) || payload.wid <= 0) return null;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  if (payload.exp <= Date.now()) return null;

  return payload;
}

export type WholesaleVerification =
  | { ok: true; buyer: WholesaleIdentity; payload: WholesaleSessionPayload }
  | { ok: false; status: number; error: string };

/**
 * The verified buyer behind a portal request.
 *
 * Only an ACTIVE buyer is admitted to the portal. A `wholesale_pending` token is
 * minted only for a buyer whose account is under review in the rare case the
 * owner flips an account back to pending mid-session; the portal then accepts the
 * identity but serves only the "under review" state, because a suspended account
 * must not keep reading tier prices it was approved for.
 */
export async function verifyWholesaleRequest(request: Request): Promise<WholesaleVerification> {
  if (!isWholesaleAuthConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'The wholesale portal is not configured on the server.',
    };
  }

  const token = readBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Sign in to your wholesale account to continue.' };
  }

  const payload = await verifyWholesaleSessionToken(token);
  if (!payload) {
    return { ok: false, status: 401, error: 'Your wholesale session has expired. Sign in again.' };
  }

  return {
    ok: true,
    buyer: {
      accountId: payload.wid,
      email: payload.email,
      company: payload.company,
      role: payload.role,
    },
    payload,
  };
}
