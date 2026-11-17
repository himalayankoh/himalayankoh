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
    // The code is what lets the login page offer a resend for an unconfirmed
    // account instead of only printing the sentence.
    const failure = new Error(
      data.error || `That did not work (HTTP ${response.status}). Try again.`
    ) as Error & { code?: string };
    failure.code = (data as { code?: string }).code;
    throw failure;
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

/** What sign-up answers with: no session, and whether the mail went out. */
export interface CustomerRegistration {
  verificationRequired: boolean;
  email: string;
  verificationEmailSent: boolean;
}

/**
 * Create an account.
 *
 * The account is a WooCommerce customer, but it is **not** signed in: the address
 * is unconfirmed, and the sign-in route refuses it until the emailed link is
 * opened. So this returns a notice rather than a session.
 */
export async function createCustomerAccount(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<CustomerRegistration> {
  let response: Response;
  try {
    response = await fetch('/api/auth/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        name: input.name || '',
      }),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  let data: {
    verificationRequired?: boolean;
    email?: string;
    verificationEmailSent?: boolean;
    error?: string;
  } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    /* non-JSON body — fall through to the status-based message */
  }

  if (!response.ok) {
    throw new Error(data.error || `That did not work (HTTP ${response.status}). Try again.`);
  }

  return {
    verificationRequired: data.verificationRequired !== false,
    email: String(data.email || input.email),
    verificationEmailSent: data.verificationEmailSent !== false,
  };
}

/** Confirm an address with the `login` and `key` from the emailed link. */
export async function verifyCustomerEmail(login: string, key: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/auth/customer/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, key }),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the confirmation service. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'This confirmation link is invalid or has expired.');
  }
}

/**
 * Ask for a fresh confirmation link.
 *
 * The route answers one sentence whether or not the address is registered, so the
 * page shows that sentence rather than guessing. A 429 (cooldown, or the account's
 * daily cap) carries WordPress's own explanation.
 */
export async function requestVerificationEmail(login: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/auth/customer/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login }),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the confirmation service. Check your connection and try again.');
  }

  let data: { message?: string; error?: string } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    /* non-JSON body, fall through to the status-based message */
  }

  if (!response.ok) {
    throw new Error(data.error || `That did not work (HTTP ${response.status}). Try again.`);
  }

  return (
    data.message ||
    'If that account still needs confirming, we have sent a new link. Check your inbox and spam folder.'
  );
}

