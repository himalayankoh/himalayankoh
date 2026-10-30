#!/usr/bin/env node
/**
 * Take one listing off the storefront, or put it back, by SKU.
 *
 *   node scripts/set-listing-status.mjs --sku=HK-ESF-3lbs --status=draft          # dry run
 *   node scripts/set-listing-status.mjs --sku=HK-ESF-3lbs --status=draft --apply  # writes
 *   node scripts/set-listing-status.mjs --sku=HK-ESF-3lbs --status=publish --apply
 *
 * ## Why a guarded script rather than a one-off command
 *
 * The change is one field on one product, and the risk is not the write — it is every
 * other field that a careless write could take with it. A price, a stock quantity or a
 * SKU lost to an over-broad update is a commercial incident; a listing left visible when
 * the owner asked for it hidden is a factual one. So this script:
 *
 *   - resolves the record by SKU and **refuses if the SKU does not match exactly one
 *     product**, rather than acting on a search result;
 *   - prints the before-state and writes nothing unless `--apply` is passed;
 *   - sends **only** `{ status }` — a single-field patch, so price, stock, SKU, images,
 *     categories, attributes and description cannot be altered by it;
 *   - saves the before-state under `.git/` (private, never committed) so a reactivation
 *     is a recorded decision rather than a guess;
 *   - re-reads the record and asserts that the status changed while every other field
 *     it cares about is byte-identical, and reports if that is not so.
 *
 * `status=draft` hides the product from the storefront and stops it being purchasable
 * while keeping every field and the whole order history (`private` does the same and is
 * what this repo's own admin maps "inactive" to; `publish` reactivates). Nothing here
 * deletes a product, and nothing here touches orders.
 *
 * The catalogue read behind `/api/catalog`, `/products` and the sitemap filters on
 * `status: 'publish'` and caches for 60 seconds, so a status change reaches the live
 * storefront within that window. This script does not call the in-app purge; it prints
 * the wait instead, because purging needs a request scope the script does not have.
 */
import fs from 'node:fs';

const PREVIEW = process.argv.includes('--preview');
const APPLY = process.argv.includes('--apply');
const arg = (name) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const sku = (arg('sku') || '').trim();
const status = (arg('status') || '').trim();
const ALLOWED = ['draft', 'private', 'publish'];
const ENV_FILE = PREVIEW ? '.dev.vars' : '.env.local';
const ORIGIN = PREVIEW ? 'https://wp.himalayankoh.com/staging' : 'https://wp.himalayankoh.com';

if (!sku) throw new Error('Refusing to run without --sku=<SKU>.');
if (!ALLOWED.includes(status)) throw new Error(`--status must be one of ${ALLOWED.join(', ')}.`);
if (!fs.existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} not found; no credentials to read.`);

const env = Object.fromEntries(
  fs
    .readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => [
      line.slice(0, line.indexOf('=')),
      line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, ''),
    ])
);
const key = (env.WOOCOMMERCE_CONSUMER_KEY || '').trim();
const secret = (env.WOOCOMMERCE_CONSUMER_SECRET || '').trim();
if (!key || !secret) throw new Error(`${ENV_FILE} is missing the WooCommerce consumer key/secret pair.`);

const api = `${ORIGIN}/wp-json/wc/v3`;
const headers = {
  Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
  'Content-Type': 'application/json',
};

async function request(path, patch) {
  const response = await fetch(api + path, {
    headers,
    method: patch ? 'PUT' : 'GET',
    ...(patch ? { body: JSON.stringify(patch) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    throw new Error(`WooCommerce HTTP ${response.status} for ${path}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

/** The fields a status change must not disturb, captured as the thing to compare against. */
const watched = (record) => ({
  sku: record.sku ?? null,
  type: record.type ?? null,
  name: record.name ?? null,
  slug: record.slug ?? null,
  price: record.price ?? null,
  regular_price: record.regular_price ?? null,
  sale_price: record.sale_price ?? null,
  stock_status: record.stock_status ?? null,
  stock_quantity: record.stock_quantity ?? null,
  manage_stock: record.manage_stock ?? null,
  catalog_visibility: record.catalog_visibility ?? null,
  parent_id: record.parent_id ?? 0,
  image_count: (record.images || []).length,
});

const matches = await request(`/products?sku=${encodeURIComponent(sku)}`);
if (matches.length !== 1) {
  throw new Error(`Expected exactly one product for SKU ${sku}, found ${matches.length}. Refusing to write.`);
}

const before = matches[0];
const beforeWatched = watched(before);
console.log(
  JSON.stringify(
    {
      mode: APPLY ? 'apply' : 'dry run',
      origin: ORIGIN,
      target: { id: before.id, sku: before.sku, type: before.type, name: before.name },
      status: { from: before.status, to: status },
      preserved: beforeWatched,
    },
    null,
    2
  )
);

// No `process.exit()` anywhere below: on Node 24 under Git Bash, exiting a top-level-await
// ESM module that way trips a libuv assertion and reports 127 for a run that in fact
// succeeded, which would break any caller using `set -e` to check this script's result.
if (before.status !== status && APPLY) {
const backupFile = `.git/listing-status-${PREVIEW ? 'preview' : 'production'}-${sku}-${Date.now()}.json`;
fs.writeFileSync(
  backupFile,
  JSON.stringify({ origin: ORIGIN, sku, to: status, before: { id: before.id, status: before.status, ...beforeWatched } }, null, 2)
);

await request(`/products/${before.id}`, { status });

const after = await request(`/products/${before.id}`);
const afterWatched = watched(after);
const drifted = Object.keys(beforeWatched).filter(
  (field) => JSON.stringify(beforeWatched[field]) !== JSON.stringify(afterWatched[field])
);

console.log(
  JSON.stringify(
    {
      wrote: { id: after.id, sku: after.sku, field: 'status', from: before.status, to: after.status },
      backup: backupFile,
      unchanged: drifted.length === 0,
      driftedFields: drifted,
      storefront: `catalogue read cache is 60s; /api/catalog, /products and /products/${after.slug} follow within that window`,
    },
    null,
    2
  )
);

if (after.status !== status) throw new Error(`Status is "${after.status}" after the write, expected "${status}".`);
if (drifted.length) throw new Error(`Write changed unexpected fields: ${drifted.join(', ')}`);
} else if (before.status === status) {
  console.log(`\nSKU ${sku} is already "${status}". Nothing written.`);
} else {
  console.log('\nDry run only. Re-run with --apply to write this single field.');
}
