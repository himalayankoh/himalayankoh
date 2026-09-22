/**
 * WordPress application-password credentials — the only module that reads them.
 *
 * Separate from `./credentials` (WooCommerce consumer key/secret) for the same
 * structural reason that file is separate from `./config`: they authenticate
 * different things. A WooCommerce consumer key reads and writes commerce data
 * through the `wc/*` namespace and cannot authenticate WordPress core endpoints
 * at all — `lib/wordpress/content.ts` documents that 401. LeadOS and CRM writes
 * live in *our own* plugin namespace (`leados/v1`, `crm/v1`), which is guarded by
 * the `manage_options` capability, so they need a WordPress **administrator's
 * application password** instead.
 *
 * Server-only, never `NEXT_PUBLIC_`: an administrator application password is
 * full site access. It is used by server modules only, and a browser bundle
 * containing `WORDPRESS_ADMIN_APP_PASSWORD` is a bug with an owner.
 *
 * The password may be pasted with the spaces WordPress displays it with
 * ("abcd EFGH ijkl MNOP qrst UVWX"); they are cosmetic and are stripped here,
 * exactly as WordPress itself does.
 */

export interface WordPressCredentials {
  username: string;
  password: string;
}

/**
 * Pure, so "is WordPress connected for the app" can be answered and tested
 * without depending on the ambient environment. A half-set pair is a
 * misconfiguration, not a connection.
 */
export function credentialsForRequest(input: {
  username?: string;
  appPassword?: string;
}): WordPressCredentials | null {
  const username = (input.username || '').trim();
  const password = (input.appPassword || '').replace(/\s+/g, '');
  if (!username || !password) return null;
  return { username, password };
}

/** The configured WordPress administrator credentials, or null. */
export function wordpressCredentials(): WordPressCredentials | null {
  return credentialsForRequest({
    username: process.env.WORDPRESS_ADMIN_USER,
    appPassword: process.env.WORDPRESS_ADMIN_APP_PASSWORD,
  });
}

/** True when the app can authenticate to the WordPress admin API. */
export function hasWordPressCredentials(): boolean {
  return wordpressCredentials() !== null;
}

/**
 * The credentials, or a refusal that names the missing variable.
 *
 * LeadOS reads and writes must fail loudly rather than silently degrade: a lead
 * that appears saved but was never persisted is worse than an error, because the
 * owner acts on it.
 */
export function requireWordPressCredentials(): WordPressCredentials {
  const credentials = wordpressCredentials();
  if (!credentials) {
    throw new Error(
      'WordPress is not connected for the app: set WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD in the server environment (create the password under Users → Profile → Application Passwords).'
    );
  }
  return credentials;
}
