/**
 * How much of this app still runs on Supabase, and how much has moved.
 *
 * The migration answer, measured instead of remembered — the previous inventory
 * in `docs/WORDPRESS-WOOCOMMERCE-MIGRATION.md` §2.1 was a snapshot, and snapshots
 * go stale the moment work lands. Everything here is derived from the source at
 * run time except the feature table at the bottom, which is the one part a human
 * has to keep honest (and says so).
 *
 * ## Three questions, three answers, never one number
 *
 * "How much Supabase is left?" has three different answers with three different
 * fixes, and adding them together produces a figure nobody can act on:
 *
 *   BROWSER  which *pages* download the SDK or the project config. The only
 *            customer-visible cost, and the only one measurable from outside.
 *   SERVER   which modules the app actually runs server-side. Real work: each
 *            needs a WordPress endpoint before it can move.
 *   TYPES    modules importing `database.types` only. Erased at compile, so they
 *            cost nothing at run time and disappear with the type file itself.
 *
 * Counted as one, a type-only import looks like a runtime dependency and the
 * migration looks twice as large as it is.
 *
 * Read-only: no network, no database, no build. Run it after any migration change.
 *
 *   node scripts/audit-supabase-remaining.mjs
 *   node scripts/audit-supabase-remaining.mjs --tables   # every table, with files
 *
 * The BROWSER section reads the report `npm run check:client-supabase` writes, so
 * those numbers are measured rather than typed. Run that first (it needs a build
 * and a running server) for a complete answer; without it this script says so
 * instead of quoting a stale figure.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC = path.join(root, 'src');
const showAllTables = process.argv.includes('--tables');

/**
 * A module names Supabase when it imports one of its modules or the SDK — and,
 * per the migration's acceptance rule, also when it builds a raw Supabase URL by
 * hand and fetches it. The hand-rolled PostgREST client this repository used to
 * carry imported nothing from the SDK and would have read as "no dependency" in
 * a scan that only counted imports.
 */
const SUPABASE_IMPORT = /from\s+['"][^'"]*supabase[^'"]*['"]|\/rest\/v1\/|\/storage\/v1\/|@supabase\/supabase-js/;

/**
 * The schema-shaped type module, if one is ever brought back.
 *
 * `src/lib/commerce/types.ts` is deliberately NOT it: those shapes are written by
 * hand now, because they are the model the application works in rather than a
 * transcription of a database it no longer has. This pattern exists so that
 * re-introducing a generated schema file is visible in the audit's output.
 */
const GENERATED_TYPES = /from\s+['"][^'"]*(databaseTypes|supabase)[^'"]*['"]/;

/**
 * Value import or types only?
 *
 * The distinction is the difference between two very different debts. A
 * `import type { Order } from '@/lib/supabase/database.types'` is erased by
 * TypeScript: no bundle cost, no runtime dependency, nothing to re-point at a new
 * backend. A value import is a module the app actually runs. Counting both as
 * "depends on Supabase" overstates the work, which is why they are tracked apart.
 */
function importKind(source) {
  const lines = source.split('\n').filter((line) => SUPABASE_IMPORT.test(line) && /^\s*import\b/.test(line));
  if (lines.length === 0) return 'value';
  const everyImportIsTypes = lines.every((line) => {
    if (/^\s*import\s+type\b/.test(line)) return true;
    const braces = line.match(/\{([^}]*)\}/);
    if (!braces) return false;
    const names = braces[1].split(',').map((name) => name.trim()).filter(Boolean);
    return names.length > 0 && names.every((name) => /^type\s/.test(name));
  });
  return everyImportIsTypes ? 'types only' : 'value';
}

const BACKENDS = {
  'WordPress REST (lib/backend)': /from '[^']*backend\/(wordpress|credentials|dataSource|adminCatalog)['"]/,
  'WooCommerce REST (lib/woo)': /from '[^']*\/woo\/[a-zA-Z]+['"]/,
  'hk-storefront plugin': /from '[^']*\/wishlist\/client['"]|hk-storefront/,
  'LeadOS / CRM plugin': /from '[^']*\/leados\/[a-zA-Z]+['"]/,
  'WordPress admin auth': /from '[^']*services\/wordpressAdminAuth['"]/,
};

/**
 * Code with the prose taken out.
 *
 * Modules here explain what they used to do, and those explanations name the
 * PostgREST paths they called — so a scan that reads comments counts a paragraph
 * as a runtime dependency. Comment stripping is deliberately naive (it does not
 * know about strings), which is the safe direction: it can under-count a pattern
 * inside a string literal, never invent one in a comment.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const relative = (file) => path.relative(root, file).split(path.sep).join('/');

/** Where a module sits decides whether the browser or the server pays for it. */
function tierOf(rel) {
  if (/^src\/lib\/supabase\//.test(rel)) return 'the Supabase module itself';
  if (rel.startsWith('src/app/api/')) return 'server routes (never shipped to a browser)';
  if (/^src\/(views|components|context|hooks|store|admin)\//.test(rel)) return 'browser UI modules (a bundle cost)';
  if (rel.startsWith('src/app/')) return 'server-rendered routes';
  return 'shared / server libraries';
}

const codeOf = (file) => stripComments(fs.readFileSync(file, 'utf8'));

const supabaseFiles = files.filter((file) => SUPABASE_IMPORT.test(codeOf(file)));
const runtimeFiles = supabaseFiles.filter((file) => importKind(codeOf(file)) === 'value');
const typesOnlyFiles = supabaseFiles.filter((file) => !runtimeFiles.includes(file));

const tiers = new Map();
for (const file of runtimeFiles) {
  const tier = tierOf(relative(file));
  if (!tiers.has(tier)) tiers.set(tier, []);
  tiers.get(tier).push(relative(file));
}

const supabaseLibLines = files
  .filter((file) => /^src\/lib\/(supabase|commerce)\/(databaseTypes|types)\.ts$/.test(relative(file)))
  .reduce((sum, file) => sum + fs.readFileSync(file, 'utf8').split('\n').length, 0);

/** Tables and Storage buckets are both `.from('x')` — the receiver tells them apart. */
const tables = new Map();
const buckets = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  // The receiver may be an identifier (`supabase`), a call (`getSupabaseAdmin()`)
  // or a property chain broken across lines, so match its tail rather than a name.
  for (const match of source.matchAll(/([\w)\]$]+)\s*\.from\(['"]([a-z_][a-z0-9_]*)['"]\)/g)) {
    const [, receiver, name] = match;
    const target = receiver === 'storage' ? buckets : tables;
    if (!target.has(name)) target.set(name, new Set());
    target.get(name).add(relative(file));
  }
}
const byCount = (map) =>
  [...map.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

const backendCounts = new Map();
for (const [label, pattern] of Object.entries(BACKENDS)) {
  backendCounts.set(label, files.filter((file) => pattern.test(fs.readFileSync(file, 'utf8'))).length);
}

const pluginRoutes = ['wordpress/himalayan-koh-storefront.php', 'wordpress/himalayan-koh-leados.php']
  .map((rel) => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) return `${path.basename(rel)}: absent`;
    const count = (fs.readFileSync(full, 'utf8').match(/register_rest_route\(/g) ?? []).length;
    return `${path.basename(rel)}: ${count} route registration(s)`;
  })
  .join('\n    ');

const line = '─'.repeat(72);
console.log(line);
console.log('Supabase dependency audit');
console.log(line);

console.log('\nSOURCE — RUNTIME IMPORTS (modules the app actually runs)');
console.log(`  modules under src/: ${files.length}`);
console.log(`  importing Supabase at runtime: ${runtimeFiles.length}`);

/** Browser or server? The tier decides it; this only groups the tiers for output. */
const BROWSER_TIERS = new Set(['browser UI modules (a bundle cost)']);
const browserMembers = [];
const serverMembers = [];
for (const [tier, members] of tiers) {
  if (BROWSER_TIERS.has(tier)) browserMembers.push(...members.map((m) => [tier, m]));
  else serverMembers.push(...members.map((m) => [tier, m]));
}

const printMembers = (entries) => {
  for (const [tier, member] of entries.sort((a, b) => a[1].localeCompare(b[1]))) {
    console.log(`    ${member.replace(/^src\//, '')}`);
    console.log(`      ${tier}`);
  }
};

console.log(`\n  BROWSER — ${browserMembers.length} module(s) in a client bundle`);
if (!browserMembers.length) console.log('    (none)');
printMembers(browserMembers);

console.log(`\n  SERVER — ${serverMembers.length} module(s), never shipped to a browser`);
printMembers(serverMembers);

console.log(`\nTYPES ONLY — ${typesOnlyFiles.length} module(s), erased at compile`);
console.log('  no bundle cost and no runtime dependency: these disappear with the type file itself');
for (const file of typesOnlyFiles.map(relative).sort()) console.log(`    ${file.replace(/^src\//, '')}`);

/** A schema-shaped type file re-appearing is the thing this counts. */
const generatedTypeImporters = files.filter((file) => GENERATED_TYPES.test(codeOf(file)));
console.log(`\nSCHEMA-SHAPED TYPE IMPORTS — ${generatedTypeImporters.length} module(s)`);
if (!generatedTypeImporters.length) console.log('    (none)');
for (const file of generatedTypeImporters.map(relative).sort()) console.log(`    ${file.replace(/^src\//, '')}`);
console.log(`\n  src/lib/commerce/types.ts: ${supabaseLibLines} lines — hand-written, type-only.`);
console.log('  Order, OrderItem, OrderWithItems and Profile as this application defines them;');
console.log('  WooCommerce is projected into them, and TypeScript erases every import.');

const rawRest = files.filter((file) => /\/rest\/v1\/|\/storage\/v1\/|supabase\.co/.test(codeOf(file)));
console.log(`\nRAW SUPABASE CALLS (no SDK import) — ${rawRest.length} module(s)`);
if (!rawRest.length) console.log('    (none)');
for (const file of rawRest.map(relative).sort()) console.log(`    ${file.replace(/^src\//, '')}`);

console.log('\nBROWSER — which routes ship it (measured by check:client-supabase)');
const reportPath = path.join(root, '.next', 'client-supabase-report.json');
if (!fs.existsSync(reportPath)) {
  console.log('  not measured on this checkout — run:');
  console.log('    npm run build && npx next start -p 3999 &');
  console.log('    node scripts/check-client-supabase.mjs --base-url http://127.0.0.1:3999');
  console.log('  It needs a build and a running server, which is why it is a separate command.');
} else {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const stamp = (report.measuredAt ?? '').replace('T', ' ').slice(0, 16);
  console.log(`  measured ${stamp} UTC at ${report.baseUrl} over ${report.routesChecked} route(s)`);
  console.log(`  routes downloading the Supabase SDK: ${report.sdkRoutes.length}`);
  for (const route of report.sdkRoutes) console.log(`      ${route}`);
  console.log(`  routes downloading the Supabase config: ${report.configRoutes.length}`);
  const adminOnly = report.configRoutes.filter((route) => route.startsWith('/admin'));
  console.log(`      (${adminOnly.length} of them under /admin, which the owner asked to leave alone)`);
  for (const route of report.configRoutes.filter((r) => !r.startsWith('/admin'))) console.log(`      ${route}`);
  if (report.unmeasured?.length) {
    console.log(`  not measurable (dynamic segment with no sample id): ${report.unmeasured.join(', ')}`);
  }
  if (report.errors?.length) console.log(`  could not be measured: ${report.errors.join(', ')}`);
}

console.log('\nTABLES STILL READ OR WRITTEN');
const tableList = showAllTables ? byCount(tables) : byCount(tables).slice(0, 12);
for (const [table, files] of tableList) {
  console.log(`  ${table.padEnd(28)} ${String(files.size).padStart(2)} module(s)`);
  if (showAllTables) for (const file of [...files].sort()) console.log(`      ${file}`);
}
if (!showAllTables && byCount(tables).length > tableList.length) {
  console.log(`  … ${byCount(tables).length - tableList.length} more — rerun with --tables`);
}
if (buckets.size) {
  console.log('  Storage buckets:');
  for (const [bucket, files] of byCount(buckets)) console.log(`  ${bucket.padEnd(28)} ${files.size} module(s)`);
}

console.log('\nALREADY OFF SUPABASE (modules importing each backend)');
for (const [label, count] of [...backendCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${label}`);
}
console.log(`  WordPress plugin routes:\n    ${pluginRoutes}`);

console.log('\nBY FEATURE (hand-maintained — verify before quoting)');
const features = [
  ['Cart', 'WooCommerce Store API', 'moved'],
  ['Wishlist', 'hk-storefront plugin table', 'moved'],
  ['Customer sign-in / register', 'hk-storefront plugin + our session token', 'moved'],
  ['Admin sign-in', 'WordPress application password', 'moved'],
  ['YouTube embeds', 'WordPress', 'moved'],
  ['LeadOS + CRM data', 'hk-leados plugin (leados/v1, crm/v1)', 'moved'],
  ['Catalog read', 'WooCommerce /wc/v3 — Supabase source, demo fallback and the NEXT_PUBLIC_DATA_SOURCE flag all deleted', 'moved'],
  ['Order creation (Stripe + invoice)', 'WooCommerce order, reserved before payment; id in Stripe metadata', 'moved'],
  ['Order reads (confirmation, tracker, history, admin)', 'WooCommerce /wc/v3', 'moved'],
  ['Order status, Stripe, Shippo, order emails', 'WooCommerce order + _hk_* meta; Shippo returns written to the order', 'moved'],
  ['Historical Supabase orders', 'imported into WooCommerce (npm run migrate:orders -- --apply: 14 orders, 0 failed, idempotent) with _hk_legacy_supabase_order_id preserved; the read-only adapter and its route are deleted. supabase-backup/legacy-orders.archive.json stays as the offline record', 'moved'],
  ['Blog reads (storefront + metadata)', 'WordPress /wp/v2/posts (lib/blog/wordpressBlog.ts)', 'moved'],
  ['Blog admin write + media', 'WordPress /wp/v2/posts + Media Library (lib/blog/wordpressAdminBlog.ts, lib/media)', 'moved'],
  [
    'Customer profiles',
    'WooCommerce customer: /api/account/* reads the identity from the signed customer session and the WordPress plugin stores the profile; measured live by scripts/qa-customer-journey.mjs (signup, sign-in, password change, addresses, wishlist, and two-shopper isolation)',
    'moved',
  ],
  ['Saved addresses', 'hk-storefront plugin table, keyed by the WooCommerce customer id', 'moved'],
  ['Password reset (request + set)', 'WordPress get_password_reset_key / reset_password', 'moved'],
  ['Email verification', 'no replacement — retired, see the migration doc §email verification', 'retired'],
  ['Notifications', 'retired in-app path; order email is the delivered alert', 'retired'],
  ['Category hub CMS overrides', 'WordPress options via hk-storefront/v1 (lib/categoryContent/hubOverrides.ts)', 'moved'],
  ['Site settings', 'WordPress options via hk-storefront/v1 (lib/settings/serverSettings.ts)', 'moved'],
  ['Media (product images, blog bucket)', 'new uploads → WordPress Media Library; existing Supabase URLs left intact', 'partial'],
  ['Newsletter / contact submissions', 'hk-storefront plugin tables (hk_newsletter_subscribers, hk_contact_submissions)', 'moved'],
  ['Traffic analytics (site_events)', 'hk-storefront plugin table hk_site_events, aggregated in SQL', 'moved'],
  ['Hermes evidence', 'hk-storefront plugin table hk_hermes_evidence; dedupe is the table UNIQUE key', 'moved'],
  ['Shippo packing profiles', 'WooCommerce product meta _hk_packing_profile (lib/woo/packingProfile.ts)', 'moved'],
  ['SEO server reads', 'the dead Supabase product fetch was deleted; blog SEO reads WordPress', 'moved'],
  ['Stripe admin client', 'deleted from lib/stripe/server; payment truth is the Woo order plus the signature-checked webhook', 'moved'],
  ['Admin catalog data layer', 'features/catalog/repository.ts → /api/admin/* → WooCommerce; the console’s own records go to the plugin table via services/db.ts', 'moved'],
];
for (const [feature, owner, status] of features) {
  console.log(`  [${status.padEnd(9)}] ${feature.padEnd(52)} ${owner}`);
}
console.log('\n`broken` and `inert` are not "remaining" work: those two have no working path to move,');
console.log('they need a decision (see the addresses/notifications question in the migration doc).');
console.log('`retired` means the feature had no live path at all and was removed rather than ported,');
console.log('so there is nothing left to migrate — the reason is recorded in the migration doc.');
console.log('`blocked` means the code path is written and measured but cannot be switched off yet;');
console.log('the blocker is named in the migration doc, never left implicit.');
