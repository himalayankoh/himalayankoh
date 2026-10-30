/**
 * One request path for `hk-storefront/v1`, the app's own WordPress namespace.
 *
 * Every module that talks to the plugin — site content, the Hermes evidence store —
 * shares one credential, one path prefix, one timeout and one failure mode. Five
 * modules each calling `wordpressRequest` with `requireWordPressCredentials()` would
 * be five places to get the error handling subtly different.
 *
 * ## Server-only
 *
 * An administrator application password is full site access, so nothing here may be
 * imported by a browser bundle. `scripts/check-client-supabase` fails a browser chunk
 * that contains `hk-storefront`, which gives that rule an owner other than discipline.
 */

import { WordPressApiError, wordpressRequest, type QueryValue } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { backendConfig } from '@/lib/backend/config';

const BASE = '/hk-storefront/v1';
const TIMEOUT_MS = 20_000;

/** The origin is not configured — surfaced rather than turned into a silent empty. */
function assertConfigured(): void {
  if (!backendConfig.wordpressApiRoot) {
    throw new WordPressApiError({
      message:
        'WordPress is not configured for this deployment (WORDPRESS_BASE_URL is empty), so the hk-storefront endpoints cannot be reached.',
      path: BASE,
      status: 0,
    });
  }
}

/** One request against the namespace, with the administrator credential. */
export async function storefrontRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    params?: Record<string, QueryValue>;
    body?: unknown;
  } = {},
): Promise<T> {
  assertConfigured();
  return wordpressRequest<T>(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    params: options.params,
    body: options.body,
    credentials: requireWordPressCredentials(),
    timeoutMs: TIMEOUT_MS,
  });
}
