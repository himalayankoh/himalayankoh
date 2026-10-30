import { describe, expect, it } from 'vitest';

import { signupAbuseSignal, signupRefusal } from './signupGuard';

/**
 * The refusals are the point of this module, and so is what it lets through: a
 * guard that blocks a real customer's address is a worse failure than one that
 * misses a bot, so both halves are pinned here.
 */
describe('signupRefusal', () => {
  it('refuses an absent address', () => {
    expect(signupRefusal('')?.code).toBe('email_required');
    expect(signupRefusal('   ')?.code).toBe('email_required');
  });

  it('refuses an address longer than a mailbox can receive', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(signupRefusal(long)?.code).toBe('email_too_long');
  });

  it('refuses a malformed address', () => {
    for (const value of ['nobody', 'nobody@', '@example.com', 'no body@example.com', 'nobody@localhost']) {
      const refusal = signupRefusal(value);
      expect(refusal, value).not.toBeNull();
      expect(['email_shape', 'email_reserved'], value).toContain(refusal?.code);
    }
  });

  it('refuses the reserved testing domains the store’s junk records used', () => {
    expect(signupRefusal('a9f3aedfbbed4baf@example.com')?.code).toBe('email_reserved');
    expect(signupRefusal('someone@test.com')?.code).toBe('email_reserved');
  });

  it('refuses a disposable mailbox provider', () => {
    expect(signupRefusal('throwaway@mailinator.com')?.code).toBe('email_disposable');
    expect(signupRefusal('throwaway@yopmail.com')?.code).toBe('email_disposable');
  });

  it('accepts the addresses a real customer would use', () => {
    for (const value of [
      'ayaz.bashir@gmail.com',
      'darolyn@cypresstrails.net',
      'orders+retail@nateforutah.com',
      'J.Brenek@conroe-texas.com',
      'a1b2c3@hotmail.co.uk',
      // Machine-looking, and still a person's: this must NOT be refused.
      'a9f3aedfbbed4baf@gmail.com',
      'd3adb33f@gmail.com',
    ]) {
      expect(signupRefusal(value), value).toBeNull();
    }
  });

  it('normalises case and surrounding space before deciding', () => {
    expect(signupRefusal('  Orders@HimalayanKoh.com  ')).toBeNull();
    expect(signupRefusal('  X@Example.COM ')).not.toBeNull();
  });
});

describe('signupAbuseSignal', () => {
  it('flags the shape the store’s junk accounts had', () => {
    expect(signupAbuseSignal('a9f3aedfbbed4baf@gmail.com')).toBe('hex-run-local-part');
    expect(signupAbuseSignal('c6a1048840aa424a@gmail.com')).toBe('hex-run-local-part');
  });

  it('does not flag ordinary addresses, including short or word-like ones', () => {
    for (const value of [
      'ayaz.bashir@gmail.com',
      'darolyn@cypresstrails.net',
      'decade@example.org',
      'fade@example.org',
      'abc123@gmail.com',
      'himalayankoh2026@gmail.com',
    ]) {
      expect(signupAbuseSignal(value), value).toBeNull();
    }
  });

  it('flags a long vowel-less run with digits', () => {
    expect(signupAbuseSignal('xkcdmfgpvwzq4b@gmail.com')).toBe('consonant-digit-run');
  });
});
