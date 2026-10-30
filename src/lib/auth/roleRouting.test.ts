import { describe, expect, it } from 'vitest';

import {
  ADMIN_HOME,
  CUSTOMER_HOME,
  LEGACY_ACCOUNT_REDIRECTS,
  homeForRole,
  isAdminPath,
  isCustomerPath,
  resolvePostLoginDestination,
} from './roleRouting';

describe('homeForRole', () => {
  it('sends admins to the console and everyone else to their account', () => {
    expect(homeForRole(true)).toBe(ADMIN_HOME);
    expect(homeForRole(false)).toBe(CUSTOMER_HOME);
  });
});

describe('isAdminPath', () => {
  it('matches the console and everything under it', () => {
    for (const path of ['/admin', '/admin/', '/admin/orders', '/admin/products/12']) {
      expect(isAdminPath(path)).toBe(true);
    }
  });

  it('does not match a hostname that merely starts with the word', () => {
    for (const path of ['/administrator', '/admin-panel', '/', '/account', '/', '']) {
      expect(isAdminPath(path)).toBe(false);
    }
    expect(isAdminPath(null)).toBe(false);
    expect(isAdminPath(undefined)).toBe(false);
  });
});

describe('isCustomerPath', () => {
  it('matches the account area and the order routes', () => {
    for (const path of ['/account', '/account/', '/orders', '/orders/abc', '/wishlist']) {
      expect(isCustomerPath(path)).toBe(true);
    }
  });

  it('does not match the console, the storefront or partial words', () => {
    for (const path of ['/admin', '/order', '/ordered', '/products', '/']) {
      expect(isCustomerPath(path)).toBe(false);
    }
  });
});

describe('resolvePostLoginDestination', () => {
  it('always sends an admin to the console', () => {
    // The reported bug: a real administrator signed in and landed on the
    // storefront because the old rule keyed off a demo email address.
    expect(resolvePostLoginDestination({ isAdmin: true })).toBe(ADMIN_HOME);
    expect(resolvePostLoginDestination({ isAdmin: true, from: '/' })).toBe(ADMIN_HOME);
    expect(resolvePostLoginDestination({ isAdmin: true, from: '/account' })).toBe(ADMIN_HOME);
    expect(resolvePostLoginDestination({ isAdmin: true, from: '/wishlist' })).toBe(ADMIN_HOME);
  });

  it('keeps an admin who was on their way into the console', () => {
    expect(resolvePostLoginDestination({ isAdmin: true, from: '/admin/products' })).toBe(
      '/admin/products',
    );
  });

  it('never sends a customer into the console', () => {
    expect(resolvePostLoginDestination({ isAdmin: false, from: '/admin' })).toBe(CUSTOMER_HOME);
    expect(resolvePostLoginDestination({ isAdmin: false, from: '/admin/orders' })).toBe(
      CUSTOMER_HOME,
    );
  });

  it('honours a customer or guest destination', () => {
    expect(resolvePostLoginDestination({ isAdmin: false, from: '/orders/abc' })).toBe('/orders/abc');
    expect(resolvePostLoginDestination({ isAdmin: false, from: '/checkout' })).toBe('/checkout');
    expect(resolvePostLoginDestination({ isAdmin: false, from: '/products?category=lamps-decor' })).toBe(
      '/products?category=lamps-decor',
    );
  });

  it('sends a customer with no destination to the account portal, not the shop front', () => {
    // The login page substitutes `/` when nothing sent them there, so `/` means
    // "no destination" — and the reported behaviour was a customer signing in
    // and landing on the homepage with no sign the sign-in had worked.
    expect(resolvePostLoginDestination({ isAdmin: false })).toBe(CUSTOMER_HOME);
    expect(resolvePostLoginDestination({ isAdmin: false, from: '' })).toBe(CUSTOMER_HOME);
    expect(resolvePostLoginDestination({ isAdmin: false, from: '/' })).toBe(CUSTOMER_HOME);
    expect(resolvePostLoginDestination({ isAdmin: false, from: 'admin' })).toBe(CUSTOMER_HOME);
  });
});

describe('LEGACY_ACCOUNT_REDIRECTS', () => {
  it('points every retired account route at a canonical one', () => {
    for (const { source, destination } of LEGACY_ACCOUNT_REDIRECTS) {
      expect(source.startsWith('/')).toBe(true);
      expect(destination === ADMIN_HOME || destination.startsWith(CUSTOMER_HOME)).toBe(true);
    }
  });

  it('never redirects a canonical route onto itself, which would loop', () => {
    const sources = new Set(LEGACY_ACCOUNT_REDIRECTS.map((r) => r.source));
    for (const { destination } of LEGACY_ACCOUNT_REDIRECTS) {
      const path = destination.split('?')[0];
      // `/orders` may redirect to `/account`, but nothing may redirect to a
      // path that is itself a redirect source.
      expect(sources.has(path) && path !== '/account').toBe(false);
    }
    expect(sources.has(CUSTOMER_HOME)).toBe(false);
    expect(sources.has(ADMIN_HOME)).toBe(false);
  });
});
