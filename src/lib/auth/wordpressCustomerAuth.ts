/**
 * WordPress/WooCommerce customer accounts — server only.
 *
 * ## Why the check happens in WordPress
 *
 * A shopper's account *is* their WooCommerce customer record, and a WooCommerce
 * customer *is* a WordPress user — so the password hash lives in WordPress, and
 * that is the only place it can be checked. WooCommerce offers no REST route for it:
 * the Store API has no sign-in at all, and REST v3 authenticates with consumer keys,
 * not shopper credentials. So `hk-storefront/v1/customer/login` (a route in our own
 * plugin) calls `wp_authenticate` and answers with the verified identity.
 *
 * ## Why this module carries an administrator credential
 *
 * That endpoint requires `manage_options`, like every route in the plugin, and the
 * app's server authenticates to it with a WordPress **administrator application
 * password**. The shopper's own password is passed *through* this module to
 * WordPress and is never stored, logged, or put in a token — only the identity that
 * comes back is used, and the session it produces is signed by the app
 * (`lib/auth/customerSession.ts`), not by WordPress.
 *
 * ## The honest failure when the plugin is missing
 *
 * `hk-storefront/v1` only exists while `himalayan-koh-storefront.php` is uploaded
 * and active. When it is not, WordPress answers `rest_no_route` and sign-in cannot
 * work at all — so that case is reported as its own message naming the plugin,
 * rather than as "wrong password", which would send a shopper to a password reset
 * that cannot help them.
 *
 * Server-only. Never `NEXT_PUBLIC_`.
 */

import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';

const NAMESPACE = '/hk-storefront/v1';
const TIMEOUT_MS = 15_000;

/** The verified customer, as the plugin reports it. */
export interface WordPressCustomer {
  /** The WooCommerce customer id — also the WordPress user id. */
  id: number;
  email: string;
  name: string;
  username: string;
  roles: string[];
}

export type CustomerAccountResult =
  | { ok: true; customer: WordPressCustomer }
  | { ok: false; status: number; error: string };

interface RawCustomerResponse {
  customer?: {
    id?: number | string;
    email?: string;
    name?: string;
    username?: string;
    roles?: string[];
  };
}

function toCustomer(raw: RawCustomerResponse['customer']): WordPressCustomer | null {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    email: String(raw?.email || '').trim().toLowerCase(),
    name: String(raw?.name || '').trim(),
    username: String(raw?.username || '').trim(),
    roles: Array.isArray(raw?.roles) ? raw.roles.map(String) : [],
  };
}

/**
 * WordPress's own error codes, mapped to the answer the browser should get.
 *
 * The plugin uses distinct codes for each refusal so this mapping is exhaustive
 * rather than a guess from the status alone — a 400 from `/customer/register`
 * could mean a bad email, a short password, or a duplicate account, and only one
 * of those is something the shopper can act on.
 */
const PLUGIN_ERRORS: Record<string, { status: number; error: string }> = {
  hk_storefront_invalid_credentials: { status: 401, error: 'Wrong email or password.' },
  hk_storefront_credentials_required: {
    status: 400,
    error: 'Enter your email or username and your password.',
  },
  hk_storefront_email_invalid: { status: 400, error: 'Enter a valid email address.' },
  hk_storefront_password_short: {
    status: 400,
    error: 'Choose a password of at least 8 characters.',
  },
  hk_storefront_email_taken: {
    status: 409,
    error: 'An account already exists for this email. Sign in instead.',
  },
  hk_storefront_no_woocommerce: {
    status: 503,
    error: 'WooCommerce is not active on the store, so customer accounts cannot be created.',
  },
  hk_storefront_customer_missing: { status: 404, error: 'That customer no longer exists.' },
};

/** The plugin's route namespace, e.g. for a setup check to probe. */
export function storefrontNamespace(): string {
  return NAMESPACE;
}

function describeFailure(error: unknown, verb: string): { status: number; error: string } {
  if (error instanceof WordPressApiError) {
    if (error.code && PLUGIN_ERRORS[error.code]) return PLUGIN_ERRORS[error.code];

    // The plugin is not active (or not uploaded). Its own message is worth more
    // than a generic one: this is the state of a fresh WordPress install, and the
    // fix is a one-line instruction.
    if (error.code === 'rest_no_route' || error.status === 404) {
      return {
        status: 503,
        error:
          'Customer accounts are not available yet: the Himalayan Koh storefront plugin is not active on WordPress (it provides hk-storefront/v1). Activate it, then try again.',
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        status: 502,
        error:
          'WordPress refused the app credential while checking the customer account. Check WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD.',
      };
    }
    if (error.status === 0) {
      // Timeout or transport failure — the origin, not the credential, is at fault.
      return { status: 503, error: error.message };
    }
    return { status: 502, error: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/WORDPRESS_ADMIN_(USER|APP_PASSWORD)/.test(message)) {
    return { status: 503, error: message };
  }
  return { status: 502, error: `Customer ${verb} failed: ${message}` };
}

/**
 * Verify a shopper's WordPress password and return their WooCommerce customer id.
 *
 * The login may be an email address or a username: `wp_authenticate` accepts either,
 * and a shopper is not expected to know which one their account uses.
 *
 * Never throws — every failure becomes an honest `{ ok: false }` carrying the HTTP
 * status the route should return.
 */
export async function verifyWordPressCustomerCredentials(
  login: string,
  password: string
): Promise<CustomerAccountResult> {
  const identifier = (login || '').trim();
  const secret = password || '';

  if (!identifier || !secret) {
    return { ok: false, status: 400, error: 'Enter your email or username and your password.' };
  }

  try {
    const raw = await wordpressRequest<RawCustomerResponse>(`${NAMESPACE}/customer/login`, {
      method: 'POST',
      body: { login: identifier, password: secret },
      credentials: requireWordPressCredentials(),
      timeoutMs: TIMEOUT_MS,
    });

    const customer = toCustomer(raw.customer);
    if (!customer) {
      return {
        ok: false,
        status: 502,
        error: 'WordPress verified the credential but returned no customer id.',
      };
    }
    return { ok: true, customer };
  } catch (error) {
    return { ok: false, ...describeFailure(error, 'sign-in') };
  }
}

/**
 * Create a customer account in WooCommerce.
 *
 * `wc_create_new_customer` (inside the plugin) is what actually creates the
 * WordPress user, the WooCommerce customer and the store's welcome email — none of
 * which is worth reimplementing here, and all of which would drift if it were.
 */
export async function createWordPressCustomer(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<CustomerAccountResult> {
  const email = (input.email || '').trim();
  if (!email) return { ok: false, status: 400, error: 'Enter your email address.' };

  try {
    const raw = await wordpressRequest<RawCustomerResponse>(`${NAMESPACE}/customer/register`, {
      method: 'POST',
      body: { email, password: input.password, name: input.name || '' },
      credentials: requireWordPressCredentials(),
      timeoutMs: TIMEOUT_MS,
    });

    const customer = toCustomer(raw.customer);
    if (!customer) {
      return {
        ok: false,
        status: 502,
        error: 'The account was created but WordPress returned no customer id.',
      };
    }
    return { ok: true, customer };
  } catch (error) {
    return { ok: false, ...describeFailure(error, 'account creation') };
  }
}
