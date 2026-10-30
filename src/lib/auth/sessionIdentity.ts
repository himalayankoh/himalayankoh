/**
 * "Who am I?" — asked of the server, answered by the token.
 *
 * The console must not decide its own permissions. This module is how the browser
 * learns its role: it sends whichever session token it holds to
 * `GET /api/auth/session`, and the server verifies the signature and answers with
 * the role that token carries. Nothing here reads an email address, and nothing
 * here can grant a role — the value returned is the server's, or it is absent.
 *
 * Three outcomes, and the caller must distinguish them:
 *
 *   { status: 'verified' }   — the server checked the token and this is the identity
 *   { status: 'rejected' }   — the server checked it and refused: tampered, expired,
 *                              or signed by a key this deployment no longer has
 *   { status: 'unreachable' } — the question could not be asked (offline, 5xx, a
 *                              non-JSON body). Caller keeps the stored session and
 *                              retries rather than signing a working admin out over
 *                              a transient network blip.
 *
 * A rejected answer is the only one that ends a session, and it is the only one that
 * can: "the server would not confirm this token" is exactly the case a client-side
 * check could never see.
 */

import { readStoredSession as readStoredAdminSession } from '../../services/wordpressAdminAuth';
import { readStoredCustomerSession } from './customerClient';

export type ServerIdentity =
  | {
      status: 'verified';
      role: 'admin' | 'customer';
      user: { id: string; email: string; name: string; username?: string };
    }
  | { status: 'rejected' }
  | { status: 'unreachable' };

interface SessionResponse {
  authenticated?: boolean;
  role?: string | null;
  user?: { id?: string | number; email?: string; name?: string; username?: string } | null;
}

/** Same-origin by default; `NEXT_PUBLIC_ADMIN_AUTH_BASE` for a split deployment. */
function authBase(): string {
  const configured = (process.env.NEXT_PUBLIC_ADMIN_AUTH_BASE || '').trim();
  return configured.replace(/\/+$/, '');
}

/**
 * The token to present: the admin one if this browser holds a usable admin session,
 * otherwise the customer one. Admin first because a browser holding both is an owner
 * who signed in to the console most recently, and the admin identity is the broader
 * one to answer with.
 */
function currentToken(): string | null {
  const admin = readStoredAdminSession();
  if (admin?.accessToken) return admin.accessToken;

  const customer = readStoredCustomerSession();
  if (customer?.accessToken) return customer.accessToken;

  return null;
}

export async function resolveServerIdentity(): Promise<ServerIdentity> {
  const token = currentToken();
  if (!token) return { status: 'rejected' };

  let response: Response;
  try {
    response = await fetch(`${authBase()}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return { status: 'unreachable' };
  }

  if (!response.ok) return { status: 'unreachable' };

  let data: SessionResponse;
  try {
    data = (await response.json()) as SessionResponse;
  } catch {
    return { status: 'unreachable' };
  }

  if (data.authenticated !== true) return { status: 'rejected' };
  if (data.role !== 'admin' && data.role !== 'customer') return { status: 'rejected' };

  const user = data.user || {};
  return {
    status: 'verified',
    role: data.role,
    user: {
      id: String(user.id ?? ''),
      email: user.email || '',
      name: user.name || '',
      ...(user.username ? { username: user.username } : {}),
    },
  };
}
