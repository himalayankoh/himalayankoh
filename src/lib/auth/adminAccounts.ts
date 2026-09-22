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
 * A third field is an optional display name for the console — what the header
 * and the account menu show. Without it the identifier is shown, so an
 * un-named account reads as its own email address rather than a made-up name:
 *
 *   ADMIN_LOGIN_ACCOUNTS=admin@himalayankoh.com:<sha256>:Salman Bashir
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
  /**
   * Optional display name for the console, exactly as configured. Absent when the
   * entry has no third field — callers then fall back to the identifier.
   */
  name?: string;
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

    // The digest is the anchor, because it is the only field with a fixed shape.
    // Locating it is what lets the identifier keep its own colons *and* leaves
    // room for the optional display name after it. Splitting at the last colon
    // (the previous rule) would read "Salman Bashir" as part of the digest.
    const fields = trimmed.split(':');
    const hashAt = lastHashField(fields);
    if (hashAt < 1) continue;

    const identifier = fields.slice(0, hashAt).join(':').trim().toLowerCase();
    const passwordHash = fields[hashAt].trim().toLowerCase();
    // A person's name: spaces and colons are kept, and so is its case.
    const name = fields.slice(hashAt + 1).join(':').trim();

    if (!identifier) continue;
    accounts.push(name ? { identifier, passwordHash, name } : { identifier, passwordHash });
  }

  return accounts;
}

/**
 * Index of the digest field: the *last* colon-separated field shaped like a
 * SHA-256 hex digest. Last, not first, so an identifier that is itself 64 hex
 * characters still parses; the digest precedes the optional name, never follows
 * it.
 */
function lastHashField(fields: string[]): number {
  for (let index = fields.length - 1; index >= 0; index -= 1) {
    if (/^[0-9a-f]{64}$/i.test(fields[index].trim())) return index;
  }
  return -1;
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
 * Verifies an identifier + password. Returns the matched account (identifier,
 * digest and any configured display name), or null. The whole account is
 * returned so a caller never has to look the identifier up a second time just to
 * learn the name configured beside it.
 *
 * Every account is compared on every attempt — no early return — so an attacker
 * cannot learn which identifiers exist from how long a rejection takes.
 */
export async function verifyAdminAccount(
  identifier: string,
  password: string
): Promise<AdminAccount | null> {
  const accounts = listAdminAccounts();
  if (accounts.length === 0) return null;

  const wanted = (identifier || '').trim().toLowerCase();
  if (!wanted || !password) return null;

  const candidate = await hashAdminPassword(password);

  let matched: AdminAccount | null = null;
  for (const account of accounts) {
    const identifierMatches = timingSafeEqual(account.identifier, wanted);
    const passwordMatches = timingSafeEqual(account.passwordHash, candidate);
    if (identifierMatches && passwordMatches) matched = account;
  }

  return matched;
}
