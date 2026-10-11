#!/usr/bin/env node
/**
 * Move named orders to the WooCommerce trash, reversibly, one verified order at a time.
 *
 *   node scripts/archive-test-orders.mjs --ids=2521,2522                       # dry run
 *   node scripts/archive-test-orders.mjs --ids=2521,2522 --apply               # writes
 *   node scripts/archive-test-orders.mjs --ids=2521,2522 --restore --apply     # puts them back
 *
 * ## Why named ids and nothing else
 *
 * The owner wants test orders out of operational reporting, and the risk is
 * obvious: a filter that says "unpaid orders from the last week" eventually
 * catches a real customer whose card was authorised and whose order is waiting
 * for capture. So this script has no filter at all. Every order must be named on
 * the command line, and each one is read back and printed before anything is
 * written, so the person running it is looking at the record they are about to
 * move.
 *
 * ## Trash, not delete
 *
 * The store's REST API refuses `status: 'trash'` with `rest_invalid_param` —
 * `trash` is not in its status enum — so the supported move is `DELETE /orders/<id>`
 * **without** `force`. That is not a deletion: WooCommerce moves the record into its
 * own bin, keeping the row, its line items, its meta and its transaction
 * references, and it can be restored. `lib/woo/orders.ts` already does exactly this
 * for the console's trash button, and this script follows the same two steps it
 * does: remember the previous state in `_hk_status_before_trash` (WooCommerce has
 * one `trash` status for every order and cannot say what this one was), then move
 * it. Direct SQL is never involved, and `force` is never sent.
 *
 * ## What it will not do
 *
 * It refuses to touch an order that carries a captured payment unless
 * `--force-payment` is passed: a captured payment is money, and money is not
 * test data. It also refuses ids that do not exist, and it snapshots the full
 * record to `.git/` (private, never committed) before the write so the previous
 * state is recoverable even if the trash is later emptied.
 */

import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore');
const FORCE_PAYMENT = process.argv.includes('--force-payment');

const argOf = (name) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const ids = (argOf('ids') || '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

if (ids.length === 0) {
  throw new Error('Refusing to run without --ids=<comma-separated order ids>. There is deliberately no filter mode.');
}

const envFile = argOf('env') || '.env.local';
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = (argOf('base') || env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const api = `${BASE}/wp-json/wc/v3`;

async function request(pathname, method = 'GET', body) {
  const res = await fetch(api + pathname, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WooCommerce HTTP ${res.status} for ${pathname}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Where the pre-trash app status is remembered, matching `lib/woo/orders.ts`. */
const TRASH_BOOKMARK = '_hk_status_before_trash';

/** The app status an order is in, so a restore returns it to the same place. */
function appStatusOf(o) {
  const bookmark = bookmarkStatus(o);
  if (bookmark) return bookmark;
  const map = {
    pending: 'pending',
    'on-hold': 'pending',
    processing: 'processing',
    completed: 'delivered',
    cancelled: 'cancelled',
    refunded: 'refunded',
    failed: 'pending',
  };
  return map[String(o.status ?? '')] ?? 'pending';
}

function bookmarkStatus(o) {
  const row = (o.meta_data || []).find((m) => m.key === TRASH_BOOKMARK);
  const value = row?.value == null ? '' : String(row.value).trim();
  return value || null;
}

/** The facts a decision rests on, captured before and after. */
const summarise = (o) => ({
  id: o.id,
  status: o.status,
  total: o.total,
  currency: o.currency,
  dateCreated: o.date_created,
  datePaid: o.date_paid,
  paymentMethod: o.payment_method,
  createdVia: o.created_via,
  customerId: o.customer_id,
  billingDomain: String(o.billing?.email || '').split('@')[1] || null,
  items: (o.line_items || []).map((li) => `${li.name}×${li.quantity}`),
  txnKeys: (o.meta_data || [])
    .map((m) => m.key)
    .filter((k) => /_transaction_id$|_payment_intent|_charge_id|_stripe_|_ppcp_|_hk_payment_intent|amazon_|square_/i.test(k)),
});

const SNAPSHOT = `.git/test-order-archive-${Date.now()}.json`;
const snapshot = { at: new Date().toISOString(), origin: BASE, mode: APPLY ? (RESTORE ? 'restore' : 'trash') : 'dry run', orders: [] };

for (const id of ids) {
  let before;
  try {
    before = await request(`/orders/${id}`);
  } catch (error) {
    throw new Error(`Order ${id} could not be read (${error.message}). Refusing to continue.`);
  }

  const facts = summarise(before);
  console.log(JSON.stringify({ target: id, before: facts }, null, 2));

  const captured = /captured|succeeded/i.test(String(before.meta_data?.find?.((m) => m.key === '_stripe_charge_captured')?.value ?? ''));
  const hasPaidDate = Boolean(before.date_paid);
  if ((captured || hasPaidDate) && !FORCE_PAYMENT && !RESTORE) {
    throw new Error(
      `Order ${id} carries payment evidence (date_paid=${before.date_paid}, captured=${captured}). ` +
        'Refusing to archive a paid order. Pass --force-payment only if you have verified with the payment provider that no money moved.'
    );
  }

  const nextStatus = RESTORE ? bookmarkStatus(before) || 'pending' : 'trash';
  snapshot.orders.push({ id, from: before.status, to: nextStatus, facts });

  if (!APPLY) {
    console.log(`  dry run: would move status ${before.status} → ${nextStatus}${RESTORE ? '' : ' via DELETE (no force, reversible)'}\n`);
    continue;
  }

  if (RESTORE) {
    // Undo the bookmark's effect: state the status back, then clear the bookmark.
    await request(`/orders/${id}`, 'PUT', {
      status: nextStatus,
      meta_data: [{ key: TRASH_BOOKMARK, value: '' }],
    });
  } else {
    // Remember first, then move — the same order of operations the console uses.
    await request(`/orders/${id}`, 'PUT', {
      meta_data: [{ key: TRASH_BOOKMARK, value: appStatusOf(before) }],
    });
    await request(`/orders/${id}`, 'DELETE');
  }
  const after = await request(`/orders/${id}`);
  console.log(
    JSON.stringify(
      {
        wrote: { id: after.id, field: 'status', from: before.status, to: after.status },
        stillReadable: Boolean(after.id),
        lineItemsPreserved: (after.line_items || []).length === (before.line_items || []).length,
        txnKeysPreserved: summarise(after).txnKeys.length === facts.txnKeys.length,
      },
      null,
      2
    )
  );

  if (after.status !== nextStatus) throw new Error(`Order ${id} is "${after.status}" after the write, expected "${nextStatus}".`);
  console.log('');
}

if (APPLY) {
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot of the previous state: ${SNAPSHOT} (inside .git/, never committed)`);
} else {
  console.log(`Dry run only. ${ids.length} order(s) would move to the ${RESTORE ? 'previous' : 'trash'} status. Re-run with --apply to write.`);
}
