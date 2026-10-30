/** Exact owner decisions, 2026-10-11. Dry-run by default.
 * Retire unmatched listings with draft status; preserve IDs and order history.
 * Publish real 6 lb child at its confirmed 3 kg packed weight, 10 units.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('.env.local'));
const base = 'https://wp.himalayankoh.com/wp-json/wc/v3';
const headers = { Authorization: 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64'), 'Content-Type': 'application/json' };
async function request(path, patch) {
  const r = await fetch(base + path, { headers, method: patch ? 'PUT' : 'GET', ...(patch ? { body: JSON.stringify(patch) } : {}), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Woo HTTP ${r.status} on ${path}`);
  return r.json();
}
const [parent, licks, fine, eighteen, jar] = await Promise.all([
  request('/products/281'), request('/products/281/variations?per_page=100'),
  request('/products/2461/variations?per_page=100'), request('/products/291'), request('/products/2446/variations?per_page=100'),
]);
for (const [id, value, weight] of [[1549, '2 lbs.', null], [1547, '4 lbs.', '1.814'], [1548, '6 lbs.', '3']]) {
  const v = licks.find(v => v.id === id);
  if (!v || v.attributes?.[0]?.option !== value || (weight && v.weight !== weight)) throw new Error(`Lick ${id} identity/weight changed`);
}
if (parent.slug !== 'salt-licks-for-horses' || eighteen.slug !== 'rock-of-salt' || !fine.find(v => v.id === 2466 && v.attributes?.[0]?.option === '3 lbs') || !fine.find(v => v.id === 2467 && v.attributes?.[0]?.option === '6 lbs')) throw new Error('Source identity changed');
if (!jar.find(v => v.id === 2451 && v.attributes?.[0]?.option === 'Coarse Grain' && v.price === '')) throw new Error('Unpriced unmatched jar identity changed');
const plans = [
  { path: '/products/2446/variations/2451', before: jar.find(v => v.id === 2451), patch: { status: 'draft' } },
  { path: '/products/281', before: parent, patch: { attributes: parent.attributes.map(a => a.name === 'Size/Weight' ? { ...a, options: ['2 lbs.', '6 lbs.'] } : a) } },
  { path: '/products/281/variations/1549', before: licks.find(v => v.id === 1549), patch: { sku: 'HK-LFH-2lbs' } },
  { path: '/products/281/variations/1548', before: licks.find(v => v.id === 1548), patch: { status: 'publish', sku: 'HK-LFH-6lbs', manage_stock: true, stock_quantity: 10, stock_status: 'instock' } },
  { path: '/products/281/variations/1547', before: licks.find(v => v.id === 1547), patch: { status: 'draft' } },
  { path: '/products/2461/variations/2466', before: fine.find(v => v.id === 2466), patch: { manage_stock: true, stock_quantity: 10, stock_status: 'instock' } },
  { path: '/products/2461/variations/2467', before: fine.find(v => v.id === 2467), patch: { status: 'draft' } },
  { path: '/products/291', before: eighteen, patch: { status: 'draft' } },
];
console.log(JSON.stringify({ plans: plans.map(({ before, ...p }) => p), ordersTouched: false }, null, 2));
if (process.argv.includes('--apply')) {
  fs.writeFileSync(`.git/owner-catalog-before-${Date.now()}.json`, JSON.stringify(plans, null, 2));
  for (const plan of plans) {
    await request(plan.path, plan.patch);
    const after = await request(plan.path);
    for (const key of Object.keys(plan.patch).filter(k => k !== 'attributes')) if (after[key] !== plan.patch[key]) throw new Error(`Read-back failed ${plan.path}.${key}`);
    if (plan.patch.attributes && JSON.stringify(after.attributes.find(a => a.name === 'Size/Weight')?.options) !== JSON.stringify(['2 lbs.', '6 lbs.'])) throw new Error('Option read-back failed');
    console.log(`Verified owner selection: ${plan.path}`);
  }
}
