/** Owner-requested preview parity. Dry-run first; preserve live IDs and variations.
 * --apply-existing updates verified existing matches only. --apply also adds the
 * genuine missing 30 lb SKU during Phase 2. Neither mode retires live records.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
const origins = ['https://wp.himalayankoh.com', 'https://wp.himalayankoh.com/staging'];
const credentials = ['.env.local', '.dev.vars'].map(file => dotenv.parse(fs.readFileSync(file)));
async function request(store, path, body, method = 'PUT') {
  const env = credentials[store];
  const response = await fetch(origins[store] + '/wp-json/wc/v3' + path, {
    method: body ? method : 'GET',
    headers: { Authorization: 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64'), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? 90000 : 30000),
  });
  if (!response.ok) throw new Error(`Store ${store}, ${path}: HTTP ${response.status}; inspect before retry.`);
  return response.json();
}
const [live, preview, liveUnit, previewUnit, liveCategories] = await Promise.all([
  request(0, '/products?per_page=100'), request(1, '/products?per_page=100'),
  request(0, '/settings/products/woocommerce_weight_unit'), request(1, '/settings/products/woocommerce_weight_unit'),
  request(0, '/products/categories?per_page=100'),
]);
if (liveUnit.value !== 'kg' || previewUnit.value !== 'lbs') throw new Error('Weight units changed; refusing conversion.');
const source = (id, sku) => {
  const p = preview.find(p => p.id === id);
  if (!p || p.status !== 'publish' || p.sku !== sku || !(Number(p.price) > 0) || !p.images?.length) throw new Error(`Preview ${id} is not a verified active SKU.`);
  return p;
};
const mappings = [
  { source: source(2653, 'HK-ESF-16oz'), liveId: 2446, slug: 'himalayan-edible-pink-salt', children: [2450] },
  { source: source(2710, 'HK-ESF-6lbs'), liveId: 2321, slug: 'pouches', children: [2322, 2323] },
  { source: source(2716, 'HK-LFC-45lbs'), liveId: 271, slug: 'bag-of-salt-for-livestock-45-lbs' },
  { source: source(2721, 'HK-LFH-2lbs'), liveId: 281, slug: 'salt-licks-for-horses', children: [1549], variantOnly: true },
  { source: source(2704, 'HK-ESF-3lbs'), liveId: 2461, slug: 'himalayan-koh-edible-salt-grain', children: [2466] },
];
const media = p => p.images.map(i => {
  const url = new URL(i.src);
  if (!['himalayankoh.com', 'wp.himalayankoh.com'].includes(url.hostname) || !url.pathname.startsWith('/staging/wp-content/uploads/')) throw new Error(`Unexpected original media on ${p.id}`);
  url.hostname = 'wp.himalayankoh.com'; url.protocol = 'https:';
  return { src: url.href, alt: i.alt || '', name: i.name || '' };
});
const kg = p => p.weight ? String(Number((Number(p.weight) * 0.45359237).toFixed(6))) : undefined;
const plans = [];
for (const mapping of mappings) {
  const p = live.find(p => p.id === mapping.liveId);
  if (!p || p.status !== 'publish' || p.slug !== mapping.slug || p.type !== (mapping.children ? 'variable' : 'simple')) throw new Error(`Live identity changed on ${mapping.liveId}`);
  const s = mapping.source;
  const images = p.meta_data?.some(m => m.key === '_hk_preview_source_id' && Number(m.value) === s.id) &&
    p.images.length === s.images.length && p.images.every((i, n) => i.name === s.images[n].name)
    ? p.images.map(i => ({ id: i.id })) : media(s);
  const patch = mapping.variantOnly
    ? { images, meta_data: [{ key: '_hk_preview_source_id', value: s.id }] }
    : { name: s.name, description: s.description, short_description: s.short_description, sku: s.sku, images,
        ...(kg(s) ? { weight: kg(s) } : {}), meta_data: [{ key: '_hk_preview_source_id', value: s.id }] };
  if (!mapping.children) Object.assign(patch, { regular_price: s.price, sale_price: '' });
  plans.push({ sourceId: s.id, liveId: p.id, path: `/products/${p.id}`, before: p, patch, categorySources: s.categories });
  if (mapping.children) {
    const rows = await request(0, `/products/${p.id}/variations?per_page=100`);
    for (const id of mapping.children) {
      const row = rows.find(v => v.id === id);
      if (!row || row.status !== 'publish' || !(Number(row.price) > 0) || row.attributes?.length !== 1) throw new Error(`Variation ${id} changed`);
      plans.push({ sourceId: s.id, liveId: id, path: `/products/${p.id}/variations/${id}`, before: row,
        patch: { regular_price: s.price, sale_price: '', ...(kg(s) ? { weight: kg(s) } : {}) }, parentId: p.id });
    }
  }
}
const thirty = source(2752, 'HK-LB-30LBS');
const thirtyExisting = live.filter(p => p.sku === thirty.sku);
if (thirtyExisting.length > 1) throw new Error('Duplicate 30 lb SKU; inspect source.');
const addition = thirtyExisting.length ? null : {
  name: thirty.name, slug: thirty.slug, type: 'simple', status: 'publish', sku: thirty.sku,
  description: thirty.description, short_description: thirty.short_description,
  regular_price: thirty.price, weight: kg(thirty), images: media(thirty),
  manage_stock: true, stock_quantity: 10, stock_status: 'instock',
  meta_data: [{ key: '_hk_preview_source_id', value: thirty.id }],
};
if (thirtyExisting.length) {
  const p = thirtyExisting[0];
  if (p.type !== 'simple' || !p.meta_data?.some(m => m.key === '_hk_preview_source_id' && Number(m.value) === thirty.id)) throw new Error('Existing 30 lb SKU provenance changed');
  plans.push({ sourceId: thirty.id, liveId: p.id, path: `/products/${p.id}`, before: p,
    patch: { images: p.images.map(i => ({ id: i.id })) }, categorySources: thirty.categories });
}
const report = { weightUnits: { live: liveUnit.value, preview: previewUnit.value },
  existingMatches: plans.map(({ before, ...plan }) => plan), addition,
  blocked: [{ sourceId: 2704, sku: 'HK-ESF-3lbs', reason: 'Owner selected preview reference: 3 lb SKU and shipping weight matched; original photo filenames mention 6 lb, so package-photo accuracy still needs review.' },
  ],
  ownerConfirmedSixLb: { liveId: 1548, packedWeightKg: 3, stockQuantity: 10 },
  retiredWithoutDeletion: [291, 1547, 2467, 2451], deployed: false };
console.log(JSON.stringify(report, null, 2));
const applyAll = process.argv.includes('--apply');
if (applyAll || process.argv.includes('--apply-existing')) {
  // Validate the original files before asking WooCommerce to import them.
  for (const url of new Set([...plans.flatMap(p => p.patch.images ?? []), ...(applyAll ? addition?.images ?? [] : [])].map(i => i.src).filter(Boolean))) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    await r.arrayBuffer();
    if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error('Original media unavailable; no catalog writes made.');
  }
  fs.writeFileSync(`.git/preview-catalog-before-${Date.now()}.json`, JSON.stringify({ plans, addition }, null, 2));
  const categoryMap = new Map(liveCategories.map(c => [c.slug, c.id]));
  async function categories(source) {
    const result = [];
    for (const c of source) {
      if (!categoryMap.has(c.slug)) {
        const created = await request(0, '/products/categories', { name: c.name, slug: c.slug }, 'POST');
        categoryMap.set(c.slug, created.id);
      }
      result.push({ id: categoryMap.get(c.slug) });
    }
    return result;
  }
  for (const plan of plans) {
    if (plan.categorySources) plan.patch.categories = await categories(plan.categorySources);
    if (plan.parentId) {
      const parent = await request(0, `/products/${plan.parentId}`);
      if (!parent.images?.[0]?.id) throw new Error('Matched parent image missing');
      plan.patch.image = { id: parent.images[0].id };
    }
    await request(0, plan.path, plan.patch);
    const after = await request(0, plan.path);
    for (const key of ['regular_price', 'sale_price', 'sku', 'weight', 'name', 'description', 'short_description']) {
      if (key in plan.patch && after[key] !== plan.patch[key]) throw new Error(`Read-back mismatch ${plan.liveId}.${key}; inspect before retry.`);
    }
    if (plan.patch.images && after.images.length !== plan.patch.images.length) throw new Error(`Media count mismatch on ${plan.liveId}`);
    if (plan.patch.categories && plan.patch.categories.some(c => !after.categories.some(a => a.id === c.id))) throw new Error('Category read-back failed');
    console.log(`Verified preview match ${plan.sourceId} -> ${plan.liveId}`);
  }
  if (applyAll && addition) {
    addition.categories = await categories(thirty.categories);
    // Never blindly retry a timed-out POST. Find this SKU on live first.
    const created = await request(0, '/products', addition, 'POST');
    console.log(`Created genuine preview 30 lb SKU as live ${created.id}`);
    fs.writeFileSync('.git/preview-30lb-created.json', JSON.stringify({ sourceId: thirty.id, liveId: created.id, sku: created.sku }));
  }
}
