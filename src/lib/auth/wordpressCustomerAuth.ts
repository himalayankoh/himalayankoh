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
import { publicMessage } from '@/lib/http/publicError';

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
  hk_storefront_current_password_invalid: {
    status: 401,
    error: 'That current password is not correct.',
  },
  hk_storefront_customer_mismatch: {
    status: 403,
    error: 'Those credentials do not belong to this account.',
  },
  hk_storefront_reset_key_invalid: {
    status: 400,
    error: 'This reset link is invalid or has expired. Request a new one.',
  },
  hk_storefront_reset_unavailable: {
    status: 400,
    error: 'Password resets are not available for this account.',
  },
  hk_storefront_origin_invalid: {
    status: 500,
    error: 'The storefront origin was missing, so the reset link could not be built.',
  },
};

/** The plugin's route namespace, e.g. for a setup check to probe. */
export function storefrontNamespace(): string {
  return NAMESPACE;
}

/**
 * What the shopper is told when the app cannot authenticate to WordPress itself.
 *
 * There is nothing here for them to do. The two failures that produce it — a missing
 * application-password variable, or a refused one — are the operator's to fix, and the
 * text a server module writes about them names the variables. That text goes to the
 * log, and this is what the browser gets; see `@/lib/http/publicError` for why the two
 * audiences are separated at all.
 *
 * The verb is carried through so the sentence is about the action that failed:
 * "Customer sign-in is temporarily unavailable" rather than a generic failure notice on
 * a password-reset screen.
 *
 * Exported because the sign-in and sign-up routes refuse for a second, unrelated reason —
 * this deployment has no session signing key — and a shopper must not be able to tell the
 * two apart, nor learn from either that a variable is unset. One sentence, one place.
 */
export function customerAccountsUnavailable(verb: string): string {
  return `Customer ${verb} is temporarily unavailable. Please try again in a few minutes, or email sales@himalayankoh.com and we will help you directly.`;
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
        error: publicMessage({
          internal:
            'WordPress refused the app credential while checking the customer account. Check WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD.',
          fallback: customerAccountsUnavailable(verb),
          context: 'customer-auth',
        }),
      };
    }
    if (error.status === 0) {
      // Timeout or transport failure — the origin, not the credential, is at fault.
      return { status: 503, error: error.message };
    }
    return { status: 502, error: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  // A missing credential never becomes a request, so `requireWordPressCredentials` is
  // the thrower here — and its message is the configuration note that must not be
  // forwarded. Anything else that merely mentions a variable by name is withheld too:
  // this is the one route a signed-out stranger can reach, and it is not the place to
  // learn the deployment's shape from.
  if (/WORDPRESS_ADMIN_(USER|APP_PASSWORD)/.test(message)) {
    return {
      status: 503,
      error: publicMessage({
        internal: message,
        fallback: customerAccountsUnavailable(verb),
        context: 'customer-auth',
      }),
    };
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

export type PasswordResetRequestResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Ask WordPress to email a customer a password-reset link.
 *
 * The token is WordPress's and stays there: the plugin calls
 * `get_password_reset_key()`, which keeps the verifiable half on the user and
 * returns only the half that belongs in a link. Nothing about it comes back here —
 * the app sends the request and WordPress sends the mail, so this app never holds
 * a credential that can reset anybody's password.
 *
 * `origin` is this deployment's storefront origin (see the plugin's
 * `hk_storefront_reset_origin`): the emailed link has to point at `/reset-password`
 * on the storefront, and WordPress cannot know that address on its own.
 *
 * Never throws — every failure becomes an honest `{ ok: false }`.
 */
export async function requestWordPressPasswordReset(
  login: string,
  origin: string
): Promise<PasswordResetRequestResult> {
  const identifier = (login || '').trim();
  if (!identifier) return { ok: false, status: 400, error: 'Enter the email address your account uses.' };

  try {
    await wordpressRequest<{ accepted?: boolean }>(`${NAMESPACE}/customer/request-password-reset`, {
      method: 'POST',
      body: { login: identifier, origin },
      credentials: requireWordPressCredentials(),
      timeoutMs: TIMEOUT_MS,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, ...describeFailure(error, 'password reset') };
  }
}

/**
 * Set a customer's new password with the key WordPress mailed them.
 *
 * The plugin validates the key with `check_password_reset_key()` and writes the
 * password with `reset_password()`, which is also what sends WordPress's own
 * "your password changed" notice — so the customer hears about the change from the
 * system that made it.
 */
export async function resetWordPressCustomerPassword(input: {
  login: string;
  key: string;
  password: string;
}): Promise<CustomerAccountResult> {
  const login = (input.login || '').trim();
  const key = (input.key || '').trim();

  if (!login || !key) {
    return {
      ok: false,
      status: 400,
      error: 'This reset link is invalid or has expired. Request a new one.',
    };
  }

  try {
    const raw = await wordpressRequest<RawCustomerResponse>(`${NAMESPACE}/customer/reset-password`, {
      method: 'POST',
      body: { login, key, password: input.password },
      credentials: requireWordPressCredentials(),
      timeoutMs: TIMEOUT_MS,
    });

    const customer = toCustomer(raw.customer);
    if (!customer) {
      return {
        ok: false,
        status: 502,
        error: 'The password was changed but WordPress returned no customer id.',
      };
    }
    return { ok: true, customer };
  } catch (error) {
    return { ok: false, ...describeFailure(error, 'password reset') };
  }
}

/**
 * Change a signed-in customer's password, re-checking the current one in WordPress.
 *
 * Both halves belong to WordPress: `wp_authenticate` proves the old password and
 * `wp_set_password` writes the new one, so the new password never travels through a
 * second auth system. The account portal used to do this with Supabase
 * (`signInWithPassword`, then `updateUser`), which stopped working when sign-in
 * moved to WordPress.
 *
 * `customerId` is passed so the plugin can refuse a credential that belongs to a
 * different account than the session did — knowing a password must not be a way to
 * change that account's password from here.
 */
export type PasswordChangeResult = { ok: true } | { ok: false; status: number; error: string };

export async function changeWordPressCustomerPassword(input: {
  customerId: number;
  login: string;
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeResult> {
  try {
    await wordpressRequest<RawCustomerResponse>(
      `${NAMESPACE}/customer/change-password`,
      {
        method: 'POST',
        body: {
          customerId: input.customerId,
          login: input.login,
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
        },
        credentials: requireWordPressCredentials(),
        timeoutMs: TIMEOUT_MS,
      }
    );

    return { ok: true };
  } catch (error) {
    return { ok: false, ...describeFailure(error, 'password change') };
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
