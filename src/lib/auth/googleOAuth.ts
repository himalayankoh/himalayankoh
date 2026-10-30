import { adminSessionSecret } from './adminSession';
import { base64UrlDecode, base64UrlEncode, timingSafeEqual } from './sessionToken';

export const GOOGLE_OAUTH_COOKIE = '__Secure-hk-google-oauth';
export const GOOGLE_OAUTH_CALLBACK = '/api/admin/google-auth/callback';
export const GOOGLE_OAUTH_TTL_SECONDS = 600;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface GoogleOAuthTransaction {
  state: string;
  adminToken: string;
  origin: string;
  verifier: string;
  expiresAt: number;
}

export function googleOAuthOriginAllowed(origin: string): boolean {
  return ['https://himalayankoh.com', 'https://www.himalayankoh.com', 'https://preview.himalayankoh.com'].includes(origin);
}

async function encryptionKey() {
  const secret = adminSessionSecret();
  if (!secret) throw new Error('Admin authentication is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`hk-google-oauth:v1:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// The key stays in the Worker environment. Purpose binding prevents a stored
// refresh token from being accepted as an authorization transaction, or vice versa.
export async function sealGoogleOAuthValue(value: string, purpose: 'transaction' | 'refresh-token'): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`hk-google-oauth:v1:${purpose}`) },
    await encryptionKey(), encoder.encode(value),
  );
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`;
}

export async function openGoogleOAuthValue(value: string, purpose: 'transaction' | 'refresh-token'): Promise<string | null> {
  try {
    const [version, iv, ciphertext, extra] = value.split('.');
    if (version !== 'v1' || !iv || !ciphertext || extra) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64UrlDecode(iv)), additionalData: encoder.encode(`hk-google-oauth:v1:${purpose}`) },
      await encryptionKey(), new Uint8Array(base64UrlDecode(ciphertext)),
    );
    return decoder.decode(decrypted);
  } catch { return null; }
}

export async function createGoogleOAuthTransaction(adminToken: string, origin: string) {
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const transaction: GoogleOAuthTransaction = {
    state, verifier, adminToken, origin, expiresAt: Date.now() + GOOGLE_OAUTH_TTL_SECONDS * 1000,
  };
  const challenge = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  return { state, challenge, cookie: await sealGoogleOAuthValue(JSON.stringify(transaction), 'transaction') };
}

export async function validateGoogleOAuthTransaction(cookie: string, state: string, origin: string): Promise<GoogleOAuthTransaction | null> {
  if (!cookie || !state || !googleOAuthOriginAllowed(origin)) return null;
  const plaintext = await openGoogleOAuthValue(cookie, 'transaction');
  if (!plaintext) return null;
  try {
    const transaction = JSON.parse(plaintext) as GoogleOAuthTransaction;
    if (typeof transaction.state !== 'string' || !timingSafeEqual(transaction.state, state)) return null;
    if (transaction.origin !== origin || typeof transaction.expiresAt !== 'number' || !Number.isFinite(transaction.expiresAt) || transaction.expiresAt <= Date.now()) return null;
    if (typeof transaction.adminToken !== 'string' || !transaction.adminToken) return null;
    if (typeof transaction.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(transaction.verifier)) return null;
    return transaction;
  } catch { return null; }
}

export function googleOAuthCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: GOOGLE_OAUTH_CALLBACK, maxAge: GOOGLE_OAUTH_TTL_SECONDS };
}
