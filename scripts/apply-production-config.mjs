#!/usr/bin/env node
/**
 * Turn the artifact `vinext build` just emitted into the production artifact.
 *
 * `vinext build` reads the one root config it knows about — `wrangler.jsonc`, the
 * staging file — and derives `dist/server/wrangler.json` from it. There is no build
 * flag for a second config, so the name and the public variables are applied to the
 * build output here, immediately after the build and immediately before the guard
 * reads it back. Nothing deploys without `assert-production-config.mjs` passing, so
 * "forgot to apply the overlay" cannot reach Cloudflare as a staging Worker.
 *
 * Only `name` and `vars` are touched. `main`, `assets`, `compatibility_date`,
 * `compatibility_flags`, `exports` and the rest belong to the build and are copied
 * through untouched — the overlay's job is the deployment's identity, not its shape.
 *
 * The variables are replaced wholesale rather than merged. A merge would leave a
 * staging variable in place and the guard would reject the result; replacing makes
 * the guard's "exactly these four" rule the thing that decides, which is the point.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionConfig, readProductionOverlay } from './assert-production-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'dist', 'server', 'wrangler.json');

if (!existsSync(CONFIG_PATH)) {
  process.stderr.write('dist/server/wrangler.json is missing — run the build before applying the production config.\n');
  process.exit(1);
}

const overlay = readProductionOverlay(ROOT);
const built = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const applied = {
  ...built,
  name: overlay.name,
  vars: { ...overlay.vars },
};

// Fail here rather than at deploy time: if the overlay does not produce a config the
// guard accepts, the problem is this script, and the message should say so.
assertProductionConfig(applied);

writeFileSync(CONFIG_PATH, `${JSON.stringify(applied, null, 2)}\n`, 'utf8');

process.stdout.write(
  `Production config applied to dist/server/wrangler.json: name=${applied.name}\n` +
    `  NEXT_PUBLIC_SITE_URL=${applied.vars.NEXT_PUBLIC_SITE_URL}\n` +
    `  NEXT_PUBLIC_WORDPRESS_BASE_URL=${applied.vars.NEXT_PUBLIC_WORDPRESS_BASE_URL}\n` +
    `  NEXT_PUBLIC_WOOCOMMERCE_BASE_URL=${applied.vars.NEXT_PUBLIC_WOOCOMMERCE_BASE_URL}\n` +
    `  STOREFRONT_ORDERS_PAUSED=${applied.vars.STOREFRONT_ORDERS_PAUSED} ` +
    `(the catalogue-only launch mode: the storefront serves products and refuses to write an order)\n` +
    `  routes: none (the apex stays on WordPress until the cutover is approved)\n`,
);
