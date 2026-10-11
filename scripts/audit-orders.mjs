#!/usr/bin/env node
/**
 * Every order, classified against the payment provider that claims it.
 *
 *   node scripts/audit-orders.mjs
 *
 * ## Why each order is checked on its own
 *
 * The owner believes many orders were created during testing and wants the
 * operational dashboard to show genuine activity. That cannot be decided from the
 * order row alone, because WooCommerce's status is the *store's opinion*: a
 * completed order can exist without a captured payment (an owner marking it paid,
 * a gateway callback that never arrived), and a pending order can be a real
 * customer whose card was authorised but not captured. So each order is asked two
 * questions and classified on the answers:
 *
 *   1. Does it carry a transaction reference, and does the payment provider
 *      recognise that reference? `scripts/audit-orders.mjs` reads the reference
 *      from order meta and asks Stripe directly (read-only GET).
 *   2. Where did it come from? `created_via` distinguishes a checkout from an
 *      API call; a placeholder address domain distinguishes a form-filler's test
 *      from a customer.
 *
 * Classes, from the mission's own vocabulary:
 *
 *   A verified real paid        — a provider-recognised, captured payment
 *   B real awaiting payment     — a real-looking order with no captured payment
 *   C real refunded/cancelled   — refunded or cancelled, with order history
 *   D confirmed test-mode       — the provider says the payment was in test mode
 *   E confirmed manual test     — created via the API, or placeholder-address,
 *                                 with no payment behind it
 *   F failed genuine attempt    — a real attempt whose payment failed
 *   G unknown / needs review    — everything the evidence does not settle
 *
 * Ambiguity is reported as `G`. Nothing here writes to the store, and no new
 * payment is ever created.
 */

import fs from 'node:fs';
import path from 'node:path';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const envFile = argOf('env', '.env.local');
const readEnv = (file) => {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
};

const env = { ...readEnv(envFile), ...readEnv('../.freebuff/owner-secrets.live.local'), ...process.env };

const BASE = argOf('base', env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const wooAuth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const stripeKey = env.STRIPE_LIVE_SECRET || env.STRIPE_SECRET_KEY || '';
const stripeMode = env.STRIPE_LIVE_SECRET ? 'live key present' : env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY present' : 'no Stripe key';

/** A placeholder domain is a form-filler's, not a customer's. Kept narrow so a
 * real small business on an odd domain is not caught by it. */
const PLACEHOLDER = /@(example\.(com|org|net)|test\.(com|org)|localhost|invalid|mailinator\.com|guerrillamail\.com|yopmail\.com)$/i;

async function stripeGet(pathname) {
  if (!stripeKey) return { status: 0, body: { error: 'no key' } };
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
    cache: 'no-store',
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

console.log(`Order reconciliation against ${BASE} (read-only)`);
console.log(`Stripe: ${stripeMode}\n`);

const res = await fetch(`${BASE}/wp-json/wc/v3/orders?per_page=100`, {
  headers: { Authorization: wooAuth, Accept: 'application/json' },
  cache: 'no-store',
});
if (!res.ok) {
  console.error(`Orders could not be read: HTTP ${res.status}`);
  process.exit(1);
}
const orders = await res.json();

const report = [];

for (const o of orders) {
  const meta = Object.fromEntries((o.meta_data || []).map((m) => [m.key, m.value]));
  const txnKeys = Object.keys(meta).filter((k) =>
    /_transaction_id$|_payment_intent|_charge_id|_stripe_|_paypal_|_ppcp_|_amazon_|_square_/i.test(k)
  );

  /* Ask the provider about every reference the order carries. */
  const providerFindings = [];
  for (const key of txnKeys) {
    const value = String(meta[key] ?? '');
    if (!value) continue;
    if (/^pi_|^py_|^seti_/.test(value)) {
      const r = await stripeGet(`payment_intents/${encodeURIComponent(value)}`);
      providerFindings.push({ key, value, via: 'stripe/payment_intents', status: r.status, livemode: r.body?.livemode, state: r.body?.status, amount: r.body?.amount_received ?? r.body?.amount, currency: r.body?.currency });
    } else if (/^ch_/.test(value)) {
      const r = await stripeGet(`charges/${encodeURIComponent(value)}`);
      providerFindings.push({ key, value, via: 'stripe/charges', status: r.status, livemode: r.body?.livemode, state: r.body?.status, amount: r.body?.amount, currency: r.body?.currency, refunded: r.body?.refunded, paid: r.body?.paid });
    } else if (/^txn_/.test(value) || value.length > 6) {
      providerFindings.push({ key, value, via: 'unrecognised-reference', status: null });
    }
  }

  const paidViaProvider = providerFindings.some((f) => f.paid === true || f.state === 'succeeded' || f.state === 'captured');
  const testMode = providerFindings.some((f) => f.livemode === false);
  const placeholderAddress = PLACEHOLDER.test(String(o.billing?.email || '')) || PLACEHOLDER.test(String(o.billing?.address_1 || ''));
  const hasTransaction = providerFindings.length > 0 || txnKeys.length > 0;
  const isPaidStatus = ['completed', 'processing'].includes(o.status);
  const viaApi = o.created_via === 'rest-api';

  let classification;
  const reasons = [];
  if (testMode) {
    classification = 'D_confirmed_test_mode';
    reasons.push('provider reports livemode=false for a referenced payment');
  } else if (paidViaProvider && isPaidStatus) {
    classification = 'A_verified_real_paid';
    reasons.push('provider recognises the referenced payment and reports it captured');
  } else if (placeholderAddress && !paidViaProvider) {
    classification = 'E_confirmed_manual_test';
    reasons.push('placeholder address domain');
    if (viaApi) reasons.push('created through the API rather than a checkout');
    if (!hasTransaction) reasons.push('no transaction reference');
  } else if (viaApi && !paidViaProvider) {
    classification = 'E_confirmed_manual_test';
    reasons.push('created through the API with no provider-recognised payment');
  } else if (o.status === 'failed') {
    classification = 'F_failed_genuine_attempt';
    reasons.push('status failed');
  } else if (isPaidStatus && hasTransaction && providerFindings.every((f) => f.status === 404 || f.via === 'unrecognised-reference')) {
    classification = 'G_unknown_needs_review';
    reasons.push('status suggests payment, but no referenced payment could be recognised');
  } else if (isPaidStatus && !hasTransaction) {
    classification = 'G_unknown_needs_review';
    reasons.push('marked paid without any transaction reference');
  } else if (['pending', 'on-hold'].includes(o.status)) {
    classification = hasTransaction ? 'G_unknown_needs_review' : 'B_real_awaiting_payment';
    if (!hasTransaction) reasons.push('awaiting payment, no transaction reference');
  } else if (['cancelled', 'refunded'].includes(o.status)) {
    classification = 'C_real_refunded_or_cancelled';
  } else {
    classification = 'G_unknown_needs_review';
  }

  report.push({
    id: o.id,
    number: o.number,
    created: o.date_created,
    paid: o.date_paid || null,
    status: o.status,
    total: `${o.total} ${o.currency}`,
    paymentMethod: o.payment_method,
    createdVia: o.created_via,
    customerId: o.customer_id,
    // Masked: the manifest is for deciding, not for reading a customer list.
    billing: {
      domain: String(o.billing?.email || '').split('@')[1] || null,
      namePresent: Boolean((o.billing?.first_name || '').trim() || (o.billing?.last_name || '').trim()),
      addressPresent: Boolean((o.billing?.address_1 || '').trim()),
      country: o.billing?.country || null,
    },
    items: (o.line_items || []).map((li) => `${li.name}×${li.quantity}`),
    txnKeys,
    providerFindings,
    classification,
    reasons,
  });
}

/* --------------------------------------------------------------- reporting */

const counts = {};
for (const r of report) counts[r.classification] = (counts[r.classification] || 0) + 1;

console.log(`Orders read: ${report.length}\n`);
for (const r of report.sort((a, b) => a.created.localeCompare(b.created))) {
  console.log(
    `#${r.id} ${r.created.slice(0, 10)} ${r.status.padEnd(9)} ${String(r.total).padEnd(12)} ${String(r.paymentMethod).padEnd(26)} ` +
      `via=${String(r.createdVia).padEnd(9)} cust=${String(r.customerId).padEnd(3)} ${r.classification}`
  );
  console.log(`     items: ${r.items.join(' | ') || '(none)'}`);
  console.log(`     billing: domain=${r.billing.domain} name=${r.billing.namePresent} address=${r.billing.addressPresent} country=${r.billing.country}`);
  console.log(`     txn keys: ${r.txnKeys.join(', ') || '(none)'}`);
  for (const f of r.providerFindings) {
    console.log(`     provider[${f.via}] ${f.key} → HTTP ${f.status} livemode=${f.livemode} state=${f.state} amount=${f.amount} refunded=${f.refunded ?? '-'}`);
  }
  if (r.reasons.length) console.log(`     why: ${r.reasons.join('; ')}`);
  console.log('');
}

console.log('Classification counts:');
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);

const outDir = path.join(process.cwd(), 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-order-reconciliation`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'orders.json'), JSON.stringify(report, null, 2));
console.log(`\nManifest: backups/${path.basename(outDir)}/orders.json (gitignored)`);
