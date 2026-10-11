/**
 * What a sign-up address has to be before an account is created for it.
 *
 * ## Why this is separate from the route
 *
 * The store's customer list grew to 2,704 accounts that no customer recognises —
 * names absent, addresses of the shape `<12 random hex characters>@gmail.com`,
 * and not one of them attached to an order. The census that established that is
 * in `docs/production/CUSTOMER-DATA-AUDIT-2026-10-11.md`; the mechanism was an
 * open registration form that accepted a bare address and generated the username
 * from it. This module is the app's own side of the fix.
 *
 * ## What it refuses, and what it deliberately does not
 *
 * It refuses what no customer can own: a placeholder or reserved domain
 * (`example.com`, `test.com`, `invalid`, `localhost`), a known disposable mailbox
 * provider, an address with no domain or no dot in it, and anything over the
 * length an address can legally be. Those are unambiguous.
 *
 * It does **not** refuse an address for looking machine-generated, even though
 * that is exactly what the junk accounts looked like. A real person can hold an
 * address that looks random, and refusing them is a worse failure than letting a
 * bot through a gate that is also rate limited. Those addresses are *reported*
 * instead — `signupAbuseSignal` — so the pattern is visible in the logs and can be
 * acted on with evidence rather than by guess.
 *
 * ## Pure, so both answers can be pinned in a test
 *
 * No environment, no network, no clock: the decision is a function of the string.
 */

/** Domains reserved for documentation and testing. IANA reserves these; no
 * customer owns one. The store's own junk records used `example.com`. */
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'test.org',
  'invalid',
  'localhost',
  'localdomain',
]);

/** Disposable mailbox providers. A short, conservative list: every entry is a
 * service whose whole purpose is a throwaway address, and a store that ships
 * physical goods cannot serve one. It is not a spam-score feed and is not meant
 * to grow into one. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'sharklasers.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
  'fakeinbox.com',
  'mailnesia.com',
]);

/** The shape of an address, kept deliberately plain: one `@`, a non-empty local
 * part, a domain with a dot and a two-or-more-letter tail. */
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export interface SignupRefusal {
  /** Stable machine-readable reason, for the log line and for tests. */
  code: 'email_required' | 'email_too_long' | 'email_shape' | 'email_reserved' | 'email_disposable';
  /** The sentence the shopper sees. It never names an internal detail. */
  message: string;
}

/**
 * Why this address cannot create an account, or `null` when it can.
 *
 * Ordered so the cheapest and most specific reason wins, and so the message a
 * shopper sees describes what to fix.
 */
export function signupRefusal(rawEmail: string): SignupRefusal | null {
  const email = String(rawEmail ?? '').trim().toLowerCase();

  if (!email) {
    return { code: 'email_required', message: 'Enter your email address.' };
  }
  // RFC 5321: 254 characters is the maximum an address can be delivered to.
  if (email.length > 254) {
    return { code: 'email_too_long', message: 'That email address is too long.' };
  }
  if (!ADDRESS_SHAPE.test(email)) {
    return { code: 'email_shape', message: 'Enter a valid email address, for example name@example.com.' };
  }

  const domain = email.slice(email.lastIndexOf('@') + 1);

  if (RESERVED_DOMAINS.has(domain)) {
    return {
      code: 'email_reserved',
      message: 'That email domain is reserved for testing, so it cannot be used for an account. Enter an address you can receive mail at.',
    };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      code: 'email_disposable',
      message: 'Disposable email addresses cannot be used for an account. Enter an address you can receive order updates at.',
    };
  }

  return null;
}

/**
 * A signal, not a decision: does this address look machine-generated?
 *
 * The junk accounts the store accumulated were all `<hex run>@<free provider>`
 * with no name attached. That is worth knowing about, and it is not enough to
 * refuse somebody over — so the route logs it and continues.
 */
export function signupAbuseSignal(email: string): string | null {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0) return null;
  const local = value.slice(0, at);

  // A long run of hex characters: `a9f3aedfbbed4baf`. Requires a digit, so a
  // real word spelled in hex letters alone ("decade", "fade") is not caught.
  if (/^[0-9a-f]{12,}$/.test(local) && /[0-9]/.test(local)) {
    return 'hex-run-local-part';
  }
  // A long run of consonants with digits and no vowel at all.
  if (local.length >= 14 && !/[aeiou]/.test(local) && /[0-9]/.test(local)) {
    return 'consonant-digit-run';
  }
  return null;
}
