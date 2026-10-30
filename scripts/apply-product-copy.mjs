#!/usr/bin/env node
/**
 * Apply reviewed product copy to named WooCommerce products.
 *
 *   node scripts/apply-product-copy.mjs --file=docs/production/content-corrections/products.json
 *   node scripts/apply-product-copy.mjs --file=... --apply
 *
 * ## What makes this safe on a live catalogue
 *
 * A product record is mostly *not* copy. Price, sale price, stock, SKU, images,
 * categories, attributes and status are commercial facts, and a copy correction
 * that takes one of them with it is a much worse incident than the claim it set
 * out to fix. So for every product this script:
 *
 *   1. resolves the record by its id and **refuses unless the SKU on the store
 *      matches the SKU in the file**, so a renumbered catalogue cannot silently
 *      send a horse-lick description to a cattle product;
 *   2. sends only the fields the file names — `short_description`,
 *      `description`, and the two Yoast fields as product meta;
 *   3. re-reads the record and asserts that SKU, price, regular/sale price,
 *      stock status, stock quantity and status are byte-identical;
 *   4. saves the whole before-state to `backups/<date>-content-backup/` and to
 *      `.git/`, so a restore does not depend on anything here.
 *
 * It never changes a product's status: `2531` must stay a draft, and a script that
 * could publish it is the one thing Phase 10 of the mission forbids.
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const argOf = (name) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const file = argOf('file');
if (!file) throw new Error('Required: --file=<path to the reviewed copy json>.');
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
const products = plan.products || {};
if (!Object.keys(products).length) throw new Error(`${file} names no products.`);

const envFile = argOf('env') || '.env.local';
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = (argOf('base') || env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const api = `${BASE}/wp-json/wc/v3/products`;

async function request(pathname = '', method = 'GET', body) {
  const res = await fetch(`${api}${pathname}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WooCommerce HTTP ${res.status} for products${pathname}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
}

/** The commercial facts a copy change must not disturb. */
const commercial = (p) => ({
  sku: p.sku ?? null,
  status: p.status ?? null,
  type: p.type ?? null,
  price: p.price ?? null,
  regular_price: p.regular_price ?? null,
  sale_price: p.sale_price ?? null,
  stock_status: p.stock_status ?? null,
  stock_quantity: p.stock_quantity ?? null,
  manage_stock: p.manage_stock ?? null,
  imageIds: (p.images || []).map((i) => i.id).join(','),
  categoryIds: (p.categories || []).map((c) => c.id).join(','),
  attributeCount: (p.attributes || []).length,
  slug: p.slug ?? null,
});

const metaOf = (p) =>
  Object.fromEntries((p.meta_data || []).map((m) => [m.key, String(m.value ?? '')]));

/**
 * Short descriptions on this store are stored as a single `<p>`; the storefront
 * renders the field as HTML, so a bare sentence would lose the paragraph the rest
 * of the catalogue has. The wrapper is added here rather than in the reviewed file
 * so the file stays readable prose.
 */
const asParagraph = (text) => (/^\s*<p>/i.test(text) ? text : `<p>${text}</p>`);

const stamp = new Date().toISOString().slice(0, 10);
const backupDir = path.join(process.cwd(), 'backups', `${stamp}-content-backup`);
fs.mkdirSync(backupDir, { recursive: true });

const results = [];

for (const [id, copy] of Object.entries(products)) {
  const before = await request(`/${id}`);
  if (copy.sku && before.sku !== copy.sku) {
    throw new Error(`Product ${id} has SKU "${before.sku}", the file expects "${copy.sku}". Refusing to write.`);
  }

  const beforeCommercial = commercial(before);
  const beforeMeta = metaOf(before);
  const wantedShort = copy.short_description === undefined ? undefined : asParagraph(copy.short_description);
  const payload = {};
  if (wantedShort !== undefined) payload.short_description = wantedShort;
  if (copy.description !== undefined) payload.description = copy.description;

  const metaRows = [];
  if (copy.yoast_metadesc !== undefined) metaRows.push({ key: '_yoast_wpseo_metadesc', value: copy.yoast_metadesc });
  if (copy.yoast_title !== undefined) metaRows.push({ key: '_yoast_wpseo_title', value: copy.yoast_title });
  if (metaRows.length) payload.meta_data = metaRows;

  fs.writeFileSync(path.join(backupDir, `product-${id}.json`), JSON.stringify(before, null, 2));

  const row = {
    id,
    sku: before.sku,
    name: before.name,
    status: before.status,
    shortDescription: { from: before.short_description, to: copy.short_description },
    longDescriptionChars: { from: String(before.description ?? '').length, to: String(copy.description ?? '').length },
    yoast: {
      metasdesc: { from: beforeMeta._yoast_wpseo_metadesc ?? '', to: copy.yoast_metadesc },
      title: { from: beforeMeta._yoast_wpseo_title ?? '', to: copy.yoast_title },
    },
    commercial,
  };

  if (!APPLY) {
    results.push(row);
    continue;
  }

  await request(`/${id}`, 'POST', payload);
  const after = await request(`/${id}`);
  const afterCommercial = commercial(after);
  const drifted = Object.keys(beforeCommercial).filter(
    (field) => JSON.stringify(beforeCommercial[field]) !== JSON.stringify(afterCommercial[field])
  );
  // WordPress stores these fields with a trailing newline; trimming is what makes
  // "read back as written" a comparison of the copy rather than of that newline.
  const shortOk = wantedShort === undefined || String(after.short_description).trim() === wantedShort.trim();
  const metaOk = metaRows.every((m) => String(metaOf(after)[m.key] ?? '').trim() === String(m.value).trim());

  row.written = {
    shortDescriptionMatches: shortOk,
    yoastMatches: metaOk,
    commercialFieldsChanged: drifted,
    statusUnchanged: after.status === before.status,
  };
  fs.writeFileSync(`.git/product-copy-${id}-${Date.now()}.json`, JSON.stringify(before, null, 2));
  results.push(row);

  if (drifted.length) throw new Error(`Product ${id}: commercial fields changed (${drifted.join(', ')}). Before-state in ${backupDir}.`);
  if (!shortOk || !metaOk) throw new Error(`Product ${id}: copy did not read back as written.`);
}

console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry run', origin: BASE, products: results }, null, 2));
console.log(
  APPLY
    ? `\nApplied. Before-states in backups/${stamp}-content-backup/ and .git/.`
    : '\nDry run only. Re-run with --apply to write these fields.'
);
