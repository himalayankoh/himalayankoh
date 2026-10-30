// Read-only diagnostic for the WooCommerce Store API product fatal.
//
// STRICTLY GET REQUESTS. This script must never write to WordPress, WooCommerce,
// their database, orders, customers or media. Its whole job is to take one failure
// — `GET /wc/store/v1/products` returning HTTP 500 — and narrow it down to the
// smallest number of competing explanations, then print the smallest WordPress-side
// change that would fix it.
//
// Usage:  npm run diagnose:store-products
//
// Why this exists next to `check:wordpress`: that script answers "is the backend
// healthy" and reports the products route as one FATAL among many. This one answers
// "what exactly is breaking, and what is the cheapest change that fixes it", so it
// distinguishes failure shapes that look identical from the outside — a bad product
// record, a broken query path, a broken per-product serializer, or a version
// mismatch:
//
//   Stage 1  the failure envelope under two Accept headers, and whether the app's
//            own detector agrees it is a fatal
//   Stage 2  scope: which routes in the namespace answer
//   Stage 3  query or response-building: sibling routes run the same product query,
//            so this separates "the query is broken" from "building a product is"
//   Stage 4  the decisive experiment — queries that are known to match no products
//            against queries that match products. The response builder only runs in
//            the second case, so this is what pins the trigger down
//   Stage 5  one request per product: if only some ids fail, the trigger is that
//            product's data, and the fix is a data fix
//   Stage 6  the environment (WooCommerce / WordPress / PHP versions and active
//            plugins) — the fatal is in the product pipeline, so the versions matter
//   Stage 7  the verdict and the change set that follows from the observed pattern
//
// Nothing here needs server access. The one thing it cannot do — read the PHP error
// log — is printed as the exact command to run, because that is what turns the
// verdict from "this component" into "this file, line N".
//
// Exit code: 0 when the product routes answer, 1 when they still fail, 2 when the
// host could not be reached — so it can gate a deploy step.

import { loadEnv } from './lib/env.mjs';
// Shared with src/lib/backend/wordpress.ts: one owner for fatal detection, so the
// diagnostic and the app can never disagree about what a fatal looks like.
import { looksLikeHtml, looksLikeWordPressFatal } from '../src/lib/backend/wordpressFatal.mjs';
// The inference, kept pure and tested; this file is the I/O and the reporting.
import { answers, summarize, verdict } from './lib/store-api-diagnosis.mjs';

loadEnv();

const DEFAULT_BASE = 'https://himalayankoh.com/staging';
const base = (
  process.env.WORDPRESS_BASE_URL ||
  process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL ||
  DEFAULT_BASE
).replace(/\/+$/, '');

const apiRoot = `${base}/wp-json`;
const timeoutMs = Number(process.env.WORDPRESS_REQUEST_TIMEOUT_MS || 20000);
const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-diagnose-store-products/1.0)';
const STORE = '/wc/store/v1';
const V3 = '/wc/v3';

const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || '';
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || '';
const hasKeys = Boolean(consumerKey && consumerSecret);

/* ------------------------------------------------------------------ */
/* Transport                                                          */
/* ------------------------------------------------------------------ */

const HEADERS_OF_INTEREST = ['server', 'content-type', 'x-litespeed-cache', 'x-litespeed-cache-control', 'cf-cache-status', 'age', 'cache-control', 'x-cache'];

/** One read-only GET. Never throws, never retries, never follows into a write. */
async function get(path, { auth = false, accept = 'application/json' } = {}) {
  const url = `${apiRoot}${path}`;
  const headers = { 'User-Agent': UA };
  if (accept) headers.Accept = accept;
  if (auth && hasKeys) {
    headers.Authorization = `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`;
  }

  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.text();
    const result = {
      path,
      status: response.status,
      ms: Date.now() - started,
      bytes: body.length,
      body,
      fatal: looksLikeWordPressFatal(body),
      html: looksLikeHtml(body),
      envelope: null,
      json: null,
      items: null,
      headers: {},
    };

    for (const name of HEADERS_OF_INTEREST) {
      const value = response.headers.get(name);
      if (value) result.headers[name] = value;
    }

    try {
      result.json = JSON.parse(body);
    } catch {
      /* not JSON */
    }
    if (Array.isArray(result.json)) result.items = result.json.length;
    if (result.json && typeof result.json === 'object' && !Array.isArray(result.json) && result.json.code) {
      result.envelope = `${result.json.code}: ${String(result.json.message || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)}`;
    }

    return result;
  } catch (error) {
    return {
      path,
      status: 0,
      ms: Date.now() - started,
      bytes: 0,
      body: '',
      fatal: false,
      html: false,
      envelope: null,
      json: null,
      items: null,
      headers: {},
      transport: error.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : error.message,
    };
  }
}

function line(result, label) {
  const mark = verdict(result);
  const count = result.items === null ? '' : ` ${result.items} item${result.items === 1 ? '' : 's'}`;
  const shape = result.fatal ? ` [${result.html ? 'HTML wp_die page' : 'JSON envelope'}]` : '';
  return `  ${mark.padEnd(11)} ${label.padEnd(54)} HTTP ${result.status || 'ERR'}${count}${shape} · ${result.ms}ms · ${result.bytes}B`;
}

function cacheNote(result) {
  const parts = Object.entries(result.headers)
    .filter(([name]) => name.includes('cache') || name === 'age' || name === 'server')
    .map(([name, value]) => `${name}=${value}`);
  return parts.length ? parts.join(' ') : '(no cache headers)';
}

async function probe(label, path, options) {
  const result = await get(path, options);
  if (process.env.HK_DIAGNOSE_VERBOSE) console.log(`  → GET ${path}`);
  console.log(line(result, label));
  return result;
}

/* ------------------------------------------------------------------ */
/* Stage 1 — the failure itself                                       */
/* ------------------------------------------------------------------ */

console.log('Store API product fatal — read-only diagnostic');
console.log(`  base:        ${base}`);
console.log(`  credentials: ${hasKeys ? 'present (WooCommerce REST v3 reads only)' : 'absent — the per-product matrix and the environment read will be skipped'}`);
console.log('  writes:      none. Every request below is a GET.');
console.log('');

console.log('Stage 1 — the failure, under the two Accept headers that change its shape');
const products = await probe('GET /wc/store/v1/products (Accept: application/json)', `${STORE}/products`);
const productsHtml = await probe('GET /wc/store/v1/products (no Accept — what a browser sends)', `${STORE}/products`, { accept: '' });
// Same request again, same headers, to show the failure is not intermittent.
const productsRepeat = await probe('GET /wc/store/v1/products (repeat — is it intermittent?)', `${STORE}/products`);

if (products.transport) {
  console.log(`\nThe host did not answer at all (${products.transport}). Nothing below can be trusted — check the origin and the path before reading further.`);
  process.exit(2);
}

if (products.fatal || productsHtml.fatal) {
  console.log('');
  console.log(`  both headers reach the same fatal: ${products.status} and ${productsHtml.status}, ${products.fatal && productsHtml.fatal ? 'detector fires on both' : 'detector fires on only one — fix the detector'}`);
  console.log(`  anonymous body:          ${products.html ? 'HTML wp_die page' : 'JSON envelope'} · ${products.envelope || '(no code/message pair)'}`);
  console.log(`  browser body:            ${productsHtml.html ? `HTML wp_die page "${(productsHtml.body.match(/<title>([^<]*)<\/title>/i) || [, '?'])[1]}"` : 'JSON envelope'}`);
  console.log(`  the same failure, negotiated: ${productsHtml.html && !products.html ? 'yes — WordPress only renders the JSON envelope when Accept asks for JSON' : 'see both bodies above'}`);
  console.log(`  identical body on a repeat of the same request: ${products.bytes === productsRepeat.bytes ? 'yes' : 'no'} (${products.bytes}B then ${productsRepeat.bytes}B)`);
  console.log(`  served through a cache: ${cacheNote(products)}`);
} else {
  console.log('\nThe products route did not return a fatal. Nothing to diagnose; the sections below still show what each route answers.');
}

/* ------------------------------------------------------------------ */
/* Stage 2 — scope within the namespace                               */
/* ------------------------------------------------------------------ */

console.log('\nStage 2 — scope: which routes answer');
const siblings = {
  categories: await probe('GET /wc/store/v1/products/categories', `${STORE}/products/categories?per_page=1`),
  attributes: await probe('GET /wc/store/v1/products/attributes', `${STORE}/products/attributes`),
  tags: await probe('GET /wc/store/v1/products/tags', `${STORE}/products/tags`),
  cart: await probe('GET /wc/store/v1/cart', `${STORE}/cart`),
};
const siblingsAnswering = Object.values(siblings).filter(answers).length;

/* ------------------------------------------------------------------ */
/* Stage 3 — is it the query, or building a product's response?       */
/* ------------------------------------------------------------------ */

console.log('\nStage 3 — sibling routes run the same product query, without building a product response');
const collectionData = await probe('GET /collection-data?calculate_price_range=true', `${STORE}/products/collection-data?calculate_price_range=true`);
const attributeCounts = await probe(
  'GET /collection-data?calculate_attribute_counts[product_cat]',
  `${STORE}/products/collection-data?calculate_attribute_counts%5B0%5D%5Btaxonomy%5D=product_cat`
);

/* ------------------------------------------------------------------ */
/* Stage 4 — empty result set vs a result set the builder must handle */
/* ------------------------------------------------------------------ */

console.log('\nStage 4 — the decisive experiment: match no products, then match one');
console.log('  An empty result set never reaches the per-product builder, so if the empty ones');
console.log('  answer 200 [] while every non-empty one fails, the failure is in that builder.');

// Read one real product id (and its slug) so the "exactly one product" probe is exact.
let realProduct = null;
if (hasKeys) {
  const sample = await get(`${V3}/products?per_page=1&status=publish&_fields=id,slug,name`, { auth: true });
  if (Array.isArray(sample.json) && sample.json[0]) {
    realProduct = sample.json[0];
    console.log(`  reference product: id ${realProduct.id} "${realProduct.name}" (slug ${realProduct.slug})`);
  } else {
    console.log(`  could not read a reference product from REST v3 (HTTP ${sample.status})`);
  }
}

const parameterProbes = [
  ['no parameters — the whole published catalogue', `${STORE}/products`],
  ['per_page=1', `${STORE}/products?per_page=1`],
  ['orderby=price', `${STORE}/products?per_page=1&orderby=price`],
  ['search=<a word from the reference product>', `${STORE}/products?per_page=1&search=${encodeURIComponent((realProduct?.name || 'salt').split(/\s+/)[0])}`],
  ['_fields=id — the item is built before fields are filtered', `${STORE}/products?per_page=1&_fields=id`],
  ...(realProduct ? [[`include=${realProduct.id} — exactly one product`, `${STORE}/products?include=${realProduct.id}`]] : []),
  ['include=99999999 — known to match nothing', `${STORE}/products?include=99999999`],
  ['per_page=2&page=99 — known to be past the end', `${STORE}/products?per_page=2&page=99`],
  ['min_price=0&max_price=0.01 — known to match nothing', `${STORE}/products?min_price=0&max_price=0.01`],
];

const parameterResults = [];
for (const [label, path] of parameterProbes) {
  parameterResults.push({ label, result: await probe(label, path) });
}

/* ------------------------------------------------------------------ */
/* Stage 5 — per-product matrix                                       */
/* ------------------------------------------------------------------ */

console.log('\nStage 5 — one request per product: if only some ids fail, the trigger is that product’s data');
const idResults = [];
if (hasKeys) {
  const catalogue = await get(`${V3}/products?per_page=100&status=publish&_fields=id,name,type`, { auth: true });
  if (Array.isArray(catalogue.json)) {
    console.log(`  catalogue: ${catalogue.json.length} published products read via REST v3`);
    const byType = {};
    for (const row of catalogue.json) byType[row.type] = (byType[row.type] || 0) + 1;
    console.log(`  types: ${Object.entries(byType).map(([type, count]) => `${type}×${count}`).join(', ')}`);

    for (const row of catalogue.json) {
      const result = await get(`${STORE}/products/${row.id}`);
      idResults.push({ id: row.id, type: row.type, result });
      console.log(line(result, `GET /wc/store/v1/products/${row.id} (${row.type})`));
    }
  } else {
    console.log(`  catalogue read failed (HTTP ${catalogue.status}${catalogue.envelope ? ' · ' + catalogue.envelope : ''}) — the per-product matrix needs REST v3 access`);
  }
} else {
  console.log('  skipped: without a consumer key/secret there is no read-only way to list the ids to try');
}

/* ------------------------------------------------------------------ */
/* Stage 6 — environment                                              */
/* ------------------------------------------------------------------ */

console.log('\nStage 6 — environment: the fatal is inside the product pipeline, so the versions are evidence');
const environment = { available: false };
if (hasKeys) {
  const status = await get(`${V3}/system_status`, { auth: true });
  if (status.status === 200 && status.json) {
    const s = status.json;
    environment.available = true;
    environment.woocommerce = s.environment?.version || '?';
    environment.wordpress = s.environment?.wp_version || '?';
    environment.php = s.environment?.php_version || '?';
    environment.mysql = s.environment?.mysql_version || '?';
    environment.theme = `${s.theme?.name || '?'} ${s.theme?.version || ''}`.trim();
    environment.plugins = (s.active_plugins || []).map((plugin) => ({
      file: plugin.plugin,
      name: plugin.name,
      version: plugin.version,
    }));

    console.log(`  WooCommerce  ${environment.woocommerce}`);
    console.log(`  WordPress    ${environment.wordpress}`);
    console.log(`  PHP          ${environment.php}`);
    console.log(`  MySQL        ${environment.mysql}`);
    console.log(`  theme        ${environment.theme}`);
    console.log(`  plugins      ${environment.plugins.length} active`);
  } else {
    console.log(`  GET /wc/v3/system_status → ${verdict(status)}${status.envelope ? ' · ' + status.envelope : ''}`);
  }
} else {
  console.log('  skipped: needs the consumer key/secret (read-only route)');
}

/* ------------------------------------------------------------------ */
/* Stage 7 — verdict                                                  */
/* ------------------------------------------------------------------ */

console.log('\nFindings');

const idProbes = idResults.map((row) => ({ id: row.id, type: row.type, ...row.result }));
const { pattern, findings } = summarize({
  products,
  productsHtml,
  siblings: { answering: siblingsAnswering, total: Object.keys(siblings).length },
  queryRoutesAnswer: [collectionData, attributeCounts].every(answers),
  parameterProbes: parameterResults.map((entry) => ({ label: entry.label, ...entry.result })),
  idProbes,
  environment,
});
for (const finding of findings) console.log(`  ${finding}`);
console.log(`\n  pattern: ${pattern}`);

/* ------------------------------------------------------------------ */
/* The change set                                                     */
/* ------------------------------------------------------------------ */

console.log('\nSmallest WordPress-side changes, in the order worth trying');
console.log('  (a change, not a guess: the first step is free and decides between the next two)');

if (pattern === 'healthy') {
  console.log('\n  Nothing to change — the product routes answered during this run.');
  console.log('  If they failed a moment ago the fix is already in effect; a cached error');
  console.log('  response can outlive a fix, so purge the page cache and re-run this.');
} else if (pattern === 'data-dependent') {
  console.log('\n  1. Fix the product records that fail, not the route.');
  console.log(`     These ids fail: ${idProbes.filter((probe) => probe.fatal).map((probe) => probe.id).join(', ')}`);
  console.log('     Compare one against a passing id (`GET /wc/v3/products/<id>`) and correct the');
  console.log('     field that differs. No plugin or version change is needed while other products answer.');
} else if (pattern === 'product-builder') {
  console.log('\n  1. Read the log — 60 seconds, no change, and it names the file and line.');
  console.log('     The 500 is a PHP fatal, so its message exists only in the error log. Make one');
  console.log('     request, then:');
  console.log('       wp-content/debug.log        (needs WP_DEBUG + WP_DEBUG_LOG in wp-config.php)');
  console.log('       or the host’s PHP error log for the same timestamp');
  console.log('       grep -n "PHP Fatal\\|Uncaught" wp-content/debug.log | tail');
  console.log('     This is step 1 because it decides between the two changes below instead of');
  console.log('     choosing for you: the fatal is either in WooCommerce’s own serialiser or in a');
  console.log('     filter a plugin hung on it, and those two look identical from outside.');
  console.log('\n  2. The change the log implies:');
  console.log('     · a path under wp-content/plugins/woocommerce/ … → update WooCommerce');
  console.log('       (wp-admin → Plugins, or `wp plugin update woocommerce`), take a database');
  console.log('       backup first, then re-run this script. Evidence that updating is the right');
  console.log('       change: the failure is inside the product response pipeline, every product of');
  console.log('       every type fails, no parameter changes it, the query and price aggregation');
  console.log('       work through sibling routes, and no other endpoint is affected.');
  if (environment.available) {
    console.log(`       Running now: WooCommerce ${environment.woocommerce} on WordPress ${environment.wordpress}.`);
    console.log('       A WooCommerce predating the WordPress release by a major version is a known');
    console.log('       source of exactly this shape of failure, and no other change can fix code');
    console.log('       inside WooCommerce.');
  }
  console.log('     · any other path → that plugin or theme is the cause. Update it; if that is not');
  console.log('       possible, deactivate that one only, and re-run this script.');
  console.log('\n  3. If the log is unavailable and a change must be made blind: update WooCommerce.');
  console.log('     It is the component that owns the failing code, and the change is reversible');
  console.log('     (restore the previous version plus its database backup) — unlike editing');
  console.log('     WooCommerce core, which the next update would silently overwrite.');
  if (environment.available) {
    console.log('\n  4. Do not start by deactivating plugins. There are 44 active here, so that is a');
    console.log('     long, order-affecting search. If the log does point at a plugin, these are the');
    console.log('     active ones that hook product output at all — a shortlist, not a priority order:');
    const suspects = environment.plugins.filter((entry) =>
      /woocommerce|woo-|ecommerce|product|shipping|store/i.test(`${entry.file} ${entry.name}`)
    );
    for (const plugin of suspects) console.log(`       - ${plugin.file}  v${plugin.version}`);
    console.log('     Also purge LiteSpeed/Redis caches after any change: a cached 500 outlives a fix.');
    console.log(`     PHP ${environment.php} is end-of-life; bumping it is a separate, planned change, not this one.`);
  }
  console.log('\n  5. Interim, with no server change at all: keep the catalog on REST v3.');
  console.log('     `/wc/v3/products` answers today — price, SKU, stock — and that is what the');
  console.log('     storefront already reads. Nothing in the app needs the Store API product routes');
  console.log('     while the cart is server-side. What stays blocked is anything that wants the');
  console.log('     browser to talk to WooCommerce directly for product data.');
} else {
  console.log(`\n  This failure reads as \`${pattern}\`, which this diagnostic does not reduce to one fix.`);
  console.log('  1. Read the log first — what matters is which path fails, and the log names it:');
  console.log('     is which path fails, and the log names it:');
  console.log('       wp-content/debug.log   (WP_DEBUG + WP_DEBUG_LOG), or the host’s PHP error log');
  console.log('  2. Re-run this script after each change; FATAL becoming PASS is the signal.');
}

console.log('\nWhat this cannot determine, and what would settle it');
console.log('  - The file and line of the fatal. WordPress returns only its generic error page, and');
console.log('    the message itself lives in wp-content/debug.log (or the host’s PHP error log) — one');
console.log('    request plus `grep -n "PHP Fatal"` answers it. This script deliberately needs no');
console.log('    server access, so it cannot read that log.');
console.log('  - Whether a cache is serving the 500. The cache headers above say whether the response');
console.log('    came through one; a cached error page survives a fix, so purge before retesting.');
console.log('  - Anything about methods other than GET: this script never writes, so it cannot test');
console.log('    whether a POST route fails for the same reason.');

const healthy = !products.fatal && !productsHtml.fatal;
console.log(
  `\nRead-only diagnostic complete. ${healthy ? 'The products route answered.' : 'The products route is still fatal.'} Nothing was written to WordPress or WooCommerce.`
);
process.exit(healthy ? 0 : 1);
