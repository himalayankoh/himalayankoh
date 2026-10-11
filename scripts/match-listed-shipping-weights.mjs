/** Owner decision 2026-10-11: use listed net sizes, superseding the 3 kg 6 lb lick.
 * Dry run by default. Writes weight only on verified current catalog records.
 * Does not change the store's kg setting, prices, stock, attributes or orders.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('.env.local'));
const base = 'https://wp.himalayankoh.com/wp-json/wc/v3';
const headers = { Authorization: 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64'), 'Content-Type': 'application/json' };
async function request(path, weight) {
  const r = await fetch(base + path, { headers, method: weight === undefined ? 'GET' : 'PUT',
    ...(weight === undefined ? {} : { body: JSON.stringify({ weight }) }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Woo HTTP ${r.status} on ${path}`);
  return r.json();
}
if ((await request('/settings/products/woocommerce_weight_unit')).value !== 'kg') throw new Error('Store weight unit changed; inspect before applying.');
const catalog = [
  [1549, 281, 'HK-LFH-2lbs', 2], [1548, 281, 'HK-LFH-6lbs', 6],
  [2466, 2461, 'HK-ESF-3lbs', 3], [2450, 2446, 'HK-ESF-16oz', 1],
  [2322, 2321, 'HK-ESF-6lbs', 6], [2323, 2321, 'HK-ESF-6lbs', 6],
  [2520, null, 'HK-LB-30LBS', 30], [271, null, 'HK-LFC-45lbs', 45],
  // Uniform-size parents inherit the same mass. The mixed 2/6 lb parent stays unset.
  [2446, null, 'HK-ESF-16oz', 1], [2461, null, 'HK-ESF-3lbs', 3], [2321, null, 'HK-ESF-6lbs', 6],
];
const protectedFacts = p => JSON.stringify({ price:p.price, regular_price:p.regular_price, sale_price:p.sale_price,
  manage_stock:p.manage_stock, stock_quantity:p.stock_quantity, stock_status:p.stock_status,
  sku:p.sku, name:p.name, slug:p.slug, status:p.status, attributes:p.attributes });
const plans = [];
for (const [id, parent, sku, pounds] of catalog) {
  const before = await request(`/products/${id}`);
  if (before.id !== id || before.status !== 'publish' || before.sku !== sku || (parent && before.parent_id !== parent)) throw new Error(`Catalog identity changed on ${id}`);
  const weight = String(Number((pounds * 0.45359237).toFixed(6)));
  if (Number(before.weight) !== Number(weight)) plans.push({ id, parent, sku, pounds, weight, previousWeight:before.weight, protected:protectedFacts(before) });
}
console.log(JSON.stringify({ dryRun:!process.argv.includes('--apply'), changes:plans.map(({ protected: _, ...p }) => p) }, null, 2));
if (process.argv.includes('--apply')) {
  fs.writeFileSync(`.git/listed-weight-backup-${Date.now()}.json`, JSON.stringify(plans, null, 2));
  for (const plan of plans) {
    const latest = await request(`/products/${plan.id}`);
    if (latest.weight !== plan.previousWeight || protectedFacts(latest) !== plan.protected) throw new Error(`Record ${plan.id} changed since planning; stop and inspect.`);
    const path = plan.parent ? `/products/${plan.parent}/variations/${plan.id}` : `/products/${plan.id}`;
    await request(path, plan.weight);
    const after = await request(`/products/${plan.id}`);
    if (Number(after.weight) !== Number(plan.weight) || protectedFacts(after) !== plan.protected) throw new Error(`Read-back failed ${plan.id}; inspect saved backup.`);
    console.log(`Verified ${plan.id}: ${plan.pounds} lb (${after.weight} kg)`);
  }
}
