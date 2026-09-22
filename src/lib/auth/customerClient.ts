/**
 * The browser's customer session — the shopper's half of the account migration.
 *
 * Same shape as the admin client (`services/wordpressAdminAuth.ts`): the password is
 * sent once to a route that verifies it in WordPress and is then discarded, and what
 * is kept is the signed session the app minted. Two stores, two keys, because a
 * customer session and an admin session are different credentials with different
 * lifetimes — and because one is allowed to see the console and the other is not.
 *
 * ## What the stored session is, and is not
 *
 * It carries the **WooCommerce customer id**, which is what per-account data is
 * keyed by: the wishlist `owner`, and the account's cart binding (`/api/cart`
 * re-saves the cart against it on every mutation). It is therefore the reason the
 * cart and the wishlist now follow the shopper to another device.
 *
 * It is a bearer identity with a bounded lifetime, validated on the server by
 * signature, so a tampered token is rejected rather than believed. No password is
 * ever stored, and there is no demo/fallback credential: when customer sign-in is
 * not configured the route answers 503 and this module surfaces that message.
 *
 * `hk_customer_session` is cleared by `lib/auth/browserSignOut.ts` along with the
 * admin and Supabase sessions — that module is the one owner of signing out.
 */

/** The storage key, named so it is obviously not the admin session. */
export const CUSTOMER_SESSION_STORAGE_KEY = 'hk_customer_session';

/** How close to expiry a token may get before we consider it unusable. */
const EXPIRY_LEAD_MS = 60_000;

export interface CustomerUser {
  /** WooCommerce customer id (== WordPress user id). */
  id: number;
  email: string;
  name: string;
  username?: string;
  role: 'customer';
}

export interface CustomerSession {
  accessToken: string;
  expiresAt: number;
  user: CustomerUser;
}

interface SessionResponse {
  token?: string;
  expiresAt?: number;
  customer?: { id?: number | string; email?: string; name?: string; username?: string };
  error?: string;
  cart?: { adopted?: boolean; merged?: number; error?: string | null };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function readStoredCustomerSession(): CustomerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<CustomerSession>;
    if (
      typeof session.accessToken === 'string' &&
      session.accessToken &&
      typeof session.expiresAt === 'number' &&
      session.user &&
      Number.isInteger(Number(session.user.id))
    ) {
      return session as CustomerSession;
    }
    return null;
  } catch {
    return null;
  }
}

/** A session is usable only while it is comfortably inside its lifetime. */
function isSessionUsable(session: CustomerSession | null): session is CustomerSession {
  return Boolean(session && session.expiresAt - Date.now() > EXPIRY_LEAD_MS);
}

function writeStoredSession(session: CustomerSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage full or unavailable — the session simply won't survive a refresh */
  }
}

/** Forgets this browser's customer session. The server token expires on its own. */
export function clearStoredCustomerSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The signed-in customer, or null when there is no usable session. */
export function getCustomerSession(): CustomerSession | null {
  const session = readStoredCustomerSession();
  return isSessionUsable(session) ? session : null;
}

/** The token for `Authorization: Bearer`, or null. */
export function getCustomerAccessToken(): string | null {
  return getCustomerSession()?.accessToken ?? null;
}

// ---------------------------------------------------------------------------
// Sign in / sign up
// ---------------------------------------------------------------------------

const NETWORK_ERROR = 'Could not reach the sign-in service. Check your connection and try again.';

async function postSession(path: string, body: Record<string, unknown>): Promise<CustomerSession> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      // The login route adopts the account's cart and answers with the cart cookie
      // this request should keep.
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  let data: SessionResponse = {};
  try {
    data = (await response.json()) as SessionResponse;
  } catch {
    /* non-JSON body — fall through to the status-based message */
  }

  const id = Number(data.customer?.id);
  if (!response.ok || !data.token || !Number.isInteger(id) || id <= 0) {
    throw new Error(
      data.error || `That did not work (HTTP ${response.status}). Try again.`
    );
  }

  const session: CustomerSession = {
    accessToken: data.token,
    expiresAt:
      typeof data.expiresAt === 'number' && data.expiresAt > Date.now()
        ? data.expiresAt
        : Date.now() + 3_600_000,
    user: {
      id,
      email: String(data.customer?.email || ''),
      name: String(data.customer?.name || ''),
      username: data.customer?.username ? String(data.customer.username) : undefined,
      role: 'customer',
    },
  };

  writeStoredSession(session);
  return session;
}

/**
 * Sign in with a WordPress/WooCommerce email (or username) and password.
 * Throws an honest Error — wrong password, unknown account, plugin not active,
 * sign-in not configured — rather than returning a pretend session.
 */
export function signInWithCustomerPassword(login: string, password: string): Promise<CustomerSession> {
  const identifier = (login || '').trim();
  if (!identifier || !password) {
    return Promise.reject(new Error('Enter your email and password.'));
  }
  return postSession('/api/auth/customer/login', { login: identifier, password });
}

/**
 * Create an account and sign in with it.
 *
 * The account is a WooCommerce customer and the session comes back in the same
 * shape as a sign-in, so a caller does not have two ways to become signed in.
 */
export function createCustomerAccount(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<CustomerSession> {
  return postSession('/api/auth/customer/register', {
    email: input.email,
    password: input.password,
    name: input.name || '',
  });
}
