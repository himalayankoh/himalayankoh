/** Set the owner's requested 10 units on priced, published storefront records.
 * Dry-run by default. Existing orders and unpriced/draft records are never touched.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
const preview = process.argv.includes('--preview');
const env = { ...dotenv.parse(fs.readFileSync(preview ? '.dev.vars' : '.env.local')), ...process.env };
const origin = preview ? 'https://wp.himalayankoh.com/staging' : 'https://wp.himalayankoh.com';
const api = origin + '/wp-json/wc/v3';
const headers = { Authorization: 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64'), 'Content-Type': 'application/json' };
async function request(path, patch) {
  const r = await fetch(api + path, { headers, method: patch ? 'PUT' : 'GET', ...(patch ? { body: JSON.stringify(patch) } : {}), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`WooCommerce HTTP ${r.status} for ${path}`);
  return r.json();
}
const catalogResponse = await fetch((preview ? 'https://preview.himalayankoh.com' : 'https://himalayankoh.com') + '/api/catalog', { signal: AbortSignal.timeout(45000) });
if (!catalogResponse.ok) throw new Error('Public catalog unavailable; refusing to guess valid records.');
const catalog = (await catalogResponse.json()).products;
if (!Array.isArray(catalog) || !catalog.length) throw new Error('Catalog is empty.');
const plans = [];
for (const item of catalog) {
  const parent = await request(`/products/${item.id}`);
  if (parent.status !== 'publish' || parent.slug !== item.slug || !parent.images?.length) throw new Error(`Product ${item.id} identity or publication changed.`);
  const rows = parent.type === 'variable' ? await request(`/products/${parent.id}/variations?per_page=100`) : [parent];
  for (const row of rows) {
    if (row.status !== 'publish' || !row.price?.trim() || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0) continue;
    // This storefront supports one explicitly addressed axis. Other combination
    // products need separate review, so a stock write cannot accidentally admit one.
    if (parent.type === 'variable' && row.attributes?.length !== 1) continue;
    const path = parent.type === 'variable' ? `/products/${parent.id}/variations/${row.id}` : `/products/${row.id}`;
    plans.push({ path, parentId: parent.id, id: row.id, sku: row.sku || null,
      before: { manage_stock: row.manage_stock, stock_quantity: row.stock_quantity, stock_status: row.stock_status },
      after: { manage_stock: true, stock_quantity: 10, stock_status: 'instock' } });
  }
}
console.log(JSON.stringify({ origin, apply: process.argv.includes('--apply'), plans }, null, 2));
if (process.argv.includes('--apply')) {
  const file = `.git/stock-10-${preview ? 'preview' : 'production'}-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify({ origin, plans }, null, 2));
  for (const plan of plans) {
    if (JSON.stringify(plan.before) !== JSON.stringify(plan.after)) await request(plan.path, plan.after);
    const after = await request(plan.path);
    if (!after.manage_stock || after.stock_quantity !== 10 || after.stock_status !== 'instock') throw new Error(`Stock read-back failed for ${plan.id}; inspect before retry.`);
    console.log(`Verified ${plan.id}: 10 units, in stock`);
  }
}
