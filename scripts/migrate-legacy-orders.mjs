// Historical orders: Supabase → WooCommerce.
//
//   npm run migrate:orders                     # DRY RUN — reads both sides, writes nothing
//   npm run migrate:orders -- --apply          # perform the import
//   npm run migrate:orders -- --limit=5        # cap how many orders are read/imported
//
// DRY RUN IS THE DEFAULT, and it is also the migration *report*: it prints the
// counts the design document asks for (total orders, statuses, payment statuses,
// orders with no line items, totals that do not reconcile, the date range) so the
// decision to import is made on measured numbers rather than on a feeling.
//
// ## Why the import goes through the hk-storefront plugin
//
// The WooCommerce REST API cannot create an order without emailing the customer:
// status transitions fire WooCommerce's transactional emails and there is no REST
// parameter that disables them. `POST /hk-storefront/v1/legacy-orders/import`
// silences every WooCommerce email for the duration of the request, writes the line
// items as free-standing order items (no product link, so no inventory moves), and
// stores the totals exactly as the source reported them. See the plugin section
// "Historical order import" for the full rule set.
//
// ## Idempotency
//
// Each imported order carries `_hk_legacy_supabase_order_id`. The endpoint answers
// `exists` for an id it has already imported, so a re-run — or a run interrupted
// halfway — creates no duplicates and can simply be repeated.
//
// ## What it never does
//
// No Stripe charge, no Shippo label, no customer email, no inventory reduction, and
// no write to Supabase. The Supabase tables are left exactly as they are.
//
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (reads the source),
// and — for `--apply` — WORDPRESS_BASE_URL, WORDPRESS_ADMIN_USER,
// WORDPRESS_ADMIN_APP_PASSWORD (writes the target through WordPress).

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { loadEnv, getEnvConfig, root } from './lib/env.mjs';
import { createClients } from './lib/supabaseClients.mjs';

loadEnv();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : null;

const { supabaseUrl, serviceRoleKey } = getEnvConfig();
const wpBase = (process.env.WORDPRESS_BASE_URL || process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const wpApiRoot = wpBase ? `${wpBase}/wp-json` : '';
const wpUser = (process.env.WORDPRESS_ADMIN_USER || '').trim();
// WordPress displays the application password in spaced groups; the spaces are cosmetic.
const wpPassword = (process.env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '');

const PAGE_SIZE = 1000; // PostgREST's per-request ceiling
const IMPORT_BATCH = 20; // one WordPress request per batch keeps each one short
const SUPABASE = createClients()?.adminClient || null;
const TIMEOUT_MS = Number(process.env.WORDPRESS_REQUEST_TIMEOUT_MS || 30000);
const UA = 'Mozilla/5.0 (compatible; HimalayanKoh-migrate-orders/1.0)';
const REPORT_PATH = join(root, 'supabase-backup', 'legacy-orders-migration-report.json');

const problems = [];
if (!supabaseUrl || !serviceRoleKey) {
  problems.push('Supabase: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (reads the historical orders).');
}
if (apply && (!wpApiRoot || !wpUser || !wpPassword)) {
  problems.push(
    'WordPress: --apply needs WORDPRESS_BASE_URL, WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD. ' +
      'The plugin endpoint is the only way to import an order without emailing the customer, so there is no ' +
      'WooCommerce-only path to fall back to.'
  );
}
if (problems.length) {
  console.error('Cannot run — missing configuration:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('Historical orders: Supabase → WooCommerce');
console.log(`  mode:      ${apply ? 'APPLY (writing to WooCommerce)' : 'DRY RUN (nothing will be written)'}`);
console.log(`  supabase:  ${supabaseUrl}`);
console.log(`  wordpress: ${wpApiRoot || '(not configured — dry run only)'}`);
if (limit) console.log(`  limit:     ${limit} order(s)`);
console.log('');

// ---------------------------------------------------------------------------
// Supabase (source)
// ---------------------------------------------------------------------------

/**
 * Reads every row of a table, one page at a time.
 *
 * Through the Supabase client rather than a hand-rolled PostgREST fetch: this
 * project's key is a secret key, and the Supabase edge refuses a secret key coming
 * from anything that looks like a browser — a hand-rolled fetch with a browser user
 * agent is answered `401 Forbidden use of secret API key in browser`, which reads
 * like a permissions problem and is really a user-agent one.
 */
async function supabaseFetchAll(table, orderBy) {
  if (!SUPABASE) return { rows: [], missing: true };

  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await SUPABASE.from(table)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      // 42P01/PGRST205 = the table is not in this project's schema cache.
      if (/42P01|PGRST205|does not exist|schema cache/i.test(error.message)) {
        return { rows: [], missing: true };
      }
      throw new Error(`Supabase read failed for ${table}: ${error.message}`);
    }

    const page = data || [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (limit && rows.length >= limit) break;
  }
  return { rows: limit ? rows.slice(0, limit) : rows, missing: false };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** The app's order status, as WooCommerce spells it. Mirrors the plugin's map. */
const WOO_STATUS_BY_APP_STATUS = {
  pending: 'pending',
  confirmed: 'processing',
  processing: 'processing',
  packed: 'processing',
  shipped: 'completed',
  delivered: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

function wooStatusFor(status) {
  return WOO_STATUS_BY_APP_STATUS[String(status || '').toLowerCase()] || 'pending';
}

/** An address object the plugin's `set_address()` understands. */
function addressPayload(raw, email, phone) {
  const address = raw && typeof raw === 'object' ? raw : {};
  const name = String(address.full_name || address.name || '').trim();
  const [first, ...rest] = name.split(/\s+/).filter(Boolean);
  return {
    first_name: String(address.first_name || first || '').trim(),
    last_name: String(address.last_name || rest.join(' ') || '').trim(),
    company: address.company ? String(address.company) : '',
    address_1: String(address.address_line1 || address.address_1 || address.street || '').trim(),
    address_2: String(address.address_line2 || address.address_2 || '').trim(),
    city: String(address.city || '').trim(),
    state: String(address.state || '').trim(),
    postcode: String(address.postal_code || address.zip || '').trim(),
    country: String(address.country || '').trim(),
    email: String(address.email || email || '').trim(),
    phone: String(address.phone || phone || '').trim(),
  };
}

function orderPayload(order, items) {
  const created = order.created_at ? new Date(order.created_at) : null;
  const paidAt = order.payment_status === 'paid' ? created : null;

  return {
    id: order.id,
    order_number: order.order_number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    payment_intent: order.payment_method || null,
    currency: order.currency || 'USD',
    total: order.total,
    subtotal: order.subtotal,
    shipping_total: order.shipping_cost,
    tax_total: order.tax_amount,
    discount_total: order.discount_amount,
    created_at: created ? created.toISOString() : null,
    paid_at: paidAt ? paidAt.toISOString() : null,
    billing: addressPayload(order.billing_address, order.email, order.phone),
    shipping: addressPayload(order.shipping_address, order.email, order.phone),
    note: [
      order.notes,
      `Imported from the app's own order store (Supabase id ${order.id}).`,
      order.tracking_number ? `Historical tracking number: ${order.tracking_number}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    items: items.map((item) => ({
      name: item.product_name,
      sku: item.grain_size ? `${item.product_name} — ${item.grain_size}` : null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total_price,
    })),
  };
}

// ---------------------------------------------------------------------------
// WordPress (target)
// ---------------------------------------------------------------------------

function wpHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': UA,
    Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPassword}`).toString('base64')}`,
  };
}

/** One plugin call. Throws with WordPress's own message. */
async function importOrder(payload) {
  const response = await fetch(`${wpApiRoot}/hk-storefront/v1/legacy-orders/import`, {
    method: 'POST',
    headers: wpHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* WordPress answered with HTML — most often a PHP fatal or a login page. */
  }

  if (!response.ok) {
    throw new Error(`WordPress refused order ${payload.order_number}: HTTP ${response.status} ${(json?.message || text).slice(0, 200)}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const { rows: orders, missing: ordersMissing } = await supabaseFetchAll('orders', 'created_at');
const { rows: items, missing: itemsMissing } = await supabaseFetchAll('order_items', 'order_id');

if (ordersMissing) {
  console.error('The `orders` table does not exist in this Supabase project — there is nothing to migrate.');
  process.exit(0);
}

const itemsByOrder = new Map();
for (const item of itemsMissing ? [] : items) {
  const list = itemsByOrder.get(item.order_id) || [];
  list.push(item);
  itemsByOrder.set(item.order_id, list);
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const byStatus = {};
const byPaymentStatus = {};
const byCurrency = {};
const exceptions = [];
let withoutItems = 0;
let withoutEmail = 0;
let withoutTotal = 0;
let totalMismatch = 0;
let itemSubtotalMismatch = 0;
let earliest = null;
let latest = null;

for (const order of orders) {
  byStatus[order.status] = (byStatus[order.status] || 0) + 1;
  byPaymentStatus[order.payment_status] = (byPaymentStatus[order.payment_status] || 0) + 1;
  byCurrency[order.currency || '(none)'] = (byCurrency[order.currency || '(none)'] || 0) + 1;

  const lines = itemsByOrder.get(order.id) || [];
  if (lines.length === 0) {
    withoutItems += 1;
    exceptions.push({ id: order.id, order_number: order.order_number, reason: 'no line items' });
  }
  if (!String(order.email || '').trim()) {
    withoutEmail += 1;
    exceptions.push({ id: order.id, order_number: order.order_number, reason: 'no email' });
  }
  if (order.total === null || order.total === undefined) {
    withoutTotal += 1;
    exceptions.push({ id: order.id, order_number: order.order_number, reason: 'no total' });
  } else {
    // Two checks, because they answer different questions and only the second one
    // is about the order being wrong.
    //
    //   items vs subtotal   — did the lines and the stored subtotal agree?
    //   subtotal + shipping + tax − discount vs total — does the order's own
    //                       arithmetic add up? The first dry run compared the
    //                       line-item sum against the *grand* total and reported 12
    //                       of 14 orders as inconsistent; they were all correct, and
    //                       the difference was the shipping the total includes. A
    //                       check that cries wolf on correct data is worse than no
    //                       check, so this one now models the total properly.
    const round = (value) => Math.round(Number(value || 0) * 100) / 100;
    const itemsSum = round(lines.reduce((sum, line) => sum + Number(line.total_price || 0), 0));
    const subtotal = round(order.subtotal);
    const expected = round(
      Number(order.subtotal || 0) + Number(order.shipping_cost || 0) + Number(order.tax_amount || 0) - Number(order.discount_amount || 0)
    );
    const stored = round(order.total);

    if (Math.abs(itemsSum - subtotal) > 0.02) {
      itemSubtotalMismatch += 1;
      exceptions.push({
        id: order.id,
        order_number: order.order_number,
        reason: 'line items do not sum to the stored subtotal',
        itemsSum,
        storedSubtotal: subtotal,
      });
    }

    if (Math.abs(expected - stored) > 0.02) {
      totalMismatch += 1;
      exceptions.push({
        id: order.id,
        order_number: order.order_number,
        reason: 'subtotal + shipping + tax − discount does not equal the stored total',
        expected,
        storedTotal: stored,
      });
    }
  }

  const created = order.created_at ? new Date(order.created_at) : null;
  if (created && !Number.isNaN(created.getTime())) {
    if (!earliest || created < earliest) earliest = created;
    if (!latest || created > latest) latest = created;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? 'apply' : 'dry-run',
  source: { supabaseUrl, orders: orders.length, orderItems: items.length },
  totals: {
    orders: orders.length,
    lineItems: items.length,
    withoutItems,
    withoutEmail,
    withoutTotal,
    lineItemsDoNotMatchSubtotal: itemSubtotalMismatch,
    totalsDoNotReconcile: totalMismatch,
  },
  byStatus,
  byPaymentStatus,
  byCurrency,
  dateRange: {
    earliest: earliest ? earliest.toISOString() : null,
    latest: latest ? latest.toISOString() : null,
  },
  // Line items carry their own name and price, so an item never needs a product
  // record: there is nothing here that can fail to map. Reported explicitly so a
  // reader does not have to infer it from an empty list.
  productMapping: {
    strategy: 'descriptive line items (product name, grain size, unit price) — no product link, no inventory change',
    requiresWooProductMapping: false,
  },
  exceptions,
};

console.log('Measured historical orders');
console.log(`  orders:            ${report.totals.orders}`);
console.log(`  line items:        ${report.totals.lineItems}`);
console.log(`  without items:     ${withoutItems}`);
console.log(`  without email:     ${withoutEmail}`);
console.log(`  without total:     ${withoutTotal}`);
console.log(`  lines ≠ subtotal:  ${itemSubtotalMismatch}`);
console.log(`  totals not recon.: ${totalMismatch}`);
console.log(`  date range:        ${report.dateRange.earliest || '—'} → ${report.dateRange.latest || '—'}`);
console.log(`  statuses:          ${JSON.stringify(byStatus)}`);
console.log(`  payments:          ${JSON.stringify(byPaymentStatus)}`);
console.log(`  currencies:        ${JSON.stringify(byCurrency)}`);
console.log('');

try {
  mkdirSync(join(root, 'supabase-backup'), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report written to ${REPORT_PATH}`);
} catch (error) {
  console.warn(`Report could not be written: ${error.message}`);
}

if (!apply) {
  console.log('');
  console.log('DRY RUN — nothing was written. Re-run with --apply to import these orders.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

console.log('');
console.log('Importing…');

let created = 0;
let existed = 0;
const failures = [];

for (let i = 0; i < orders.length; i += IMPORT_BATCH) {
  const batch = orders.slice(i, i + IMPORT_BATCH);
  for (const order of batch) {
    const payload = orderPayload(order, itemsByOrder.get(order.id) || []);
    try {
      const result = await importOrder(payload);
      if (result?.result === 'created') created += 1;
      else existed += 1;
      process.stdout.write(result?.result === 'created' ? '.' : '=');
    } catch (error) {
      failures.push({ id: order.id, order_number: order.order_number, error: error.message });
      process.stdout.write('x');
    }
  }
}

console.log('');
console.log('');
console.log('Import finished');
console.log(`  created:  ${created}`);
console.log(`  existed:  ${existed}`);
console.log(`  failed:   ${failures.length}`);

report.import = { created, existed, failed: failures.length, failures };
try {
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
} catch {
  /* the pre-import report is already on disk */
}

if (failures.length) {
  console.error('');
  console.error('Failures:');
  for (const failure of failures.slice(0, 20)) console.error(`  ${failure.order_number}: ${failure.error}`);
  process.exit(1);
}
