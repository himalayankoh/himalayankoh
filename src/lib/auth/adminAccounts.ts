/**
 * Deployment-configured administrator logins — the same admins as before.
 *
 * Admin sign-in used to be Supabase Auth plus a hardcoded allowlist of admin
 * email addresses. Supabase is gone, and those passwords were only ever stored
 * as hashes in a database that is being retired, so they cannot be read back.
 * This module is where those same logins live now: the same addresses, the same
 * passwords, owned by the deployment instead of by a database.
 *
 * Configure one or more:
 *
 *   ADMIN_LOGIN_ACCOUNTS=8002salman@gmail.com:<sha256>,basco.pk@gmail.com:<sha256>
 *
 * Generate a hash with `npm run admin:hash -- "the password"`. Only the digest
 * is configured — the password itself is never written to an environment file,
 * never logged, and cannot be read back out of the deployment by anyone,
 * including us.
 *
 * This is a deliberate second door next to WordPress application passwords:
 * WordPress authentication (`./wordpressAdminAuth`) proves a real WordPress
 * administrator, while these accounts keep the owner's existing console login
 * working when WordPress is unreachable, mid-migration, or has no matching user.
 *
 * SECURITY:
 *  - SHA-256 digests in the environment, never plaintext passwords.
 *  - Every configured account is checked on every attempt, without an early
 *    exit, so response time does not reveal which identifier exists.
 *  - Comparison is constant-time on both halves.
 */

import { timingSafeEqual } from './adminSession';

const ENV_VAR = 'ADMIN_LOGIN_ACCOUNTS';

/** The shortest password the hash helper will accept, as a nudge against placeholders. */
export const MIN_ADMIN_PASSWORD_LENGTH = 8;

export interface AdminAccount {
  /** Lower-cased identifier the admin types: an email, or a WordPress-style login name. */
  identifier: string;
  /** Lower-cased SHA-256 hex digest of the password. */
  passwordHash: string;
}

/**
 * SHA-256 hex digest, via Web Crypto so Node and the Cloudflare Workers runtime
 * this app also ships to produce identical values.
 *
 * Plain SHA-256 rather than a slow KDF is a considered trade-off: this is a
 * server-side secret checked against a server-side digest, it never travels as a
 * password hash for a client to crack offline, and the login route is
 * rate-limited. A per-attempt KDF would only add latency to a value nobody
 * obtains.
 */
export async function hashAdminPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parses the configured accounts. Malformed entries are skipped rather than
 * guessed at — a typo must not silently become a working login, and it must not
 * take the well-formed entries down with it.
 */
export function listAdminAccounts(raw: string = process.env[ENV_VAR] || ''): AdminAccount[] {
  const accounts: AdminAccount[] = [];

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // lastIndexOf, so an identifier that itself contains a colon (a URI-style
    // login name) still splits at the hash.
    const separator = trimmed.lastIndexOf(':');
    if (separator <= 0) continue;

    const identifier = trimmed.slice(0, separator).trim().toLowerCase();
    const passwordHash = trimmed.slice(separator + 1).trim().toLowerCase();

    if (!identifier || !/^[0-9a-f]{64}$/.test(passwordHash)) continue;
    accounts.push({ identifier, passwordHash });
  }

  return accounts;
}

/** True when at least one deployment login exists. */
export function areAdminAccountsConfigured(): boolean {
  return listAdminAccounts().length > 0;
}

/** The configured identifiers, for diagnostics. Never includes a digest. */
export function adminAccountIdentifiers(): string[] {
  return listAdminAccounts().map((account) => account.identifier);
}

/**
 * Verifies an identifier + password. Returns the matched identifier, or null.
 *
 * Every account is compared on every attempt — no early return — so an attacker
 * cannot learn which identifiers exist from how long a rejection takes.
 */
export async function verifyAdminAccount(
  identifier: string,
  password: string
): Promise<string | null> {
  const accounts = listAdminAccounts();
  if (accounts.length === 0) return null;

  const wanted = (identifier || '').trim().toLowerCase();
  if (!wanted || !password) return null;

  const candidate = await hashAdminPassword(password);

  let matched: string | null = null;
  for (const account of accounts) {
    const identifierMatches = timingSafeEqual(account.identifier, wanted);
    const passwordMatches = timingSafeEqual(account.passwordHash, candidate);
    if (identifierMatches && passwordMatches) matched = account.identifier;
  }

  return matched;
}
