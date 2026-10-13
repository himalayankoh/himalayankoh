import { describe, expect, it } from 'vitest';
import { couponState, normaliseCouponCode, validateCoupon, type WooCouponLike } from './coupons';

/**
 * Coupon rules, without a store.
 *
 * `validateCoupon` is exported precisely so these can be proven without
 * credentials: a refusal that only exists inside a write path is a refusal nobody
 * can demonstrate.
 */

const base = { code: 'welcome10', discountType: 'percent' as const, amount: 10 };

function coupon(overrides: Partial<WooCouponLike> = {}): WooCouponLike {
  return {
    id: 1,
    code: 'welcome10',
    amount: '10.00',
    discount_type: 'percent',
    status: 'publish',
    ...overrides,
  };
}

describe('coupon codes', () => {
  it('normalises to the lowercase form WooCommerce stores', () => {
    expect(normaliseCouponCode('  WELCOME10  ')).toBe('welcome10');
  });
});

describe('validation', () => {
  it('accepts a plain percentage coupon', () => {
    expect(() => validateCoupon(base)).not.toThrow();
  });

  it('refuses a coupon with no code', () => {
    expect(() => validateCoupon({ ...base, code: '   ' })).toThrow(/needs a code/i);
  });

  it('refuses a code with characters a URL cannot carry', () => {
    expect(() => validateCoupon({ ...base, code: 'welcome 10%' })).toThrow(/letters, numbers/i);
  });

  it('refuses an amount of zero or less', () => {
    expect(() => validateCoupon({ ...base, amount: 0 })).toThrow(/greater than zero/i);
    expect(() => validateCoupon({ ...base, amount: -5 })).toThrow(/greater than zero/i);
  });

  it('refuses a percentage above 100, which would discount more than the cart', () => {
    expect(() => validateCoupon({ ...base, amount: 150 })).toThrow(/cannot exceed 100/i);
  });

  it('allows a fixed amount above 100, because that is a legitimate dollar value', () => {
    expect(() =>
      validateCoupon({ ...base, discountType: 'fixed_cart', amount: 150 })
    ).not.toThrow();
  });

  it('refuses a minimum higher than the maximum', () => {
    expect(() =>
      validateCoupon({ ...base, minimumAmount: 100, maximumAmount: 50 })
    ).toThrow(/minimum spend is higher/i);
  });

  it('refuses an expiry that is not a date', () => {
    expect(() => validateCoupon({ ...base, dateExpires: 'next tuesday' })).toThrow(/not a date|read as a date/i);
  });

  it('refuses fractional or zero usage limits', () => {
    expect(() => validateCoupon({ ...base, usageLimit: 0 })).toThrow(/whole number/i);
    expect(() => validateCoupon({ ...base, usageLimitPerUser: 2.5 })).toThrow(/whole number/i);
  });

  it('validates email restrictions', () => {
    expect(() =>
      validateCoupon({ ...base, emailRestrictions: ['user@example.com', 'vip@client.co'] })
    ).not.toThrow();
    expect(() =>
      validateCoupon({ ...base, emailRestrictions: ['not-an-email'] })
    ).toThrow(/not a valid email address/i);
  });
});

describe('state', () => {
  it('is active when published and not expired', () => {
    expect(couponState(coupon())).toBe('active');
  });

  it('is draft when the store has not published it', () => {
    expect(couponState(coupon({ status: 'draft' }))).toBe('draft');
  });

  it('is expired once the expiry has passed', () => {
    expect(couponState(coupon({ date_expires_gmt: '2021-08-31T00:00:00' }))).toBe('expired');
  });

  it('is active while the expiry is still in the future', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    expect(couponState(coupon({ date_expires_gmt: future }))).toBe('active');
  });

  it('is expired exactly at its expiry instant, never a moment later', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    expect(couponState(coupon({ date_expires_gmt: '2026-09-18T12:00:00' }), now)).toBe('expired');
  });
});
