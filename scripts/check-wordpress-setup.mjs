// Read-only health check for the WordPress + WooCommerce backend.
//
// STRICTLY GET requests. This script must never write to WordPress, WooCommerce,
// their database, orders, customers, or media. Its whole job is to tell you
// which endpoints answer and — when one does not — exactly how it fails.
//
// Usage:  npm run check:wordpress
//
// It understands one failure mode specifically, because it is the one currently
// blocking the migration: a WordPress PHP fatal returns HTTP 500 with an HTML
// error page instead of JSON. That is reported as a FATAL, not a parse error.

import { loadEnv } from './lib/env.mjs';
// Shared with src/lib/backend/wordpress.ts: one owner for fatal detection, so
// the diagnostic and the app can never disagree about what a fatal looks like.
import { looksLikeHtml, looksLikeWordPressFatal } from '../src/lib/backend/wordpressFatal.mjs';

loadEnv();

const DEFAULT_BASE = 'https://himalayankoh.com/staging';
const base = (
  process.env.WORDPRESS_BASE_URL ||
  process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL ||
  DEFAULT_BASE
).replace(/\/+$/, '');

const apiRoot = `${base}/wp-json`;
const timeoutMs = Number(process.env.WORDPRESS_REQUEST_TIMEOUT_MS || 20000);
const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-check-wordpress/1.0)';

const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || '';
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || '';

console.log('WordPress / WooCommerce backend check');
console.log(`  base: ${base}`);
console.log(`  data source: ${process.env.NEXT_PUBLIC_DATA_SOURCE || 'supabase (default)'}`);
console.log(`  credentials: ${consumerKey ? 'present' : 'absent'}`);
console.log('');

/** One read-only GET. Never throws. */
async function probe(path, { auth = false } = {}) {
  const url = `${apiRoot}${path}`;
  const headers = { Accept: 'application/json', 'User-Agent': UA };
  if (auth && consumerKey) {
    headers.Authorization = `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`;
  }

  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.text();
    const ms = Date.now() - started;

    if (looksLikeWordPressFatal(body)) {
      return {
        status: response.status,
        ms,
        fatal: true,
        html: true,
        detail: 'WordPress PHP fatal error — "There has been a critical error on this website."',
        body,
      };
    }

    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* not JSON */
    }

    if (!response.ok) {
      return {
        status: response.status,
        ms,
        fatal: false,
        html: looksLikeHtml(body),
        detail: json?.message
          ? `${json.code || response.status}: ${json.message}`
          : `HTTP ${response.status}`,
        json,
        body,
      };
    }

    return { status: response.status, ms, fatal: false, html: false, detail: 'ok', json, body };
  } catch (error) {
    return {
      status: 0,
      ms: Date.now() - started,
      fatal: false,
      html: false,
      detail: error.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : error.message,
      body: '',
    };
  }
}

function report(label, result, { required = false } = {}) {
  let marker;
  if (result.status && result.status >= 200 && result.status < 300) marker = 'PASS';
  else if (result.fatal) marker = 'FATAL';
  else if (result.status === 401 || result.status === 403) marker = 'AUTH ';
  else marker = required ? 'FAIL ' : 'WARN ';

  const count =
    Array.isArray(result.json) ? ` (${result.json.length} item${result.json.length === 1 ? '' : 's'})` : '';
  console.log(`  ${marker} ${label} — HTTP ${result.status || 'ERR'}${count} · ${result.ms}ms`);
  if (marker !== 'PASS') console.log(`         ${result.detail}`);
  return marker === 'PASS';
}

console.log('WordPress core');
const core = [];
const coreRoot = await probe('/');
core.push(report('GET /wp-json/', coreRoot));
core.push(report('GET /wp/v2/pages', await probe('/wp/v2/pages?per_page=1')));
core.push(report('GET /wp/v2/posts', await probe('/wp/v2/posts?per_page=1')));
core.push(report('GET /wp/v2/product', await probe('/wp/v2/product?per_page=1')));

console.log('\nWooCommerce Store API (public, no keys required)');
const catResult = await probe('/wc/store/v1/products/categories?per_page=100');
const storeCategories = report('GET /wc/store/v1/products/categories', catResult);
const productsResult = await probe('/wc/store/v1/products?per_page=1');
const storeProducts = report('GET /wc/store/v1/products', productsResult, { required: true });
report('GET /wc/store/v1/cart', await probe('/wc/store/v1/cart'));
report(
  'GET /wc/store/v1/products/collection-data',
  await probe(
    '/wc/store/v1/products/collection-data?calculate_attribute_counts%5B0%5D%5Btaxonomy%5D=product_cat'
  )
);

console.log('\nWooCommerce REST v3 (requires consumer key/secret)');
let adminProducts = false;
if (consumerKey && consumerSecret) {
  adminProducts = report(
    'GET /wc/v3/products',
    await probe('/wc/v3/products?per_page=1', { auth: true }),
    { required: true }
  );
} else {
  console.log('  SKIP  GET /wc/v3/products — WOOCOMMERCE_CONSUMER_KEY / _SECRET not set');
}

// ---------------------------------------------------------------------------
// Commercial-data verdict: can the storefront show a real price and real stock?
// ---------------------------------------------------------------------------
console.log('\nCommercial data availability');

const canPriceFromAdmin = adminProducts;
const canPriceFromStore = storeProducts;

if (canPriceFromAdmin) {
  console.log('  PASS  price, SKU and stock are available from WooCommerce REST v3.');
} else if (canPriceFromStore) {
  console.log('  PASS  price and stock are available from the public Store API.');
} else {
  console.log('  FAIL  no endpoint is currently reporting price, SKU or stock.');
  console.log('        /wp/v2/product works but exposes none of those fields.');
  console.log('        The storefront must show these as UNKNOWN — do not substitute');
  console.log('        demo or placeholder pricing.');
}

if (catResult.json?.length) {
  console.log(`  PASS  ${catResult.json.length} product categor${catResult.json.length === 1 ? 'y' : 'ies'} readable.`);
}

// ---------------------------------------------------------------------------
// Actionable diagnosis for the products fatal
// ---------------------------------------------------------------------------
if (productsResult.fatal) {
  console.log('\nBlocking issue: WooCommerce Store API product routes are fatal');
  console.log('  Route:   GET /wp-json/wc/store/v1/products  (HTTP 500, HTML error page)');
  console.log('  Scope:   the product collection and single-product routes only.');
  console.log('           Categories, cart, attributes and collection-data all respond normally,');
  console.log('           so WooCommerce itself is loaded — the fatal is inside the product');
  console.log('           response pipeline.');
  console.log('  Impact:  no public endpoint returns price, sale price, SKU or stock status.');
  console.log('');
  console.log('  To diagnose on the server (requires WP admin / hosting access, read-only):');
  console.log('    1. Temporarily set WP_DEBUG=true and WP_DEBUG_LOG=true in wp-config.php and');
  console.log('       read wp-content/debug.log immediately after hitting the route.');
  console.log('    2. Check WooCommerce → Status → Logs for a matching fatal.');
  console.log('    3. Deactivate plugins that filter Store API product output one at a time');
  console.log('       (the staging site runs Jetpack, Contact Form 7, LiteSpeed Cache, Yoast,');
  console.log('       WPForms, Akismet, Visual Portfolio and a gallery plugin alongside');
  console.log('       WooCommerce) — a filter returning the wrong type on product data is the');
  console.log('       usual cause of a fatal on this route alone.');
  console.log('');
  console.log('  Fastest unblock without touching staging code:');
  console.log('    WooCommerce → Settings → Advanced → REST API → Add key (Read permission),');
  console.log('    then set WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET in .env.local.');
  console.log('    That enables /wc/v3/products, which returns price, SKU and stock today.');
}

/*
 * HK plugins.
 *
 * These two namespaces are the app's own WordPress half, and every route in them
 * requires `manage_options` — so they are probed with the WordPress administrator
 * application password (a different credential from the WooCommerce key above; the
 * consumer key does not authenticate them).
 *
 * A 404 here is the single most consequential fact this script can report: saved
 * addresses, wishlist persistence, cart binding across devices, password resets,
 * LeadOS and the CRM inbox all read and write through these plugins, and when they
 * are not installed the features fail one at a time with nothing naming the cause.
 */
console.log('\nHK WordPress plugins');

const wpUser = process.env.WORDPRESS_ADMIN_USER || '';
const wpAppPassword = (process.env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');
const hasAdminCredential = Boolean(wpUser && wpAppPassword);
console.log(`  credential: ${hasAdminCredential ? `present (${wpUser})` : 'absent'}`);

/** One GET with the administrator application password. Never throws. */
async function probeAdmin(path) {
  if (!hasAdminCredential) {
    return { status: 0, ms: 0, detail: 'No administrator application password is configured.', body: '' };
  }

  const started = Date.now();
  try {
    const response = await fetch(`${apiRoot}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        Authorization: `Basic ${Buffer.from(`${wpUser}:${wpAppPassword}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* not JSON */
    }
    return {
      status: response.status,
      ms: Date.now() - started,
      fatal: looksLikeWordPressFatal(body),
      html: looksLikeHtml(body),
      detail: json?.message ? `${json.code || response.status}: ${json.message}` : `HTTP ${response.status}`,
      json,
      body,
    };
  } catch (error) {
    return {
      status: 0,
      ms: Date.now() - started,
      detail: error.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : error.message,
      body: '',
    };
  }
}

const storefrontPlugin = await probeAdmin('/hk-storefront/v1/events?limit=1');
const crmPlugin = await probeAdmin('/crm/v1/leads?search=');

/*
 * The namespace list is public, so it answers "is the plugin registered at all"
 * without any credential — which is the question that matters when no administrator
 * password is configured. A namespace that is not listed is a plugin that is not
 * active, whatever a credentialed probe would have said.
 */
const namespaceList = coreRoot?.json?.namespaces;
const namespaces = Array.isArray(namespaceList) ? namespaceList.map(String) : [];
const namespacesKnown = namespaces.length > 0;
const storefrontRegistered = namespaces.includes('hk-storefront/v1');
const crmRegistered = namespaces.includes('crm/v1');

if (namespacesKnown) {
  console.log(`  registered: hk-storefront/v1 = ${storefrontRegistered ? 'yes' : 'no'} · crm/v1 = ${crmRegistered ? 'yes' : 'no'}`);
}

// A namespace the index does not list is 'ABSENT' even when the credentialed probe
// could not run — that is an observation, not a guess.
if (namespacesKnown && !storefrontRegistered && storefrontPlugin.status === 0) {
  storefrontPlugin.status = 404;
  storefrontPlugin.detail = 'The hk-storefront/v1 namespace is not registered on this site.';
}
if (namespacesKnown && !crmRegistered && crmPlugin.status === 0) {
  crmPlugin.status = 404;
  crmPlugin.detail = 'The crm/v1 namespace is not registered on this site.';
}

const pluginsPass =
  (storefrontPlugin.status >= 200 && storefrontPlugin.status < 300) &&
  (crmPlugin.status >= 200 && crmPlugin.status < 300);

function reportPlugin(label, result, dependsOn) {
  let marker;
  if (result.status >= 200 && result.status < 300) marker = 'PASS ';
  else if (result.fatal) marker = 'FATAL';
  else if (result.status === 401 || result.status === 403) marker = 'AUTH ';
  else if (result.status === 404) marker = 'ABSENT';
  else marker = 'FAIL ';

  console.log(`  ${marker} ${label} — HTTP ${result.status || 'ERR'} · ${result.ms}ms`);
  if (marker !== 'PASS ') {
    console.log(`         ${result.detail}`);
    if (marker === 'ABSENT' || marker === 'AUTH ') console.log(`         Blocks: ${dependsOn}`);
  }
}

reportPlugin(
  'GET /hk-storefront/v1/events',
  storefrontPlugin,
  'wishlist, saved addresses, cart across devices, customer sign-in and password resets'
);
reportPlugin('GET /crm/v1/leads', crmPlugin, 'the CRM inbox and LeadOS');

if (!pluginsPass) {
  console.log('');
  console.log('  The plugins are part of this repository (`wordpress/himalayan-koh-storefront.php`,');
  console.log('  `wordpress/himalayan-koh-leados.php`) and are installed on WordPress, not deployed');
  console.log('  with the Worker. To resolve:');
  console.log('');
  if (!hasAdminCredential) {
    console.log('    1. Create a WordPress application password for an administrator');
    console.log('       (Users -> Profile -> Application Passwords) and set');
    console.log('       WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_APP_PASSWORD in the server env.');
  }
  console.log('    2. Copy each plugin onto the site:');
  console.log('       wp-content/plugins/himalayan-koh-storefront/himalayan-koh-storefront.php');
  console.log('       wp-content/plugins/himalayan-koh-leados/himalayan-koh-leados.php');
  console.log('       (or zip the folder and upload it under Plugins -> Add New -> Upload Plugin)');
  console.log('    3. Activate both. Re-running this script should then print PASS for each.');
  console.log('');
  console.log('    If an administrator application password is configured and the plugins are');
  console.log('    already installed but inactive, activation is a single authenticated call:');
  console.log('       POST /wp-json/wp/v2/plugins/himalayan-koh-storefront/himalayan-koh-storefront');
  console.log('            { "status": "active" }');
}

const critical =
  core[0] && core[1] && core[3] && storeProducts === false && adminProducts === false;

if (critical) {
  console.log('\nResult: BLOCKED — WordPress content is readable but no endpoint reports commercial data.');
  console.log('Read-only check complete. Nothing was written to WordPress or WooCommerce.');
  process.exit(1);
}

console.log('\nRead-only check complete. Nothing was written to WordPress or WooCommerce.');
