/** Owner-authorized replacement, not SKU matching. No order/customer writes.
 * Prepare six unpublished copies first, verify originals, then soft-trash old
 * products (force=false), assign original SKUs/slugs and publish the copies.
 * A journal records every ID; a failed POST is never automatically retried.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const expected = new Map([[2752, 'HK-LB-30LBS'], [2721, 'HK-LFH-2lbs'],
  [2716, 'HK-LFC-45lbs'], [2710, 'HK-ESF-6lbs'], [2704, 'HK-ESF-3lbs'], [2653, 'HK-ESF-16oz']]);
const journalPath = 'qa-visual-artifacts/preview-replacement-journal.json';

export function sourceSnapshot(products) {
  // Woo randomizes related_ids on GET; this is not an authored catalog edit.
  return products.map(({ related_ids: _randomRecommendations, ...product }) => product);
}

export function previewCopy(source, units) {
  if (units.liveWeight !== 'kg' || units.previewWeight !== 'lbs' || units.liveDimensions !== 'cm' || units.previewDimensions !== 'in') {
    throw new Error('Unexpected unit settings; refusing to reinterpret weights/dimensions.');
  }
  if (source.type !== 'simple' || source.status !== 'publish' || expected.get(source.id) !== source.sku ||
      !source.images?.length || !(Number(source.price) > 0) || source.stock_quantity !== 10 || !source.manage_stock) {
    throw new Error(`Preview ${source.id} no longer matches the six approved active listings.`);
  }
  // The owner previously confirmed 16 oz = 1 lb; preview left Woo weight blank.
  const lbs = source.weight === '' && source.sku === 'HK-ESF-16oz' ? 1 : Number(source.weight);
  if (!(lbs > 0)) throw new Error(`Missing verified weight for ${source.id}`);
  const fields = ['name', 'type', 'description', 'short_description', 'featured', 'catalog_visibility',
    'regular_price', 'sale_price', 'date_on_sale_from', 'date_on_sale_to', 'tax_status', 'tax_class',
    'manage_stock', 'stock_quantity', 'stock_status', 'backorders', 'sold_individually',
    'virtual', 'downloadable', 'reviews_allowed', 'purchase_note', 'menu_order'];
  const copy = Object.fromEntries(fields.filter(k => source[k] !== undefined).map(k => [k, source[k]]));
  copy.weight = String(Number((lbs * 0.45359237).toFixed(6)));
  copy.dimensions = Object.fromEntries(Object.entries(source.dimensions).map(([key, value]) =>
    [key, value === '' ? '' : String(Number((Number(value) * 2.54).toFixed(6)))]));
  // Attribute IDs and media IDs belong to separate WordPress installations.
  copy.attributes = source.attributes.map(a => ({ name: a.name, position: a.position,
    visible: a.visible, variation: a.variation, options: a.options }));
  copy.images = source.images.map(i => {
    const url = new URL(i.src);
    if (!['wp.himalayankoh.com', 'himalayankoh.com'].includes(url.hostname) || !url.pathname.startsWith('/staging/wp-content/uploads/')) {
      throw new Error(`Unrecognized original image for ${source.id}`);
    }
    url.hostname = 'wp.himalayankoh.com'; url.protocol = 'https:';
    return { src: url.href, name: i.name || '', alt: i.alt || '' };
  });
  copy.meta_data = source.meta_data.filter(m => /^_himalayan_koh_|^_yoast_wpseo_|^_hk_packing_profile$/.test(m.key) &&
    !/^_himalayan_koh_delivery_(min|max)_days$/.test(m.key)).map(({ key, value }) => ({ key, value }));
  const spec = copy.meta_data.find(m => m.key === '_himalayan_koh_specifications');
  const specifications = spec ? (typeof spec.value === 'string' ? JSON.parse(spec.value) : spec.value) : {};
  // Native Woo weight wins over stale preview 2 lb metadata containing 6 lb.
  const corrected = JSON.stringify({ ...specifications, weightLbs: lbs, weightOz: lbs * 16 });
  if (spec) spec.value = corrected;
  else copy.meta_data.push({ key: '_himalayan_koh_specifications', value: corrected });
  copy.meta_data.push({ key: '_hk_preview_source_id', value: source.id },
    { key: '_hk_preview_replacement', value: '2026-10-11' });
  return copy;
}

function verifyCopy(after, patch) {
  for (const key of ['name', 'type', 'description', 'short_description', 'regular_price', 'sale_price',
    'weight', 'manage_stock', 'stock_quantity', 'stock_status', 'virtual', 'downloadable']) {
    if (key in patch) assert.deepEqual(after[key], patch[key], `${after.id}.${key}`);
  }
  assert.deepEqual(after.dimensions, patch.dimensions);
  assert.equal(after.images.length, patch.images.length);
  assert.deepEqual(after.images.map(i => i.name), patch.images.map(i => i.name));
  for (const m of patch.meta_data) {
    const value = after.meta_data.find(a => a.key === m.key)?.value;
    if (m.key === '_hk_preview_source_id') assert.equal(Number(value), Number(m.value));
    else assert.deepEqual(value, m.value, `${after.id}.${m.key}`);
  }
}

async function reuseOriginalMedia(images, existing) {
  const out = [];
  for (const image of images) {
    const candidate = existing.find(i => i.name === image.name);
    if (!candidate) { out.push(image); continue; }
    const hashes = await Promise.all([image.src, candidate.src].map(async url => {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error('Original-media verification failed.');
      return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
    }));
    // Only reuse a media ID when the complete original bytes agree, not its name.
    out.push(hashes[0] === hashes[1] ? { id: candidate.id, name: image.name, alt: image.alt } : image);
  }
  return out;
}

export async function replaceWithPreview(request, apply, resume = false) {
  const priorJournal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath)) : null;
  if (apply && priorJournal && (!resume || priorJournal.state !== 'preparing')) throw new Error('Journal exists; only a verified preparation can resume.');
  const [sources, allParents, lw, pw, ld, pd, liveCategories, liveTags] = await Promise.all([
    request(1, '/products?status=publish&per_page=100'), request(0, '/products?status=any&per_page=100'),
    request(0, '/settings/products/woocommerce_weight_unit'), request(1, '/settings/products/woocommerce_weight_unit'),
    request(0, '/settings/products/woocommerce_dimension_unit'), request(1, '/settings/products/woocommerce_dimension_unit'),
    request(0, '/products/categories?per_page=100'), request(0, '/products/tags?per_page=100'),
  ]);
  const prepared = allParents.filter(p => p.meta_data.some(m => m.key === '_hk_preview_replacement'));
  if (prepared.some(p => !priorJournal?.created.some(c => c.liveId === p.id))) throw new Error('Unjournalled copy exists; inspect rather than retry a POST.');
  const oldParents = allParents.filter(p => !prepared.includes(p));
  assert.equal(sources.length, expected.size, 'Preview active catalog changed');
  if (oldParents.length >= 100) throw new Error('Catalog requires pagination before any writes.');
  const units = { liveWeight: lw.value, previewWeight: pw.value, liveDimensions: ld.value, previewDimensions: pd.value };
  const plans = sources.map(source => ({ source, copy: previewCopy(source, units) }));
  const children = [];
  for (const parent of oldParents.filter(p => p.type === 'variable')) children.push({ parentId: parent.id,
    products: await request(0, `/products/${parent.id}/variations?per_page=100`) });
  const report = { units, copies: plans.map(p => ({ sourceId: p.source.id, sku: p.source.sku, slug: p.source.slug,
    price: p.source.price, type: p.copy.type, stock: p.copy.stock_quantity, weightKg: p.copy.weight, images: p.copy.images.length })),
    retire: oldParents.map(p => ({ id: p.id, sku: p.sku, status: p.status })), permanentDelete: false, ordersTouched: false };
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync('qa-visual-artifacts/preview-replacement-plan.json', JSON.stringify(report, null, 2));
  if (!apply) return;
  for (const url of new Set(plans.flatMap(p => p.copy.images.map(i => i.src)))) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); await r.arrayBuffer();
    if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error('Original media failed; no catalog writes made.');
  }
  if (!priorJournal) fs.writeFileSync('qa-visual-artifacts/preview-replacement-backup.json', JSON.stringify({ sources, oldParents, children, units }, null, 2));
  else assert.deepEqual(sourceSnapshot(JSON.parse(fs.readFileSync('qa-visual-artifacts/preview-replacement-backup.json')).sources), sourceSnapshot(sources), 'Source changed before resume.');
  const journal = priorJournal || { created: [], retired: [], state: 'preparing', oldIds: oldParents.map(p => p.id) };
  const checkpoint = () => fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  checkpoint();
  async function terms(sourceTerms, existing, endpoint) {
    const out = [];
    for (const term of sourceTerms) {
      let target = existing.find(t => t.slug === term.slug);
      if (!target) { target = await request(0, endpoint, { name: term.name, slug: term.slug }, 'POST'); existing.push(target); }
      out.push({ id: target.id });
    }
    return out;
  }
  // Create in reverse source order: Woo's date-desc order then matches preview.
  for (const plan of [...plans].reverse()) {
    plan.copy.categories = await terms(plan.source.categories, liveCategories, '/products/categories');
    plan.copy.tags = await terms(plan.source.tags, liveTags, '/products/tags');
    const previous = journal.created.find(c => c.sourceId === plan.source.id);
    if (previous) {
      const existing = await request(0, `/products/${previous.liveId}`);
      assert.equal(existing.status, 'draft'); verifyCopy(existing, plan.copy);
      console.log(`Verified existing prepared copy ${plan.source.id} -> ${existing.id}`);
      continue;
    }
    plan.copy.images = await reuseOriginalMedia(plan.copy.images, oldParents.flatMap(p => p.images));
    const created = await request(0, '/products', { ...plan.copy, status: 'draft', sku: '', slug: `preview-import-${plan.source.id}` }, 'POST');
    journal.created.push({ sourceId: plan.source.id, liveId: created.id, sku: plan.source.sku, slug: plan.source.slug }); checkpoint();
    verifyCopy(await request(0, `/products/${created.id}`), plan.copy);
    console.log(`Verified prepared copy ${plan.source.id} -> ${created.id}`);
  }
  // Final source snapshot must still match before removing old listings.
  const latest = await request(1, '/products?status=publish&per_page=100');
  assert.deepEqual(sourceSnapshot(latest), sourceSnapshot(sources), 'Preview changed during import; prepared copies remain unpublished.');
  journal.state = 'cutover'; checkpoint();
  try {
  for (const old of oldParents) {
    const current = await request(0, `/products/${old.id}`);
    assert.deepEqual(current.date_modified_gmt, old.date_modified_gmt, `Live product ${old.id} changed; inspect before retirement.`);
    await request(0, `/products/${old.id}?force=false`, undefined, 'DELETE');
    assert.equal((await request(0, `/products/${old.id}`)).status, 'trash');
    journal.retired.push(old.id); checkpoint();
  }
  for (const item of [...journal.created].reverse()) {
    const after = await request(0, `/products/${item.liveId}`, { status: 'publish', sku: item.sku, slug: item.slug });
    assert.equal(after.status, 'publish'); assert.equal(after.sku, item.sku); assert.equal(after.slug, item.slug);
    verifyCopy(after, plans.find(p => p.source.id === item.sourceId).copy);
    console.log(`Published original preview listing ${item.sourceId} -> ${item.liveId}`);
  }
  const published = await request(0, '/products?status=publish&per_page=100');
  assert.deepEqual(published.map(p => p.sku).sort(), sources.map(p => p.sku).sort());
  journal.state = 'verified'; checkpoint();
  console.log('Verified: six new simple products, original preview SKUs, old products in recoverable Trash, no order writes.');
  } catch (error) {
    journal.state = 'rolling-back'; checkpoint();
    // Free copied SKUs before restoring their original owners. No force deletion.
    for (const item of journal.created) {
      const current = await request(0, `/products/${item.liveId}`);
      if (current.status !== 'trash') await request(0, `/products/${item.liveId}?force=false`, undefined, 'DELETE');
    }
    for (const id of journal.retired) {
      const old = oldParents.find(p => p.id === id);
      await request(0, `/products/${id}`, { status: old.status, slug: old.slug });
      for (const child of children.find(p => p.parentId === id)?.products || []) {
        await request(0, `/products/${id}/variations/${child.id}`, { status: child.status });
      }
    }
    journal.state = 'rolled-back'; checkpoint();
    throw new Error(`Cutover failed and old listings restored: ${error.message}`);
  }
}
