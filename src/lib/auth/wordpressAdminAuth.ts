/**
 * WordPress REST API admin authentication — server only.
 *
 * This is where an admin's username + application password is turned into an
 * answer about their WordPress identity. It is the single source of truth for
 * "is this person a WordPress administrator?", and it runs only on the server,
 * in the login route — the credential is never persisted and never reaches
 * another module.
 *
 * Why an application password rather than a plugin-issued JWT: it is Core
 * WordPress (5.6+, no plugin to install or keep patched), and it authenticates
 * exactly the core REST endpoints the migration depends on — the same endpoints
 * `lib/wordpress/content.ts` already probes for drafts and media uploads. See
 * `docs/WORDPRESS-WOOCOMMERCE-MIGRATION.md`: a WooCommerce consumer key cannot
 * authenticate WordPress core, so it is a different credential by design.
 *
 * The endpoint used is `GET /wp-json/wp/v2/users/me?context=edit`, which returns
 * the authenticated user together with their `roles`. HTTPS is assumed; over
 * plain HTTP, WordPress refuses Basic auth outright.
 */

import { backendConfig } from '@/lib/backend/config';
import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';

/** The WordPress role that grants the admin console. */
const ADMIN_ROLE = 'administrator';

const WP_AUTH_TIMEOUT_MS = 12_000;

/** The fields we use from WordPress's own user object. */
interface RawWordPressUser {
  id?: number | string;
  name?: string;
  slug?: string;
  email?: string;
  roles?: string[];
}

export interface WordPressAdminUser {
  /** WordPress user id, as a string (kept string so it can be a session `sub`). */
  id: string;
  username: string;
  email: string;
  name: string;
  roles: string[];
}

export type WordPressAdminAuthResult =
  | { ok: true; user: WordPressAdminUser }
  | { ok: false; status: number; error: string };

/** True when a WordPress origin is configured, so the credential can be checked at all. */
export function isWordPressAuthConfigured(): boolean {
  return Boolean(backendConfig.wordpressApiRoot);
}

/**
 * Verify a WordPress username + application password and require the
 * administrator role.
 *
 * Never throws: every failure mode (wrong credential, non-admin account,
 * disabled application passwords, unreachable origin, PHP fatal) becomes an
 * honest `{ ok: false }` with the HTTP status the caller should return.
 */
export async function verifyWordPressAdminCredentials(
  username: string,
  applicationPassword: string
): Promise<WordPressAdminAuthResult> {
  const user = (username || '').trim();
  // Application passwords are shown in spaced groups ("abcd EFGH ijkl"). The
  // spaces are cosmetic; WordPress strips them, and so do we, so a pasted
  // password with or without them works.
  const password = (applicationPassword || '').replace(/\s+/g, '');

  if (!user || !password) {
    return { ok: false, status: 400, error: 'Enter your WordPress username and application password.' };
  }

  if (!isWordPressAuthConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'WordPress is not configured for this deployment (WORDPRESS_BASE_URL is empty), so admin sign-in cannot be verified.',
    };
  }

  try {
    const raw = await wordpressRequest<RawWordPressUser>('/wp/v2/users/me', {
      params: { context: 'edit' },
      credentials: { username: user, password },
      timeoutMs: WP_AUTH_TIMEOUT_MS,
      // An authentication check must never be served from a cache.
      method: 'GET',
    });

    const roles = Array.isArray(raw.roles) ? raw.roles.map((role) => String(role)) : [];
    if (!roles.some((role) => role.toLowerCase() === ADMIN_ROLE)) {
      return {
        ok: false,
        status: 403,
        error: `That WordPress account is not an administrator${
          roles.length ? ` (roles: ${roles.join(', ')})` : ''
        }.`,
      };
    }

    return {
      ok: true,
      user: {
        id: String(raw.id ?? ''),
        username: String(raw.slug || user),
        email: String(raw.email || ''),
        name: String(raw.name || raw.slug || user),
        roles,
      },
    };
  } catch (error) {
    const failure = describeWordPressAuthFailure(error);
    return { ok: false, status: failure.status, error: failure.error };
  }
}

/** Turns a WordPress failure into the status + message the login route should return. */
function describeWordPressAuthFailure(error: unknown): { status: number; error: string } {
  if (error instanceof WordPressApiError) {
    if (error.status === 401) {
      if (error.code === 'application_passwords_disabled') {
        return {
          status: 503,
          error:
            'Application passwords are switched off on the WordPress site, so this credential cannot be verified. Enable them under Users → Profile.',
        };
      }
      return { status: 401, error: 'Wrong WordPress username or application password.' };
    }
    if (error.status === 403) {
      return { status: 403, error: 'WordPress refused this credential for the administrator check.' };
    }
    if (error.status === 0) {
      // Timeout or a transport failure: the origin, not the credential, is the problem.
      return { status: 503, error: error.message };
    }
    return { status: 502, error: error.message };
  }
  return {
    status: 502,
    error: error instanceof Error ? error.message : 'Unable to verify the WordPress credential.',
  };
}

