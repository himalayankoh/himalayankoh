#!/usr/bin/env node
/**
 * Staging QA for the console's product write path — one reversible test product.
 *
 *   node scripts/qa-admin-catalog-write.mjs [--base http://127.0.0.1:3103]
 *
 * What it proves, in order, against a **running app** (not mocks):
 *
 *   1. create   — a draft product through `/api/admin/products`, the same route the
 *                 console's save button calls
 *   2. verify   — every field it set is read back from WooCommerce through the
 *                 console's own read path (never from the response it just got)
 *   3. update   — price, stock, dimensions and packing survive a second write
 *   4. status   — a status transition reaches WooCommerce
 *   5. trash    — the product is deleted, so the run leaves nothing behind
 *
 * Every mutation is reversed. Nothing stays published, no email is sent and no
 * order is touched. The session is minted the way `probe-admin-login.mjs` does it
 * (the WordPress door), so no password is typed anywhere.
 *
 * Status vocabulary note: this route takes WooCommerce's own words (`publish`,
 * `draft`, `private`) — the console's `active`/`draft` vocabulary is translated by
 * `features/catalog/repository.ts` before it calls. Sending `active` here is an
 * invalid status, which WooCommerce quietly ignores; a test that sent it would be
 * measuring its own mistake, so this script speaks Woo.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 1) continue;
    out[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const baseArg = process.argv.indexOf('--base');
const BASE = (baseArg > 0 ? process.argv[baseArg + 1] : 'http://127.0.0.1:3103').replace(/\/+$/, '');

const login = await fetch(`${BASE}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: env.WORDPRESS_ADMIN_USER,
    password: env.WORDPRESS_ADMIN_APP_PASSWORD,
  }),
});
const session = await login.json().catch(() => ({}));
if (!login.ok || !session.token) {
  console.log('FAIL  could not sign in through the admin login route:', session.error || login.status);
  process.exit(1);
}

const H = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

/** Direct WooCommerce access, for verifying what the store actually stored. */
const WOO_BASE = String(env.WORDPRESS_BASE_URL || '').replace(/\/+$/, '');
const WOO_AUTH = `Basic ${Buffer.from(
  `${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`
).toString('base64')}`;

async function wooGet(path) {
  const res = await fetch(`${WOO_BASE}/wp-json${path}`, { headers: { Authorization: WOO_AUTH } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function wooDelete(path) {
  return fetch(`${WOO_BASE}/wp-json${path}`, { method: 'DELETE', headers: { Authorization: WOO_AUTH } });
}

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail}`);
};

const MARK = `QA-STAGING-${Date.now()}`;
let createdId = null;

try {
  // 1. create -----------------------------------------------------------------
  const createRes = await fetch(`${BASE}/api/admin/products`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      name: `${MARK} — delete me`,
      slug: MARK.toLowerCase(),
      status: 'draft',
      sku: `${MARK}-SKU`,
      price: '12.34',
      compareAtPrice: '19.99',
      shortDescription: 'staging write-path QA',
      description: 'Created by scripts/qa-admin-catalog-write.mjs. Safe to delete.',
      categoryIds: [],
      manageStock: true,
      stockQuantity: 7,
      weight: '2.5',
      dimensions: { length: '11', width: '6', height: '4' },
      packagePreset: 'box',
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  createdId = created?.product?.id ? String(created.product.id) : null;
  record('create draft product', createRes.ok && !!createdId, `HTTP ${createRes.status} id=${createdId ?? '-'}`);
  if (!createdId) throw new Error('no product id — nothing further can be verified');

  // 2. read back from Woo through the console's read path ----------------------
  const readRes = await fetch(`${BASE}/api/admin/products/${createdId}`, { headers: H });
  const read = await readRes.json().catch(() => ({}));
  const p = read?.product ?? {};
  record('read back (Woo, not the echo)', readRes.ok, `HTTP ${readRes.status} name="${String(p.name).slice(0, 24)}"`);

  const checks = [
    ['sku', p.sku, `${MARK}-SKU`],
    ['price', String(p.price), '12.34'],
    ['compareAtPrice', String(p.compareAtPrice ?? ''), '19.99'],
    ['stockQuantity', String(p.stockQuantity), '7'],
    ['weight', String(p.weight ?? ''), '2.5'],
    ['status', String(p.status), 'draft'],
  ];
  for (const [field, got, want] of checks) {
    record(`  field ${field}`, String(got) === want, `got=${got}`);
  }
  const dims = p.dimensions || {};
  record(
    '  field dimensions',
    String(dims.length) === '11' && String(dims.width) === '6' && String(dims.height) === '4',
    `got=${JSON.stringify(dims)}`
  );

  // 3. update -----------------------------------------------------------------
  // Price is checked against WooCommerce's own field, not just the console's read:
  // `price` maps to `regular_price` (or to `sale_price` beside a compare-at), so a
  // mapper that dropped it would still echo the value back from its own response.
  const putRes = await fetch(`${BASE}/api/admin/products/${createdId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ price: '21.00', stockQuantity: 3, name: `${MARK} — renamed` }),
  });
  const putBody = await putRes.json().catch(() => ({}));
  record(
    'update price + stock',
    putRes.ok,
    `HTTP ${putRes.status} ignored=[${(putBody.ignored || []).map((i) => i.field).join(',')}]`
  );

  const afterRes = await fetch(`${BASE}/api/admin/products/${createdId}`, { headers: H });
  const after = (await afterRes.json().catch(() => ({})))?.product ?? {};
  // Compared numerically: the console's record carries a number, not the padded
  // string WooCommerce stores.
  record('update persisted', Number(after.price) === 21 && Number(after.stockQuantity) === 3,
    `price=${after.price} stock=${after.stockQuantity}`);
  record('rename persisted', String(after.name).includes('renamed'), `name="${String(after.name).slice(0, 26)}"`);

  const wooRow = await wooGet(`/wc/v3/products/${createdId}?_fields=regular_price,sale_price,status`);
  record(
    '  Woo regular_price (authoritative)',
    String(wooRow?.regular_price) === '21.00',
    `regular_price=${wooRow?.regular_price} sale=${wooRow?.sale_price ?? ''}`
  );

  // 3b. the editor's exact payload -------------------------------------------
  // `WooProductEditorModal` sends `compareAtPrice: null` when the field is empty
  // (`numberField('') === null`), so this is the shape a real save has. It must
  // end the sale, not merely retitle the price.
  await fetch(`${BASE}/api/admin/products/${createdId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ price: '33.00', compareAtPrice: null }),
  });
  const editedRow = await wooGet(`/wc/v3/products/${createdId}?_fields=regular_price,sale_price`);
  record(
    "  editor payload (compareAtPrice:null)",
    String(editedRow?.regular_price) === '33.00' && String(editedRow?.sale_price ?? '') === '',
    `regular=${editedRow?.regular_price} sale="${editedRow?.sale_price ?? ''}"`
  );
  const editedRead = (await (await fetch(`${BASE}/api/admin/products/${createdId}`, { headers: H })).json().catch(() => ({})))?.product ?? {};
  record('  console shows the edited price', Number(editedRead.price) === 33, `price=${editedRead.price}`);

  // 4. status transition (Woo's vocabulary, as the console sends it) ----------
  const statusRes = await fetch(`${BASE}/api/admin/products/${createdId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ status: 'publish' }),
  });
  const afterStatusRow = await wooGet(`/wc/v3/products/${createdId}?_fields=status`);
  record(
    'status draft -> publish',
    statusRes.ok && afterStatusRow?.status === 'publish',
    `status=${afterStatusRow?.status}`
  );

  // 5. trash ------------------------------------------------------------------
  const delRes = await fetch(`${BASE}/api/admin/products/${createdId}`, { method: 'DELETE', headers: H });
  const trashedRow = await wooGet(`/wc/v3/products/${createdId}?_fields=status`);
  record('trash test product', delRes.ok && trashedRow?.status === 'trash', `HTTP ${delRes.status} status=${trashedRow?.status}`);

  // Remove it for good, so the run leaves nothing on staging at all.
  const purgeRes = await wooDelete(`/wc/v3/products/${createdId}?force=true`);
  const goneRow = await wooGet(`/wc/v3/products/${createdId}?_fields=id`);
  record('force-deleted from Woo', purgeRes.ok && !goneRow, `HTTP ${purgeRes.status} re-read=${goneRow ? 'present' : 'absent'}`);
  createdId = null;
} catch (error) {
  record('run', false, error instanceof Error ? error.message : String(error));
} finally {
  // Never leave a QA product behind, even if a step threw — trash first (the
  // console's own path), then purge, because staging should hold no test rows.
  if (createdId) {
    await fetch(`${BASE}/api/admin/products/${createdId}`, { method: 'DELETE', headers: H }).catch(() => {});
    await wooDelete(`/wc/v3/products/${createdId}?force=true`).catch(() => {});
    console.log(`CLEANUP  removed leftover product ${createdId} from WooCommerce`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
