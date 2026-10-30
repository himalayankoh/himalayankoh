#!/usr/bin/env node
/**
 * Puts the owner's wholesale price list into the wholesale catalogue.
 *
 * ## What it imports, and what it refuses to
 *
 * The price list (Himalayan Koh, "WHOLESALE PRICE LIST") gives four facts per SKU: the
 * name, the SKU, the wholesale price a trade buyer pays, and the weight. It also gives
 * a case pack in the name — "(12 pcs / box)" — and a retail price, and it notes the
 * Texas delivery charge.
 *
 * So this writes: name, SKU, currency, **the wholesale price as the price tier** (that
 * is the sell side), the case pack as the MOQ, the weight converted to kilograms, and
 * the remaining facts as notes.
 *
 * It does **not** write an ex-factory cost or carton dimensions, because the file does
 * not contain them. Those are the two figures a landed cost and a pallet plan need, and
 * a guess at either would price a container on something nobody said. Until they are
 * entered, the calculator says so by name (a zero cost is flagged on the quote; a
 * product with no carton dimensions cannot be palletised) — which is the behaviour the
 * subsystem is built on.
 *
 * ## Idempotent
 *
 * A SKU already in the catalogue is updated rather than duplicated, so this can be run
 * again after the price list changes. `--dry-run` prints what it would do.
 *
 * Usage:
 *   node scripts/import-wholesale-catalogue.mjs --dry-run
 *   node scripts/import-wholesale-catalogue.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://127.0.0.1:3997').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry-run');
const TAG = 'HK-LIST';

function loadEnv() {
  const out = { ...process.env };
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!out[key]) out[key] = value;
  }
  return out;
}

const env = loadEnv();
const LB_TO_KG = 0.45359237;

/**
 * The sheet, as read. Grouped the way the list groups it, because the grouping is how
 * the owner thinks about the catalogue (human use, animal use, bulk).
 *
 * `casePack` is taken from the parenthetical in the name — it is a real shipping fact
 * (cartons are packed that way), and it is the honest MOQ: the list's own minimums are
 * stated per case ("Salt Block (Min. 90 pcs)", "Min. 30 pcs").
 */
const CATALOGUE = [
  { group: 'Edible salt (human use)', name: 'Himalayan Pink Edible Salt Fine Grain — 16 oz jar', sku: 'HK-ESF-16oz', wholesale: 6.75, retail: 9.95, weightLbs: 1, casePack: 12, packNote: '12 pcs / box' },
  { group: 'Edible salt (human use)', name: 'Himalayan Pink Edible Salt Coarse Grain — 16 oz jar', sku: 'HK-ESC-16oz', wholesale: 6.47, retail: 9.95, weightLbs: 1, casePack: 12, packNote: 'box quantity to confirm on the list' },
  { group: 'Edible salt (human use)', name: 'Himalayan Pink Edible Salt Fine Grain — 3 lb pouch', sku: 'HK-ESF-3lbs', wholesale: 8.75, retail: 14.95, weightLbs: 3, casePack: 6, packNote: '6 pcs / box' },
  { group: 'Edible salt (human use)', name: 'Himalayan Pink Edible Salt Fine Grain — 6 lb pouch', sku: 'HK-ESF-6lbs', wholesale: 12.75, retail: 19.95, weightLbs: 6, casePack: 3, packNote: '3 pcs / box' },
  { group: 'Salt blocks (animal use)', name: 'Himalayan Salt Block (rectangular) 8" × 4" × 1"', sku: 'HK-BFD-8-4-1', wholesale: 6.62, retail: 14.95, weightLbs: 2.5, casePack: 90, packNote: 'minimum 90 pcs' },
  { group: 'Salt licks (animal use)', name: 'Himalayan Salt Lick 1–2 lb', sku: 'HK-LFH-2lbs', wholesale: 8.75, retail: 12.95, weightLbs: 2, casePack: 6, packNote: '6 pcs / box' },
  { group: 'Salt licks (animal use)', name: 'Himalayan Salt Lick 3–4 lb', sku: 'HK-LFH-4lbs', wholesale: 9.75, retail: 14.95, weightLbs: 4, casePack: 4, packNote: '4 pcs / box' },
  { group: 'Salt licks (animal use)', name: 'Himalayan Salt Lick 5–6 lb', sku: 'HK-LFH-6lbs', wholesale: 12.75, retail: 19.95, weightLbs: 6, casePack: 4, packNote: '4 pcs / box (wholesale sheet); retail sheet quotes 3 pcs / box at 10.75 with a 30 pc minimum — confirm which applies to trade' },
  { group: 'Salt licks (animal use)', name: 'Himalayan Salt Lick 12–14 lb', sku: 'HK-LFH-14lbs', wholesale: 16.75, retail: 29.95, weightLbs: 14, casePack: 1, packNote: '1 pc / box' },
  { group: 'Salt licks (animal use)', name: 'Himalayan Salt Lick 30 lb', sku: 'HK-LFH-30lbs', wholesale: 26.75, retail: 39.95, weightLbs: 30, casePack: 1, packNote: 'sold singly' },
  { group: 'Granular salt pouches (animal use)', name: 'Himalayan Salt Fine Grain pouch — 3 lb', sku: 'HK-SFL-F-3lbs', wholesale: 8.75, retail: 14.95, weightLbs: 3, casePack: 6, packNote: '6 pcs / box' },
  { group: 'Granular salt pouches (animal use)', name: 'Himalayan Salt Coarse Grain pouch — 3 lb', sku: 'HK-SFL-C-3lbs', wholesale: 8.75, retail: 14.95, weightLbs: 3, casePack: 6, packNote: '6 pcs / box' },
  { group: 'Granular salt pouches (animal use)', name: 'Himalayan Salt Fine Grain pouch — 6 lb', sku: 'HK-SFL-F-6lbs', wholesale: 12.75, retail: 19.95, weightLbs: 6, casePack: 3, packNote: '3 pcs / box' },
  { group: 'Granular salt pouches (animal use)', name: 'Himalayan Salt Coarse Grain pouch — 6 lb', sku: 'HK-SFL-C-6lbs', wholesale: 12.75, retail: 19.95, weightLbs: 6, casePack: 3, packNote: '3 pcs / box' },
  { group: 'Bulk rock salt (delivery included on the list)', name: 'Himalayan Salt Fine Grain 0.5–1.0 mm — 45 lb', sku: 'HK-SFL-F-45lbs', wholesale: 34.57, retail: 49.95, weightLbs: 45, casePack: 1, packNote: 'delivery included on the owner’s list' },
  { group: 'Bulk rock salt (delivery included on the list)', name: 'Himalayan Salt Medium Grain 1.0–3.0 mm — 45 lb', sku: 'HK-SFL-M-45lbs', wholesale: 34.57, retail: 49.95, weightLbs: 45, casePack: 1, packNote: 'delivery included on the owner’s list' },
  { group: 'Bulk rock salt (delivery included on the list)', name: 'Himalayan Salt Coarse Grain 3.0–6.0 mm — 45 lb', sku: 'HK-SFL-C-45lbs', wholesale: 34.57, retail: 49.95, weightLbs: 45, casePack: 1, packNote: 'delivery included on the owner’s list' },
  { group: 'Bulk rock salt (delivery included on the list)', name: 'Himalayan Salt Block — 30 lb', sku: 'HK-LB-30LBS', wholesale: 34.75, retail: 49.95, weightLbs: 30, casePack: 1, packNote: 'delivery included on the owner’s list' },
  { group: 'Bulk rock salt (delivery included on the list)', name: 'Himalayan Rock Salt — 45 lb', sku: 'HK-LFC-45lbs', wholesale: 34.75, retail: 49.95, weightLbs: 45, casePack: 1, packNote: 'delivery included on the owner’s list' },
];

const TEXAS_DELIVERY_NOTE = 'Owner’s price list: shipping or delivery within Texas is USD 8 per box or bag.';

async function call(path, { method = 'GET', body, token = '' } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, ok: response.ok, json, text };
}

async function main() {
  const login = await call('/api/auth/admin/login', {
    method: 'POST',
    body: { username: env.WORDPRESS_ADMIN_USER, password: env.WORDPRESS_ADMIN_APP_PASSWORD },
  });
  if (!login.ok) {
    console.error(`admin sign-in failed: HTTP ${login.status}`);
    process.exit(1);
  }
  const token = login.json.token;

  const workspace = await call('/api/admin/wholesale/workspace', { token });
  if (!workspace.ok) {
    console.error(`workspace read failed: HTTP ${workspace.status} ${workspace.json?.error || ''}`);
    process.exit(1);
  }

  // Pakistan is where the goods come from; the origin row is whichever the installer
  // seeded for it. China stays as the alternative source.
  const origins = workspace.json.origins ?? [];
  const pakistan = origins.find((row) => /pakistan/i.test(String(row.country)) || /^PK/i.test(String(row.port))) ?? origins[0];
  const china = origins.find((row) => /china/i.test(String(row.country)) || /^CN/i.test(String(row.port)));
  console.log(`Origins: ${origins.map((row) => `${row.country}/${row.port}`).join(', ')}`);
  console.log(`Primary origin for this import: ${pakistan?.country}/${pakistan?.port}\n`);

  const existing = workspace.json.products ?? [];
  const bySku = new Map(existing.map((row) => [String(row.wholesale_sku || '').trim(), row]));

  let created = 0;
  let updated = 0;
  let failed = 0;
  const money = (value) => Number(value).toFixed(2);

  for (const entry of CATALOGUE) {
    const match = bySku.get(entry.sku);
    const notes = [
      `${TAG} — from the owner’s wholesale price list.`,
      `Retail price on the list: USD ${money(entry.retail)}.`,
      `Case pack: ${entry.packNote}.`,
      `Listed weight: ${entry.weightLbs} lb.`,
      TEXAS_DELIVERY_NOTE,
      // Said out loud, because these are the two figures the file does not contain and
      // both are needed before a container can be priced.
      'NOT on the price list: our ex-factory cost, and carton dimensions. Both must be entered before this product can be quoted or palletised.',
    ].join(' ');

    const data = {
      name: `${entry.name}`,
      wholesale_sku: entry.sku,
      ex_factory_cost: 0,
      currency: 'USD',
      moq: entry.casePack,
      net_unit_weight_kg: Math.round(entry.weightLbs * LB_TO_KG * 1000) / 1000,
      lead_time_days: 30,
      origin_id: pakistan ? Number(pakistan.id) : 0,
      supplier_id: 0,
      active: true,
      notes,
    };

    if (DRY) {
      console.log(`would ${match ? 'update' : 'create'} ${entry.sku.padEnd(14)} ${entry.name} — wholesale USD ${money(entry.wholesale)} · MOQ ${entry.casePack} · ${data.net_unit_weight_kg} kg`);
      continue;
    }

    const response = await call('/api/admin/wholesale/products', {
      method: 'POST',
      token,
      body: { id: match ? Number(match.id) : undefined, data },
    });
    if (!response.ok) {
      failed += 1;
      console.error(`FAILED ${entry.sku}: HTTP ${response.status} ${response.json?.error || ''}`);
      continue;
    }
    const productId = Number(response.json?.record?.id ?? match?.id ?? 0);
    if (match) updated += 1;
    else created += 1;

    // The wholesale price is the sell side, so it is a price tier rather than a cost.
    const tiers = (workspace.json.tiers ?? []).filter((tier) => Number(tier.product_id) === productId);
    const tierBody = { product_id: productId, min_units: entry.casePack, unit_price: entry.wholesale, currency: 'USD', notes: 'Wholesale price from the owner’s list.' };
    const tier = tiers.length
      ? await call('/api/admin/wholesale/price_tiers', { method: 'POST', token, body: { id: Number(tiers[0].id), data: tierBody } })
      : await call('/api/admin/wholesale/price_tiers', { method: 'POST', token, body: { data: tierBody } });
    if (!tier.ok) {
      failed += 1;
      console.error(`FAILED ${entry.sku} tier: HTTP ${tier.status} ${tier.json?.error || ''}`);
      continue;
    }
    console.log(`${match ? 'updated' : 'created'} ${entry.sku.padEnd(14)} ${entry.name.slice(0, 52).padEnd(54)} wholesale USD ${money(entry.wholesale)} · MOQ ${entry.casePack} · ${data.net_unit_weight_kg} kg`);
  }

  console.log(`\n${created} created · ${updated} updated · ${failed} failed${china ? ` · China (${china.port}) kept as the alternative origin` : ''}`);
  if (DRY) console.log('(dry run — nothing was written)');
}

main().catch((error) => {
  console.error('Import aborted:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
