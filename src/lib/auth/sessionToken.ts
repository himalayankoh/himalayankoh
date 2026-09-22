/**
 * The parts of a signed session token that are not about *who* the session is for.
 *
 * Two identities are signed in this app — a WordPress administrator
 * (`adminSession.ts`) and a store customer (`customerSession.ts`). They must not be
 * able to impersonate each other, so each keeps its own payload shape, its own
 * claim checks and its own signing key. What they genuinely share is the encoding:
 * base64url framing, one HMAC-SHA256, and a length-independent comparison. That
 * lives here, once, so two security-relevant implementations cannot drift apart.
 *
 * Token shape: `base64url(payload) + '.' + base64url(HMAC-SHA256(payload))`.
 *
 * The payload is deliberately readable — it is a bearer identity, not a secret
 * container — and a caller must treat it as untrusted until both the signature and
 * the claims it cares about have been checked. `openToken` only does the first
 * half; the claims belong to the module that owns the payload.
 *
 * Uses Web Crypto, so the same code runs under Node and in the Cloudflare Workers
 * runtime this app also ships to.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Length-independent comparison — a signature check must not leak, through timing,
 * how many leading characters were right.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** base64url, without Buffer/btoa padding differences between runtimes. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeJson(value: unknown): string {
  return base64UrlEncode(textEncoder.encode(JSON.stringify(value)));
}

/** HMAC-SHA256 over `data`, base64url-encoded. */
export async function hmacSign(data: string, secret: string): Promise<string> {
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

/** Frame and sign a payload. The caller has already decided what belongs in it. */
export async function signToken(payload: object, secret: string): Promise<string> {
  const body = encodeJson(payload);
  return `${body}.${await hmacSign(body, secret)}`;
}

/**
 * The payload of a token whose signature checks out, or null for anything else:
 * a bad signature, a malformed frame, or a body that is not a JSON object.
 *
 * Claims are **not** validated here. The module that owns the payload must still
 * check the role and the expiry (and anything else it depends on) before trusting
 * a field — a valid signature only proves this app issued the token.
 */
export async function openToken(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let expected: string;
  try {
    expected = await hmacSign(body, secret);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, signature)) return null;

  try {
    const parsed: unknown = JSON.parse(textDecoder.decode(base64UrlDecode(body)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The Bearer credential on a request, or null. Accepts the `Bearer` prefix
 * case-insensitively because the console and `fetch` callers do not agree on
 * capitalisation.
 */
export function readBearerToken(request: Request): string | null {
  const header = (request.headers.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
