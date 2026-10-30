#!/usr/bin/env node
/**
 * Where did 2,704 customer records come from?
 *
 *   node scripts/probe-customer-provenance.mjs
 *
 * Read-only. Answers three questions the census could not:
 *
 *   1. Does the store even return `orders_count` / `total_spent` for a customer?
 *      If it does not, the console's "Not reported" is a store-side gap and the
 *      census's "zero orders" means nothing — which is the trap the owner warned
 *      about, so it is checked before any classification rests on it.
 *   2. Do the order records point at any of these customers by id or by address?
 *      That is the only trustworthy link between the two sets.
 *   3. What does a customer record carry besides its address — role, meta keys,
 *      registration path — that says where it was created?
 *
 * Addresses are digested, never printed. Keys of meta are printed, values are
 * not: an import leaves its fingerprint in the key names.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const envFile = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : '.env.local';
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com'
).replace(/\/+$/, '');

const digest = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 10);
const mask = (email) => {
  const at = String(email || '').lastIndexOf('@');
  return at > 0 ? `${digest(String(email).slice(0, at))}@${String(email).slice(at + 1).toLowerCase()}` : '<none>';
};

const wooAuth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const wpAuth =
  env.WORDPRESS_ADMIN_USER && env.WORDPRESS_ADMIN_APP_PASSWORD
    ? 'Basic ' + Buffer.from(`${env.WORDPRESS_ADMIN_USER}:${env.WORDPRESS_ADMIN_APP_PASSWORD.replace(/\s+/g, '')}`).toString('base64')
    : null;
const wpPassAuth =
  env.PRODUCTION_WP_ADMIN_EMAIL && env.PRODUCTION_WP_ADMIN_PASSWORD
    ? 'Basic ' + Buffer.from(`${env.PRODUCTION_WP_ADMIN_EMAIL}:${env.PRODUCTION_WP_ADMIN_PASSWORD}`).toString('base64')
    : null;

async function get(pathname, auth, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/wp-json${pathname}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, headers: res.headers };
}

console.log(`Provenance probe against ${BASE} (read-only)\n`);

/* 1 — does the store report spending at all? */
console.log('=== 1. Does a customer record carry orders_count / total_spent? ===');
const single = await get('/wc/v3/customers/1', wooAuth);
if (single.status === 200) {
  const c = single.body;
  console.log(`  HTTP 200. Keys present: ${Object.keys(c).sort().join(', ')}`);
  console.log(`  orders_count: ${JSON.stringify(c.orders_count)} | total_spent: ${JSON.stringify(c.total_spent)} | is_paying_customer: ${JSON.stringify(c.is_paying_customer)}`);
  console.log(`  role: ${JSON.stringify(c.role)} | date_created: ${c.date_created} | username: ${c.username}`);
  const metaKeys = (c.meta_data || []).map((m) => m.key);
  console.log(`  meta_data keys (no values): ${metaKeys.join(', ') || '(none)'}`);
} else {
  console.log(`  HTTP ${single.status}: ${JSON.stringify(single.body).slice(0, 200)}`);
}

const noFields = await get('/wc/v3/customers', wooAuth, { per_page: 3, orderby: 'registered_date', order: 'desc' });
if (noFields.status === 200) {
  const list = Array.isArray(noFields.body) ? noFields.body : [];
  console.log(`\n  Unfiltered listing (3 newest): x-wp-total=${noFields.headers.get('x-wp-total')}`);
  for (const c of list) {
    console.log(`    #${c.id} ${mask(c.email)} role=${c.role} created=${String(c.date_created).slice(0, 10)} orders_count=${JSON.stringify(c.orders_count)} total_spent=${JSON.stringify(c.total_spent)} paying=${JSON.stringify(c.is_paying_customer)}`);
  }
} else {
  console.log(`\n  Listing HTTP ${noFields.status}`);
}

/* 2 — do orders point at these customers? */
console.log('\n=== 2. Order ↔ customer linkage ===');
const orders = await get('/wc/v3/orders', wooAuth, { per_page: 100, _fields: 'id,status,date_created,customer_id,billing' });
const oRows = Array.isArray(orders.body) ? orders.body : [];
const linkedIds = [...new Set(oRows.map((o) => Number(o.customer_id)).filter((n) => n > 0))];
console.log(`  ${oRows.length} orders; distinct non-zero customer_id values: ${linkedIds.length} → ${linkedIds.slice(0, 20).join(', ') || '(none)'}`);

const billingEmails = oRows.map((o) => String(o.billing?.email || '').toLowerCase()).filter(Boolean);
console.log(`  orders carrying a billing address: ${billingEmails.length}`);
for (const o of oRows.slice(0, 20)) {
  console.log(`    #${o.id} ${String(o.date_created).slice(0, 10)} ${o.status} customer_id=${o.customer_id} ${mask(o.billing?.email)}`);
}

/* Do any of those ids exist in the customer list? Resolve them one by one. */
if (linkedIds.length) {
  const found = [];
  for (const id of linkedIds.slice(0, 25)) {
    const one = await get(`/wc/v3/customers/${id}`, wooAuth);
    found.push(`#${id}=${one.status === 200 ? `${mask(one.body.email)} (${one.body.role}, created ${String(one.body.date_created).slice(0, 10)})` : `HTTP ${one.status}`}`);
  }
  console.log(`  resolvable from the order side: ${found.join(' | ')}`);
}

/* 3 — who is in WordPress, and what is installed? */
console.log('\n=== 3. WordPress users and plugins ===');
for (const [label, auth] of [['app-password (.env.local)', wpAuth], ['PRODUCTION_WP_ADMIN', wpPassAuth]]) {
  if (!auth) {
    console.log(`  ${label}: not configured`);
    continue;
  }
  const users = await get('/wp/v2/users', auth, { per_page: 100, context: 'edit', _fields: 'id,username,roles,registered_date' });
  if (users.status !== 200) {
    console.log(`  ${label}: HTTP ${users.status} (${String(users.body?.code || '')})`);
    continue;
  }
  console.log(`  ${label}: HTTP 200, x-wp-total=${users.headers.get('x-wp-total')}`);
  const byRole = {};
  for (const u of users.body) for (const r of u.roles || ['<none>']) byRole[r] = (byRole[r] || 0) + 1;
  console.log(`    roles on page 1: ${JSON.stringify(byRole)}`);
  const staff = users.body.filter((u) => (u.roles || []).some((r) => r !== 'customer' && r !== 'subscriber'));
  for (const u of staff.slice(0, 15)) console.log(`    staff #${u.id} ${u.username} [${u.roles.join(',')}] ${String(u.registered_date).slice(0, 10)}`);

  const plugins = await get('/wp/v2/plugins', auth);
  if (plugins.status === 200 && Array.isArray(plugins.body)) {
    console.log(`    plugins (${plugins.body.length}): ${plugins.body.map((p) => `${p.plugin}=${p.status}`).join('\n      ')}`);
  } else {
    console.log(`    plugins: HTTP ${plugins.status}`);
  }
  break;
}

/* Customer role counts from the store's own report endpoint, for comparison. */
console.log('\n=== 4. Store-side totals ===');
for (const [label, path, params] of [
  ['customers (all roles)', '/wc/v3/customers', { per_page: 1 }],
  ['customers role=customer', '/wc/v3/customers', { per_page: 1, role: 'customer' }],
  ['customers role=subscriber', '/wc/v3/customers', { per_page: 1, role: 'subscriber' }],
  ['customers role=all', '/wc/v3/customers', { per_page: 1, role: 'all' }],
  ['orders', '/wc/v3/orders', { per_page: 1 }],
  ['orders completed', '/wc/v3/orders', { per_page: 1, status: 'completed' }],
  ['orders pending', '/wc/v3/orders', { per_page: 1, status: 'pending' }],
  ['orders failed', '/wc/v3/orders', { per_page: 1, status: 'failed' }],
  ['orders cancelled', '/wc/v3/orders', { per_page: 1, status: 'cancelled' }],
  ['orders refunded', '/wc/v3/orders', { per_page: 1, status: 'refunded' }],
  ['orders any', '/wc/v3/orders', { per_page: 1, status: 'any' }],
  ['products', '/wc/v3/products', { per_page: 1, status: 'any' }],
]) {
  const res = await get(path, wooAuth, params);
  console.log(`  ${label.padEnd(26)} HTTP ${res.status} x-wp-total=${res.headers.get('x-wp-total') ?? '-'}`);
}

/* Any order-level report the store publishes. */
const totals = await get('/wc/v3/reports/orders/totals', wooAuth);
if (totals.status === 200) {
  console.log(`\n  reports/orders/totals: ${JSON.stringify(totals.body).slice(0, 500)}`);
} else {
  console.log(`\n  reports/orders/totals: HTTP ${totals.status}`);
}
