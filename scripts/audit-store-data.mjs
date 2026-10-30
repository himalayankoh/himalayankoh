#!/usr/bin/env node
/**
 * A read-only census of the store's customers and orders.
 *
 *   node scripts/audit-store-data.mjs
 *   node scripts/audit-store-data.mjs --env ../.freebuff/owner-secrets.live.local
 *
 * ## What this is for
 *
 * The owner saw 2,704 customer records in the console, many with random-looking
 * addresses, no orders and spend shown as "Not reported", and concluded they were
 * fake. That may be right, but the console's own rendering is not evidence — it
 * cannot tell "this account never bought" apart from "this account's spending was
 * never fetched". So this script reads the store directly and answers the
 * question with the store's own fields:
 *
 *   - how many customer records exist, and how many of them carry order history;
 *   - when they were created and how they cluster in time;
 *   - what the addresses look like, by domain and by local-part shape;
 *   - how many orders exist, by status and by payment method;
 *   - and where the console's "Not reported" actually comes from.
 *
 * ## Read-only, and PII-aware by construction
 *
 * Every call is a GET. Nothing here writes, and it must stay that way: a census
 * that mutates its subject cannot be used to decide whether mutation is safe.
 *
 * Addresses are never printed whole. Each is reduced to its domain plus a short
 * digest of the local part, which is enough to group accounts that are the same
 * shape without turning this script's output into a customer list. Full records
 * are written to `backups/` (gitignored) because the classification in a later
 * step needs them, and never into a tracked file.
 *
 * ## The host's bot protection
 *
 * Namecheap/LiteSpeed answers a burst of unusual requests with a "One moment,
 * please…" page. That is HTML, not JSON, and a census built on challenge pages
 * would be fiction, so this stops and says so.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(`--${name}`);
  return index > -1 ? args[index + 1] : null;
};

const envFile = argValue('env') || '.env.local';
if (!fs.existsSync(envFile)) {
  console.error(`No env file at ${envFile}. Pass --env <file> or create .env.local.`);
  process.exit(2);
}

/** Read only the keys this needs — the same short allow-list idea the backup
 * script uses, so a census cannot start behaviour that depends on the rest of
 * the environment. */
const WANTED = [
  'WORDPRESS_BASE_URL',
  'NEXT_PUBLIC_WORDPRESS_BASE_URL',
  'WOOCOMMERCE_BASE_URL',
  'NEXT_PUBLIC_WOOCOMMERCE_BASE_URL',
  'WOOCOMMERCE_CONSUMER_KEY',
  'WOOCOMMERCE_CONSUMER_SECRET',
  // Read-only pair, when the operator prefers it (live secrets file).
  'WOO_LIVE_READ_CK',
  'WOO_LIVE_READ_CS',
  'WOO_LIVE_CK',
  'WOO_LIVE_CS',
];

const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const index = line.indexOf('=');
  if (index <= 0) continue;
  const key = line.slice(0, index).trim();
  if (!WANTED.includes(key)) continue;
  env[key] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
}

const BASE = (
  argValue('base') ||
  env.WOOCOMMERCE_BASE_URL ||
  env.WORDPRESS_BASE_URL ||
  env.NEXT_PUBLIC_WOOCOMMERCE_BASE_URL ||
  env.NEXT_PUBLIC_WORDPRESS_BASE_URL ||
  'https://wp.himalayankoh.com'
)
  .trim()
  .replace(/\/+$/, '');

const key = env.WOO_LIVE_READ_CK || env.WOOCOMMERCE_CONSUMER_KEY || env.WOO_LIVE_CK;
const secret = env.WOO_LIVE_READ_CS || env.WOOCOMMERCE_CONSUMER_SECRET || env.WOO_LIVE_CS;
if (!key || !secret) {
  console.error(`${envFile} carries no WooCommerce credential pair this script can use.`);
  process.exit(2);
}

const headers = {
  Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
  Accept: 'application/json',
};

class Challenge extends Error {}

async function get(pathname, params = {}) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.append(k, String(v));
  }
  const qs = search.toString();
  const url = `${BASE}/wp-json${pathname}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  const text = await res.text();
  if (/One moment, please|cf-browser-verification|Checking your browser/i.test(text.slice(0, 4000))) {
    throw new Challenge('bot-protection interstitial');
  }
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} for ${pathname}: ${text.slice(0, 160)}`);
    error.status = res.status;
    throw error;
  }
  return { body: JSON.parse(text), total: Number(res.headers.get('x-wp-total') ?? '') || null };
}

/** Every page of a collection, up to `maxPages`, with the store's own total. */
async function collect(pathname, { params = {}, perPage = 100, maxPages = 60 } = {}) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const { body, total: reported } = await get(pathname, { ...params, per_page: perPage, page });
    if (page === 1) total = reported;
    if (!Array.isArray(body)) break;
    rows.push(...body);
    if (body.length < perPage) break;
  }
  return { rows, total, truncated: total !== null && rows.length < total };
}

/* ---------------------------------------------------------------- PII masking */

/** A stable label for an address: its domain, plus a digest of the local part.
 * Groups accounts of the same shape without printing anybody's address. */
function mask(email) {
  const value = String(email || '');
  const at = value.lastIndexOf('@');
  if (at <= 0) return value ? `<no-domain:${digest(value).slice(0, 6)}>` : '<none>';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  return `${digest(local.toLowerCase()).slice(0, 6)}@${domain}`;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Cheap shape tests for a local part, used only to group, never to accuse. */
function localShape(local) {
  const value = String(local || '').toLowerCase();
  if (!value) return 'empty';
  if (/^[0-9a-f]{8,}$/.test(value)) return 'hex-run';
  if (/^[0-9]+$/.test(value)) return 'digits-only';
  if (/^[a-z]+$/.test(value)) return 'letters-only';
  if (/^[a-z]+\.[a-z]+$/.test(value)) return 'first.last';
  if (/^[a-z]+\d+$/.test(value)) return 'letters+digits';
  if (value.length >= 12 && /[0-9]/.test(value) && /[a-z]/.test(value)) return 'long-mixed';
  return 'other';
}

const day = (iso) => String(iso || '').slice(0, 10);

function tally(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const value = keyFn(row);
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function topOf(map, n = 12) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/* ------------------------------------------------------------------- the run */

console.log(`Census of ${BASE} (read-only GETs)\n`);

const started = new Date().toISOString();
const report = { source: BASE, startedAt: started, readOnly: true };

let customers;
let orders;
try {
  customers = await collect('/wc/v3/customers', {
    params: {
      _fields: 'id,email,username,first_name,last_name,role,date_created,date_created_gmt,orders_count,total_spent,is_paying_customer,avatar_url',
    },
  });
  orders = await collect('/wc/v3/orders', {
    params: {
      _fields: 'id,number,status,currency,total,date_created,date_paid,payment_method,payment_method_title,customer_id,billing,created_via,line_items,meta_data',
    },
  });
} catch (error) {
  if (error instanceof Challenge) {
    console.error(
      'Stopped: the host answered with its bot-protection interstitial instead of JSON.\n' +
        'Wait for it to clear (it is per-IP) and run this again. Nothing was read.'
    );
    process.exit(3);
  }
  console.error(`Stopped: ${error.message}`);
  process.exit(1);
}

/* ----------------------------------------------------------------- customers */

const cRows = customers.rows;
report.customers = {
  total: customers.total,
  fetched: cRows.length,
  truncated: customers.truncated,
};

const byRole = tally(cRows, (c) => c.role || 'unknown');
const byWithOrders = {
  hasOrders: cRows.filter((c) => (c.orders_count || 0) > 0).length,
  noOrders: cRows.filter((c) => (c.orders_count || 0) === 0).length,
  payingFlag: cRows.filter((c) => c.is_paying_customer === true).length,
  spendReported: cRows.filter((c) => c.total_spent !== undefined && c.total_spent !== null).length,
};

/** Spend as the store reports it, summed only where it reports something. */
const spendSum = cRows.reduce((sum, c) => sum + Number(c.total_spent || 0), 0);

const byDomain = tally(cRows, (c) => String(c.email || '').split('@')[1]?.toLowerCase() || '<none>');
const domainCounts = Object.fromEntries(
  Object.entries(byDomain).map(([d, n]) => [d, n])
);

const byLocalShape = tally(cRows, (c) => {
  const email = String(c.email || '');
  const at = email.lastIndexOf('@');
  return localShape(at > 0 ? email.slice(0, at) : email);
});

const byCreatedDay = tally(cRows, (c) => day(c.date_created_gmt || c.date_created));
const daysSorted = Object.entries(byCreatedDay).sort((a, b) => a[0].localeCompare(b[0]));

const byUsernameShape = tally(cRows, (c) => localShape(c.username));

/** A name on the record is weak evidence of a person, but the absence of one on
 * a whole cluster is worth knowing. */
const withName = cRows.filter((c) => (c.first_name || '').trim() || (c.last_name || '').trim()).length;

report.customers.distribution = {
  byRole,
  ordersAndSpend: byWithOrders,
  spendSumReported: Number(spendSum.toFixed(2)),
  withAnyName: withName,
  byLocalPartShape: byLocalShape,
  byUsernameShape,
  distinctDomains: Object.keys(byDomain).length,
  topDomains: topOf(byDomain, 15),
  createdRange: daysSorted.length ? { first: daysSorted[0][0], last: daysSorted.at(-1)[0] } : null,
  topCreatedDays: daysSorted.sort((a, b) => b[1] - a[1]).slice(0, 10),
};

/* --------------------------------------------------------------------- orders */

const oRows = orders.rows;
const byStatus = tally(oRows, (o) => o.status || 'unknown');
const byPaymentMethod = tally(oRows, (o) => o.payment_method || '<none>');
const byCreatedVia = tally(oRows, (o) => o.created_via || '<none>');
const byStatusPaid = tally(oRows, (o) => (o.date_paid ? 'date_paid_set' : 'date_paid_empty'));
const byCustomerLink = {
  linkedToCustomer: oRows.filter((o) => Number(o.customer_id) > 0).length,
  guest: oRows.filter((o) => !Number(o.customer_id)).length,
};

/** Transaction identifiers, which are what a payment provider can be matched
 * against. Values are digested, never printed. */
const withTxn = oRows.filter((o) => {
  const meta = Array.isArray(o.meta_data) ? o.meta_data : [];
  return meta.some((m) => /_transaction_id$|_payment_intent|_charge_id|_stripe_/i.test(String(m?.key || '')) && m?.value);
});

report.orders = {
  total: orders.total,
  fetched: oRows.length,
  truncated: orders.truncated,
  byStatus,
  byPaymentMethod,
  byCreatedVia,
  paidDatePresence: byStatusPaid,
  customerLinkage: byCustomerLink,
  withTransactionMeta: withTxn.length,
  dateRange: (() => {
    const days = oRows.map((o) => day(o.date_created)).filter(Boolean).sort();
    return days.length ? { first: days[0], last: days.at(-1) } : null;
  })(),
  totalValueVndOrUsd: (() => {
    const byCurrency = {};
    for (const o of oRows) {
      const c = o.currency || '<none>';
      byCurrency[c] = Number(((byCurrency[c] || 0) + Number(o.total || 0)).toFixed(2));
    }
    return byCurrency;
  })(),
  lineItemNamesTop: topOf(
    tally(
      oRows.flatMap((o) => (Array.isArray(o.line_items) ? o.line_items : [])),
      (li) => String(li.name || '<unnamed>')
    ),
    15
  ),
};

/* --------------------------------------------------------------------- users */

/** WordPress users, when the credentials reach `/wp/v2/users`. A failure here is
 * reported, not hidden: the staff accounts it lists are the ones nothing may
 * ever delete. */
try {
  const users = await collect('/wp/v2/users', {
    params: { context: 'edit', _fields: 'id,username,name,email,roles,registered_date,slug' },
  });
  const byRoleU = {};
  for (const u of users.rows) {
    for (const r of Array.isArray(u.roles) ? u.roles : ['<none>']) {
      byRoleU[r] = (byRoleU[r] || 0) + 1;
    }
  }
  report.wordpressUsers = {
    total: users.total,
    fetched: users.rows.length,
    byRole: byRoleU,
    // Who must never be touched. Addresses masked like every other.
    privileged: users.rows
      .filter((u) => (u.roles || []).some((r) => ['administrator', 'editor', 'shop_manager', 'author', 'contributor'].includes(r)))
      .map((u) => ({ id: u.id, username: u.username, roles: u.roles, email: mask(u.email), registered: day(u.registered_date) })),
  };
  const priv = report.wordpressUsers.privileged;
  console.log(`WordPress users: ${users.total} (${priv.length} privileged)`);
  for (const u of priv) console.log(`  #${u.id} ${u.username} [${(u.roles || []).join(',')}] ${u.email} ${u.registered}`);
} catch (error) {
  report.wordpressUsers = { error: error.message };
  console.log(`WordPress users: NOT READ — ${error.message}`);
}

/* ------------------------------------------------------------------- console */

console.log(`\nCustomers: ${customers.total} reported, ${cRows.length} read`);
console.log(`  with orders: ${byWithOrders.hasOrders} | no orders: ${byWithOrders.noOrders} | paying flag: ${byWithOrders.payingFlag}`);
console.log(`  total_spent field present on: ${byWithOrders.spendReported} records (sum ${spendSum.toFixed(2)})`);
console.log(`  with any name: ${withName} | distinct email domains: ${Object.keys(byDomain).length}`);
console.log(`  by role: ${JSON.stringify(byRole)}`);
console.log(`  by local-part shape: ${JSON.stringify(byLocalShape)}`);
console.log(`  by username shape: ${JSON.stringify(byUsernameShape)}`);
console.log(`  top domains: ${topOf(byDomain, 10).map(([d, n]) => `${d}=${n}`).join(' ')}`);
console.log(`  created: ${report.customers.distribution.createdRange?.first ?? '?'} → ${report.customers.distribution.createdRange?.last ?? '?'}`);
console.log(`  busiest days: ${report.customers.distribution.topCreatedDays.map(([d, n]) => `${d}=${n}`).join(' ')}`);

console.log(`\nOrders: ${orders.total} reported, ${oRows.length} read`);
console.log(`  by status: ${JSON.stringify(byStatus)}`);
console.log(`  by payment method: ${JSON.stringify(byPaymentMethod)}`);
console.log(`  by created_via: ${JSON.stringify(byCreatedVia)}`);
console.log(`  date_paid set: ${JSON.stringify(byStatusPaid)}`);
console.log(`  linked to a customer: ${byCustomerLink.linkedToCustomer} | guest: ${byCustomerLink.guest}`);
console.log(`  with transaction metadata: ${withTxn.length}`);
console.log(`  dates: ${report.orders.dateRange?.first ?? '?'} → ${report.orders.dateRange?.last ?? '?'}`);
console.log(`  value by currency: ${JSON.stringify(report.orders.totalValueVndOrUsd)}`);
console.log(`  products on orders: ${report.orders.lineItemNamesTop.map(([n, c]) => `${n}×${c}`).join(' | ')}`);

/* ------------------------------------------------------------------- output */

const outDir = path.join(ROOT, 'backups', `${started.replace(/[:.]/g, '-')}-store-census`);
fs.mkdirSync(outDir, { recursive: true });
// Full records, masked: enough to classify without becoming a customer list.
fs.writeFileSync(
  path.join(outDir, 'customers.json'),
  JSON.stringify(
    cRows.map((c) => ({
      id: c.id,
      email: mask(c.email),
      username: c.username,
      role: c.role,
      registered: day(c.date_created_gmt || c.date_created),
      ordersCount: c.orders_count ?? null,
      totalSpent: c.total_spent ?? null,
      isPaying: c.is_paying_customer ?? null,
      hasName: Boolean((c.first_name || '').trim() || (c.last_name || '').trim()),
    })),
    null,
    2
  )
);
fs.writeFileSync(
  path.join(outDir, 'orders.json'),
  JSON.stringify(
    oRows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      currency: o.currency,
      total: o.total,
      created: o.date_created,
      paid: o.date_paid,
      paymentMethod: o.payment_method,
      customerId: o.customer_id,
      createdVia: o.created_via,
      email: mask(o.billing?.email),
      items: (o.line_items || []).map((li) => `${li.name}×${li.quantity}`),
      txnKeys: (o.meta_data || [])
        .filter((m) => /_transaction_id$|_payment_intent|_charge_id|_stripe_/i.test(String(m?.key || '')))
        .map((m) => m.key),
    })),
    null,
    2
  )
);
fs.writeFileSync(path.join(outDir, 'census.json'), JSON.stringify(report, null, 2));

console.log(`\nFull (masked) records and the summary are in backups/${path.basename(outDir)}/`);
console.log('This directory is gitignored. Nothing was written to the store.');
