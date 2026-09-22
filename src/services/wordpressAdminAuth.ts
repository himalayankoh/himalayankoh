/**
 * LUXEDGE — WORDPRESS ADMIN AUTH CLIENT (browser)
 *
 * Replaces the Supabase auth client that used to live in `./supabase`. The admin
 * console signs in with a WordPress username + application password; the server
 * verifies that credential against the WordPress REST API and returns a signed
 * session token (`POST /api/auth/admin/login`, see `lib/auth/adminSession.ts`).
 * That token is what this module persists and hands to every admin write.
 *
 * SECURITY:
 *  - No password is ever stored. It is sent once, over HTTPS, to the login route
 *    and then discarded; only the signed token survives.
 *  - The token is a bearer identity with a bounded lifetime (`expiresAt`), not a
 *    secret container. It is validated on the server by signature, not by trust,
 *    so a tampered or forged token is rejected rather than believed.
 *  - The role is never invented here: `admin` only ever comes from a token the
 *    server signed after checking the WordPress administrator role.
 *  - There is no demo/fallback credential. When admin sign-in is not configured
 *    the login route answers 503 and this module surfaces that message.
 *
 * The storage key is kept from the Supabase era (`luxedge_sb_session`) because
 * the legacy zustand store reads it directly by name; renaming it would silently
 * break session restore there.
 */

/** Public shape of the signed-in admin, kept compatible with the old SbUser. */
export interface SbUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'buyer';
  /** The WordPress username this session was minted for. */
  username?: string;
}

export interface SbSession {
  /** The signed admin session token, sent as `Authorization: Bearer <token>`. */
  accessToken: string;
  /** Unused, kept so the stored shape matches what the legacy store reads. */
  refreshToken: string;
  /** Epoch ms. After this the session is over and the admin signs in again. */
  expiresAt: number;
  user: SbUser;
}

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

/** Legacy storage key — see the module header for why it was not renamed. */
export const SESSION_STORAGE_KEY = 'luxedge_sb_session';

/** How close to expiry a token may get before we consider it unusable. */
const EXPIRY_LEAD_MS = 60_000;

// ---------------------------------------------------------------------------
// Endpoint resolution
// ---------------------------------------------------------------------------

/**
 * The login route. Same-origin by default, which is how this app is deployed;
 * `NEXT_PUBLIC_ADMIN_AUTH_BASE` exists so a split deployment (storefront and
 * API on different hosts) can point at the API instead.
 */
function adminAuthBase(): string {
  const configured = (process.env.NEXT_PUBLIC_ADMIN_AUTH_BASE || '').trim();
  return configured.replace(/\/+$/, '');
}

export function adminLoginUrl(): string {
  return `${adminAuthBase()}/api/auth/admin/login`;
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export function readStoredSession(): SbSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<SbSession>;
    if (
      typeof session.accessToken === 'string' &&
      session.accessToken &&
      typeof session.expiresAt === 'number' &&
      session.user &&
      typeof session.user.id === 'string'
    ) {
      return session as SbSession;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A session is usable only while it is comfortably inside its lifetime. A signed
 * token cannot be renewed without the password, so there is nothing to do at the
 * boundary except stop using it — which is what keeps an expired token from being
 * stamped onto an admin write.
 */
function isSessionUsable(session: SbSession | null): session is SbSession {
  return Boolean(session && session.expiresAt - Date.now() > EXPIRY_LEAD_MS);
}

function writeStoredSession(session: SbSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage full or unavailable — the session simply won't survive a refresh */
  }
}

function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Synchronous read of the token, for stamping Authorization headers. */
export function getAccessToken(): string | null {
  const session = readStoredSession();
  return isSessionUsable(session) ? session.accessToken : null;
}

/** The currently known admin (from the stored session), without the token. */
export function getSessionUser(): SbUser | null {
  const session = readStoredSession();
  return isSessionUsable(session) ? session.user : null;
}

// ---------------------------------------------------------------------------
// Auth change events
// ---------------------------------------------------------------------------

type Listener = (event: AuthChangeEvent) => void;
const listeners = new Set<Listener>();

function emit(event: AuthChangeEvent): void {
  listeners.forEach((callback) => {
    try {
      callback(event);
    } catch {
      /* a broken listener must not break auth */
    }
  });
}

export function onAuthStateChange(callback: Listener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Is admin sign-in available? Always true in the browser: whether the deployment
 * is actually configured is a server fact, and the login route reports it
 * honestly (503 with a readable message) rather than this guessing at build time.
 */
export function isWordPressAdminAuthConfigured(): boolean {
  return typeof window !== 'undefined';
}

/**
 * @deprecated Supabase is gone from admin auth. Kept as an alias so the legacy
 * zustand store and older call sites keep compiling; use
 * `isWordPressAdminAuthConfigured`.
 */
export function isSupabaseConfigured(): boolean {
  return isWordPressAdminAuthConfigured();
}

interface AdminLoginResponse {
  token?: string;
  expiresAt?: number;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    name?: string;
  };
  error?: string;
}

/**
 * Sign in with a WordPress username + application password. Throws an honest
 * Error (`wrong username`, `not an administrator`, `not configured`) otherwise.
 */
export async function signInWithPassword(requestedUsername: string, password: string): Promise<SbSession> {
  const username = (requestedUsername || '').trim();
  if (!username || !password) {
    throw new Error('Enter your WordPress username and application password.');
  }

  let response: Response;
  try {
    response = await fetch(adminLoginUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the sign-in service. Check your connection and try again.');
  }

  let data: AdminLoginResponse = {};
  try {
    data = (await response.json()) as AdminLoginResponse;
  } catch {
    /* non-JSON body — fall through to the status-based message */
  }

  if (!response.ok || !data.token || !data.user) {
    throw new Error(
      data.error || `Sign-in failed (HTTP ${response.status}). Check your WordPress username and application password.`
    );
  }

  const session: SbSession = {
    accessToken: data.token,
    refreshToken: '',
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 3_600_000,
    user: {
      id: data.user.id || username,
      email: data.user.email || '',
      name: data.user.name || username,
      role: 'admin',
      username: data.user.username || username,
    },
  };

  writeStoredSession(session);
  emit('SIGNED_IN');
  return session;
}

/**
 * Admin accounts live in WordPress, so there is nothing to create here.
 * Kept exported (and honestly failing) so existing callers do not silently
 * succeed at nothing.
 */
export async function signUp(
  name: string,
  email: string,
  password: string
): Promise<{ session: SbSession | null }> {
  // Arguments are accepted only so the legacy store's call site keeps compiling;
  // nothing is created here.
  void name;
  void email;
  void password;
  throw new Error(
    'Admin accounts are created in WordPress, not here. Add the user in WordPress (Users → Add New) as an Administrator, then sign in with an application password.'
  );
}

/** Sign out: discard the local session. The token itself expires on its own. */
export async function signOut(): Promise<void> {
  clearStoredSession();
  emit('SIGNED_OUT');
}

/**
 * The current session, or null. A signed token cannot be refreshed — only the
 * server that holds the signing key can mint another, and that required the
 * password — so an (almost) expired session is discarded and the admin signs in
 * again. `force` is kept for call-site compatibility and has no extra effect.
 */
export async function getSession(force = false): Promise<SbSession | null> {
  void force;
  const session = readStoredSession();
  if (!session) return null;
  if (!isSessionUsable(session)) {
    clearStoredSession();
    emit('SIGNED_OUT');
    return null;
  }
  return session;
}

/**
 * A token that is still valid, for admin writes. Returns null when there is no
 * session (or it has expired) — callers should then send the admin to sign in
 * rather than writing with a credential the server will reject.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session ? session.accessToken : null;
}

/**
 * Admin password changes happen in WordPress. Reported honestly instead of
 * silently doing nothing.
 */
export async function updatePassword(): Promise<never> {
  throw new Error(
    'Passwords are managed in WordPress. Change yours under Users → Profile.'
  );
}

/**
 * Update the locally-remembered display name. The authoritative record is the
 * WordPress user, so this only affects this browser's session.
 */
export async function updateUserMetadata(patch: { name?: string }): Promise<void> {
  const session = readStoredSession();
  if (!session || !patch.name) return;
  writeStoredSession({ ...session, user: { ...session.user, name: patch.name } });
  emit('TOKEN_REFRESHED');
}
