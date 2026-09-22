/**
 * Admin session tokens — WordPress identity, signed locally.
 *
 * Replaces Supabase as the admin identity provider. The admin signs in once with
 * a WordPress username + application password; the login route verifies that
 * credential against the WordPress REST API (`/wp-json/wp/v2/users/me`) and then
 * mints the token this module produces. Every later admin request carries the
 * token as a Bearer credential and is verified here — offline, with one HMAC —
 * so no admin API route needs to reach WordPress (or any database) per request.
 *
 * Token shape: `base64url(payload) + '.' + base64url(HMAC-SHA256(payload))`.
 * The payload is deliberately readable (it is a bearer identity, not a secret
 * container) and carries nothing that was not already proven at sign-in:
 *
 *   { sub, username, email, name, role: 'admin', iat, exp }
 *
 * SECURITY:
 *  - The signing key (`ADMIN_SESSION_SECRET`) lives only in the server
 *    environment and is never sent to the browser. Without it, admin auth is
 *    "not configured" and every admin route fails closed rather than open.
 *  - The application password itself is never stored: it is used once, in the
 *    login route, and only the signed identity comes back.
 *  - Verification is constant-time and rejects an expired token even when the
 *    signature is valid.
 *
 * Uses Web Crypto so the same code runs in Node and in the Cloudflare Workers
 * runtime this app also ships to.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Default admin session lifetime: one working day. */
const DEFAULT_TTL_HOURS = 12;

/** The shortest signing key we accept, so a placeholder cannot be used by accident. */
const MIN_SECRET_LENGTH = 16;

export interface AdminSessionPayload {
  /** Stable identity for the session: the WordPress user id, or the username. */
  sub: string;
  username: string;
  email: string;
  name: string;
  role: 'admin';
  /** Issued-at, epoch ms. */
  iat: number;
  /** Expiry, epoch ms. */
  exp: number;
}

/** The identity a signed session is minted from. */
export interface AdminIdentity {
  id: string;
  username: string;
  email: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Base64url (no Buffer / btoa padding differences between runtimes)
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Length-independent comparison — a signature check must not leak, through
 * timing, how many leading characters were right.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * The signing key, or null when admin sign-in is not configured. A too-short
 * value is treated as unconfigured rather than accepted, so pasting a
 * placeholder does not silently create forgeable sessions.
 */
export function adminSessionSecret(): string | null {
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/**
 * True when admin authentication is configured. Every admin entry point checks
 * this first and fails closed, so a deployment missing the secret shows an
 * honest "not configured" state instead of trusting a token it cannot verify.
 */
export function isAdminAuthConfigured(): boolean {
  return adminSessionSecret() !== null;
}

/** Session lifetime in ms, from `ADMIN_SESSION_TTL_HOURS` (clamped, with a sane default). */
export function adminSessionTtlMs(): number {
  const raw = Number(process.env.ADMIN_SESSION_TTL_HOURS || DEFAULT_TTL_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 && raw <= 24 * 30 ? raw : DEFAULT_TTL_HOURS;
  return Math.round(hours * 3_600_000);
}

// ---------------------------------------------------------------------------
// Sign / verify
// ---------------------------------------------------------------------------

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Mint a signed admin session. Throws when `ADMIN_SESSION_SECRET` is missing —
 * the caller (the login route) turns that into a 503 rather than issuing a
 * token nothing could verify.
 */
export async function createAdminSession(
  identity: AdminIdentity
): Promise<{ token: string; payload: AdminSessionPayload }> {
  const secret = adminSessionSecret();
  if (!secret) {
    throw new Error('Admin sign-in is not configured: set ADMIN_SESSION_SECRET in the server environment.');
  }

  const issuedAt = Date.now();
  const payload: AdminSessionPayload = {
    sub: identity.id || identity.username,
    username: identity.username,
    email: identity.email,
    name: identity.name,
    role: 'admin',
    iat: issuedAt,
    exp: issuedAt + adminSessionTtlMs(),
  };

  const body = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmac(body, secret);
  return { token: `${body}.${signature}`, payload };
}

/**
 * Verify a signed admin session. Returns the payload, or null for anything that
 * is not a currently-valid admin token: a bad signature, a malformed body, a
 * missing secret, or an expired session.
 */
export async function verifyAdminSessionToken(token: string): Promise<AdminSessionPayload | null> {
  const secret = adminSessionSecret();
  if (!secret) return null;

  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let expected: string;
  try {
    expected = await hmac(body, secret);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, signature)) return null;

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(textDecoder.decode(base64UrlDecode(body))) as AdminSessionPayload;
  } catch {
    return null;
  }

  if (!payload || payload.role !== 'admin') return null;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  if (payload.exp <= Date.now()) return null;

  return payload;
}

/**
 * The Bearer credential on a request, or null. Accepts the `Bearer` prefix
 * case-insensitively because the admin console and `fetch` callers do not agree
 * on capitalisation.
 */
export function readBearerToken(request: Request): string | null {
  const header = (request.headers.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
