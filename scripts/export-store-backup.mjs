/**
 * A read-only logical export of the store, for a moment like today's CVE alert.
 *
 * What this is for: before anybody patches WordPress or a plugin, the owner
 * should hold a copy of the *data* that only the store's database has —
 * products, variations, orders, customers, coupons, the pages and posts, the
 * media index. This writes that to `backups/<timestamp>/` as JSON.
 *
 * ## What this is NOT
 *
 * It is not a backup of the site, and it must never be mistaken for one. It
 * cannot fetch plugin, theme or core files (there is no REST endpoint for a
 * file, and no filesystem access here), and it cannot dump the MySQL database
 * — so the tables a plugin created, order meta that WooCommerce does not expose
 * over REST, and every binary in `wp-content/uploads/` are all absent. The
 * restorable backup is the host's: cPanel → Files → Backup, or Softaculous.
 * This is the safety net for the data you would otherwise retype.
 *
 * ## Read-only, deliberately
 *
 * Every call is a GET. Nothing here writes to the store, and it must stay that
 * way: a backup tool that mutates its subject is not a backup tool.
 *
 *   node scripts/export-store-backup.mjs                 # the configured install
 *   node scripts/export-store-backup.mjs --base https://himalayankoh.com
 *
 * The second form is for the *production* install, which needs its own
 * WooCommerce keys and WordPress application password in `.env.local`; if they
 * are not valid there the export records the error and writes nothing.
 *
 * ## The host's bot protection
 *
 * Namecheap/LiteSpeed answers a burst of unusual requests with a "One moment,
 * please…" interstitial, which is an HTML page, not JSON. This detects that,
 * stops immediately rather than hammering the origin, and says so — a partial
 * file that silently contains challenge pages instead of products would be
 * worse than no file at all.
 *
 * ## The output holds customer data
 *
 * Orders and customers carry names, e-mail addresses and shipping addresses.
 * `backups/` is gitignored so this cannot end up in a commit; keep it that way.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const envPath = path.join(ROOT, '.env.local');

/** The variables this needs, and nothing else — the same short allow-list idea
 * as `scripts/test-integration.mjs`, so a backup cannot start behaviour that
 * depends on the rest of the environment. */
const WANTED = [
  'WORDPRESS_BASE_URL',
  'NEXT_PUBLIC_WORDPRESS_BASE_URL',
  'WOOCOMMERCE_BASE_URL',
  'NEXT_PUBLIC_WOOCOMMERCE_BASE_URL',
  'WOOCOMMERCE_CONSUMER_KEY',
  'WOOCOMMERCE_CONSUMER_SECRET',
  'WORDPRESS_ADMIN_USER',
  'WORDPRESS_ADMIN_APP_PASSWORD',
];

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (!WANTED.includes(key)) continue;
    out[key] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnvFile(envPath), ...process.env };

const baseArgIndex = process.argv.indexOf('--base');
const BASE = (
  baseArgIndex > -1 ? process.argv[baseArgIndex + 1] : env.WORDPRESS_BASE_URL || env.NEXT_PUBLIC_WORDPRESS_BASE_URL
)
  .trim()
  .replace(/\/+$/, '');

if (!BASE) {
  console.error('No install to export: set WORDPRESS_BASE_URL in .env.local or pass --base <url>.');
  process.exit(2);
}

const wooAuth =
  env.WOOCOMMERCE_CONSUMER_KEY && env.WOOCOMMERCE_CONSUMER_SECRET
    ? 'Basic ' +
      Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64')
    : null;
const wpAuth =
  env.WORDPRESS_ADMIN_USER && env.WORDPRESS_ADMIN_APP_PASSWORD
    ? 'Basic ' +
      Buffer.from(
        `${env.WORDPRESS_ADMIN_USER.trim()}:${env.WORDPRESS_ADMIN_APP_PASSWORD.replace(/\s+/g, '')}`
      ).toString('base64')
    : null;

class Challenge extends Error {}
class Refused extends Error {}

function looksLikeChallenge(text) {
  return /One moment, please|cf-browser-verification|Checking your browser/i.test(text.slice(0, 4000));
}

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.append(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

async function getJson(url, auth) {
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  if (looksLikeChallenge(text)) {
    throw new Challenge(
      'The host answered with its bot-protection interstitial instead of JSON. Wait for it to clear (it is per-IP and usually minutes to an hour) and run this again.'
    );
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.code) detail += ` ${parsed.code}: ${String(parsed.message ?? '').slice(0, 160)}`;
    } catch {
      /* not JSON — the status is all we have */
    }
    throw new Refused(detail);
  }
  try {
    return { body: JSON.parse(text), headers: res.headers };
  } catch {
    throw new Refused(`HTTP ${res.status} but the body was not JSON.`);
  }
}

/** Every page of a collection, until the store says there is no more. */
async function collectAll(pathname, { auth, params = {}, perPage = 100, maxPages = 60 }) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${BASE}/wp-json${pathname}${query({ ...params, per_page: perPage, page })}`;
    const { body, headers } = await getJson(url, auth);
    if (!Array.isArray(body)) break;
    rows.push(...body);
    const totalPages = Number(headers.get('x-wp-totalpages') ?? 0);
    if (body.length < perPage) break;
    if (totalPages && page >= totalPages) break;
  }
  return rows;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(ROOT, 'backups', `${stamp}-store-export`);
fs.mkdirSync(outDir, { recursive: true });

const manifest = {
  export: 'Read-only logical export — not a substitute for a host (cPanel/Softaculous) backup.',
  source: BASE,
  exportedAt: new Date().toISOString(),
  wordpressVersion: null,
  collections: {},
  failures: [],
};

/** The install's version, from its own front page. Recorded because a logical
 * export taken around a security alert should say what was running. */
async function detectVersion() {
  for (const [url, pattern] of [
    [`${BASE}/`, /"generator"\s+content="WordPress\s+([0-9.]+)"/i],
    [`${BASE}/readme.html`, /Version\s+([0-9.]+)/i],
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      if (looksLikeChallenge(text)) throw new Challenge('bot-protection interstitial');
      const match = text.match(pattern);
      if (match) return match[1];
    } catch {
      /* try the next source; the version is a nice-to-have, not the export */
    }
  }
  return null;
}

async function exportOne(name, pathname, options) {
  try {
    const rows = await collectAll(pathname, options);
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows, null, 2));
    manifest.collections[name] = rows.length;
    console.log(`${name}: ${rows.length} row(s)`);
  } catch (error) {
    if (error instanceof Challenge) throw error;
    manifest.failures.push({ collection: name, error: error.message });
    console.log(`${name}: NOT EXPORTED — ${error.message}`);
  }
}

console.log(`Exporting from ${BASE} (read-only GETs) → backups/${path.basename(outDir)}/\n`);

try {
  manifest.wordpressVersion = await detectVersion();
  console.log(`WordPress version: ${manifest.wordpressVersion ?? 'could not be read'}\n`);

  await exportOne('woocommerce-products', '/wc/v3/products', { auth: wooAuth, params: { status: 'any' } });
  await exportOne('woocommerce-orders', '/wc/v3/orders', { auth: wooAuth });
  await exportOne('woocommerce-customers', '/wc/v3/customers', { auth: wooAuth });
  await exportOne('woocommerce-categories', '/wc/v3/products/categories', { auth: wooAuth });
  await exportOne('woocommerce-tags', '/wc/v3/products/tags', { auth: wooAuth });
  await exportOne('woocommerce-coupons', '/wc/v3/coupons', { auth: wooAuth });
  await exportOne('wordpress-pages', '/wp/v2/pages', { auth: wpAuth, params: { context: 'edit' } });
  await exportOne('wordpress-posts', '/wp/v2/posts', { auth: wpAuth, params: { context: 'edit' } });
  await exportOne('wordpress-media-index', '/wp/v2/media', { auth: wpAuth, params: { context: 'edit' } });
  await exportOne('wordpress-users', '/wp/v2/users', { auth: wpAuth, params: { context: 'edit' } });
  await exportOne('wordpress-plugins', '/wp/v2/plugins', { auth: wpAuth });
} catch (error) {
  if (!(error instanceof Challenge)) throw error;
  manifest.stopped = error.message;
}

const collected = Object.keys(manifest.collections).length;
const failed = manifest.failures.length;

// A folder with nothing in it is a record of the attempt, not a backup. Its name
// has to say so: `backups/…-store-export/` next to a real one would eventually be
// mistaken for a restorable copy of the store.
let finalDir = outDir;
if (collected === 0) {
  finalDir = `${outDir}-INCOMPLETE`;
  fs.renameSync(outDir, finalDir);
}
fs.writeFileSync(path.join(finalDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

if (manifest.stopped) console.error(`Stopped early: ${manifest.stopped}`);
if (collected > 0) {
  console.log(`\nManifest and files in backups/${path.basename(finalDir)}/`);
  console.log('Reminder: this is DATA only — plugin/core files, the database and uploads binaries are not in it.');
}
if (failed) {
  console.error(`\n${failed} collection(s) could not be read:`);
  for (const failure of manifest.failures) console.error(`  - ${failure.collection}: ${failure.error}`);
}

// The exit code is the part a person skimming the console will miss and a script
// will not: silence here is how somebody ends up believing a failed export was a
// backup.
if (collected === 0) {
  console.error(`\nNo store data was exported. Nothing usable is in backups/${path.basename(finalDir)}/.`);
  process.exit(3);
}
if (failed) {
  console.error('\nExported, but incomplete — do not treat this as the pre-update backup on its own.');
  process.exit(1);
}
console.log('\nExport complete.');
