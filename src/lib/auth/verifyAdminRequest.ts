/**
 * Admin request verification — server only.
 *
 * This used to ask Supabase who the caller was and then read `profiles.role`,
 * which meant two network round trips per admin request and tied the admin
 * console to a database that is being retired.
 *
 * Now the caller presents the signed session token issued by
 * `POST /api/auth/admin/login`, and the check is a single local HMAC
 * verification (see `./adminSession`) — no database, no outbound request, and no
 * way for the console to keep working after `ADMIN_SESSION_SECRET` has gone.
 *
 * Fails closed: a missing secret, a missing/malformed token, a bad signature and
 * an expired token all deny, and the failure says which of the first two it was
 * so an owner can tell "not configured" from "wrong password".
 */

import {
  isAdminAuthConfigured,
  readBearerToken,
  verifyAdminSessionToken,
} from './adminSession';

export interface VerifiedAdmin {
  /** WordPress user id (or the username, for the break-glass credential). */
  userId: string;
  username: string;
  email: string;
  name: string;
}

export type VerifyAdminResult =
  | { ok: true; userId: string; admin: VerifiedAdmin }
  | { ok: false; status: number; error: string };

export async function verifyAdminRequest(request: Request): Promise<VerifyAdminResult> {
  if (!isAdminAuthConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Admin authentication is not configured on the server.',
    };
  }

  const token = readBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Admin authentication required.' };
  }

  const session = await verifyAdminSessionToken(token);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid or expired admin session. Sign in again.',
    };
  }

  return {
    ok: true,
    userId: session.sub,
    admin: {
      userId: session.sub,
      username: session.username,
      email: session.email,
      name: session.name,
    },
  };
}
