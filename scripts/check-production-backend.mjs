#!/usr/bin/env node
/**
 * Point the existing backend checker at the *production* backend host.
 *
 *   node scripts/check-production-backend.mjs
 *   node scripts/check-production-backend.mjs --host https://some.other.host
 *
 * `scripts/check-wordpress-setup.mjs` already probes every endpoint the storefront
 * needs — `/wp-json/`, `/wp/v2/*`, the WooCommerce Store API, `/wc/v3/products`
 * with the consumer key, `/wc/v3/orders`, the administrator application password,
 * and the full HK plugin surface — and it already takes its target from
 * `WORDPRESS_BASE_URL`. Writing a second prober would mean two lists of endpoints
 * that drift apart, so this file does not probe anything: it resolves the target,
 * says what it is about to test, and runs that one.
 *
 * It exists because the production backend is a *different hostname* from the one a
 * developer's `.env.local` names, and "did anyone remember to check the production
 * backend through its own hostname" is exactly the question that goes unasked until
 * cutover night. Everything it runs is read-only.
 *
 * Before cutover, `PRODUCTION_BACKEND_ORIGIN` (`https://wp.himalayankoh.com`) does
 * not exist yet — the DNS record and the host alias are owner actions recorded in
 * `scripts/production-target.mjs`. Until they are done this script fails with a
 * connection error, which is the honest answer, and it is the check that proves the
 * backend is ready once they are.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_BACKEND_ORIGIN, PRODUCTION_SITE_ORIGIN } from './production-target.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const hostFlag = process.argv.indexOf('--host');
const target = (hostFlag > -1 ? process.argv[hostFlag + 1] : process.env.WORDPRESS_BASE_URL || PRODUCTION_BACKEND_ORIGIN)
  ?.trim()
  .replace(/\/+$/, '');

if (!target) {
  process.stderr.write('No backend host to check. Pass --host <url> or set WORDPRESS_BASE_URL.\n');
  process.exit(1);
}

try {
  new URL(target);
} catch {
  process.stderr.write(`Not a URL: ${target}\n`);
  process.exit(1);
}

if (target === PRODUCTION_SITE_ORIGIN) {
  process.stderr.write(
    `Refusing to check ${target}: that is the storefront's own public origin. The production backend must be a ` +
      `separate hostname (${PRODUCTION_BACKEND_ORIGIN}), or the deployed Worker would call itself for every ` +
      `product read once the apex moves to it.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Production backend check — target ${target}\n` +
    `Read-only. Nothing is written to WordPress, WooCommerce, orders, customers or media.\n\n`,
);

const result = spawnSync('node', ['scripts/check-wordpress-setup.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    WORDPRESS_BASE_URL: target,
    // The checker falls back to these only when WORDPRESS_BASE_URL is unset; blanking
    // them keeps a developer's staging value from being used if that ever changes.
    NEXT_PUBLIC_WORDPRESS_BASE_URL: target,
    NEXT_PUBLIC_WOOCOMMERCE_BASE_URL: target,
  },
  shell: true,
});

if (result.status !== 0) {
  process.stderr.write(
    `\nThe production backend did not answer every required endpoint (exit ${result.status}).\n` +
      `Until it does, a production Worker pointed at ${target} cannot serve a catalogue.\n`,
  );
}

process.exit(result.status ?? 1);
