/**
 * WooCommerce REST v3 credentials — the only module that reads them.
 *
 * Split out of `./config` deliberately. `./config` is imported by client
 * components (they need the data-source flag and the public origin), and while
 * Next.js replaces a non-`NEXT_PUBLIC_` `process.env.X` with `undefined` in a
 * browser bundle — so no real secret ships — the *name* does: a client chunk
 * carrying `WOOCOMMERCE_CONSUMER_KEY` / `_SECRET` reads is a standing invitation
 * for the next component to read the source directly from the browser. Measured
 * on the built output, `/`, `/products` and `/products/[slug]` all loaded one
 * shared chunk containing those reads.
 *
 * So the rule is structural rather than documentary: credentials live here,
 * only server modules import this file, and a browser bundle containing
 * `WOOCOMMERCE_CONSUMER` is a bug with an owner.
 *
 * A consumer key/secret pair grants full store access (it can read customers
 * and orders, and write products), so it is never a `NEXT_PUBLIC_` variable and
 * never leaves the server.
 */

import { backendConfig, describeReadiness } from './config';

/** WooCommerce consumer credentials, as a pair. */
export interface WooCredentials {
  username: string;
  password: string;
}

/** The configured credentials, or null when the store is not connected for writes. */
export function wooCredentials(): WooCredentials | null {
  return credentialsForRequest({
    consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  });
}

/**
 * Pure, so "is the store connected" can be answered and tested without
 * depending on whatever the ambient environment happens to hold. A half-set
 * pair is not a connection — it is a misconfiguration, and treating it as
 * configured is what produces a 401 that looks like a permissions problem.
 */
export function credentialsForRequest(input: {
  consumerKey?: string;
  consumerSecret?: string;
}): WooCredentials | null {
  const username = (input.consumerKey || '').trim();
  const password = (input.consumerSecret || '').trim();
  if (!username || !password) return null;
  return { username, password };
}

/** True when WooCommerce REST credentials are present. */
export function hasWooCommerceCredentials(): boolean {
  return wooCredentials() !== null;
}

/**
 * The credentials, or a refusal that names the missing variable.
 *
 * Write paths must fail loudly rather than silently degrade: a product write
 * that quietly did nothing is worse than one that errors, because the owner
 * sees a saved product that does not exist.
 */
export function requireWooCredentials(): WooCredentials {
  const credentials = wooCredentials();
  if (!credentials) {
    throw new Error(
      'WooCommerce is not connected: set WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET in the server environment (staging).'
    );
  }
  return credentials;
}

/**
 * Why the running configuration can or cannot serve a full catalog.
 *
 * Lives here rather than in `./config` because it is the one caller that needs
 * the real credential values; `./config` keeps the pure rule so browser code
 * can import it without dragging a credential read along.
 */
export function describeBackendReadiness(): { ready: boolean; blockers: string[] } {
  const credentials = wooCredentials();
  return describeReadiness({
    wordpressApiRoot: backendConfig.wordpressApiRoot,
    consumerKey: credentials?.username ?? '',
    consumerSecret: credentials?.password ?? '',
  });
}
