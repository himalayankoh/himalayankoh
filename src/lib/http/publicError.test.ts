import { afterEach, describe, expect, it, vi } from 'vitest';

import { namesServerConfiguration, publicMessage } from './publicError';

describe('namesServerConfiguration', () => {
  it('recognises the variables this deployment actually configures', () => {
    for (const message of [
      'WordPress is not connected for the app: set WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD in the server environment (create the password under Users → Profile → Application Passwords).',
      'WordPress refused the app credential while reading saved addresses. Check WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD.',
      'Customer sign-in is not configured on this deployment: set CUSTOMER_SESSION_SECRET in the server environment.',
      'NEXT_PUBLIC_SITE_URL is empty.',
    ]) {
      expect(namesServerConfiguration(message)).toBe(true);
    }
  });

  it('leaves a sentence written for a shopper alone', () => {
    for (const message of [
      'Wrong email or password.',
      'Enter your email or username and your password.',
      'An account already exists for this email. Sign in instead.',
      // Names a plugin and a REST namespace — operator-ish, but not configuration, and
      // it is the honest explanation of why accounts are unavailable.
      'Customer accounts are not available yet: the Himalayan Koh storefront plugin is not active on WordPress (it provides hk-storefront/v1). Activate it, then try again.',
      'WordPress request timed out after 15000ms (/hk-storefront/v1/customer/login).',
      'Your wishlist could not be loaded right now.',
    ]) {
      expect(namesServerConfiguration(message)).toBe(false);
    }
  });
});

describe('publicMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a shopper-safe message unchanged and logs nothing', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(
      publicMessage({
        internal: 'Wrong email or password.',
        fallback: 'Customer sign-in is temporarily unavailable.',
        context: 'customer-auth',
      })
    ).toBe('Wrong email or password.');

    expect(logged).not.toHaveBeenCalled();
  });

  it('substitutes the fallback and logs the operator sentence instead', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const message = publicMessage({
      internal:
        'WordPress is not connected for the app: set WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD in the server environment.',
      fallback: 'Customer sign-in is temporarily unavailable.',
      context: 'customer-auth',
    });

    expect(message).toBe('Customer sign-in is temporarily unavailable.');
    // The point of the whole module: the variable names cannot reach a response body.
    expect(message).not.toMatch(/WORDPRESS_ADMIN/);
    // ...and they are not swallowed either — the diagnostic still exists, with the
    // surface it came from attached to it.
    expect(logged).toHaveBeenCalledTimes(1);
    const line = logged.mock.calls[0].join(' ');
    expect(line).toContain('customer-auth');
    expect(line).toContain('WORDPRESS_ADMIN_USER');
  });
});
