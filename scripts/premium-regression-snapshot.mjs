import { readFileSync, writeFileSync } from 'node:fs';
const phase = process.argv[2] ?? 'before';
const base = 'https://preview.himalayankoh.com';
const dir = 'qa-visual-artifacts/premium-upgrade';
const start = performance.now();
const response = await fetch(base + '/api/catalog');
if (!response.ok) throw new Error(`Catalogue HTTP ${response.status}`);
const catalogue = await response.json();
if (catalogue.products?.length !== 10) throw new Error('Expected the preserved ten public products');
const read = async p => {
  const url = `${base}/products/${p.slug}`;
  const t = performance.now(); const res = await fetch(url); const html = await res.text();
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0];
  const description = html.match(/<meta[^>]*name="description"[^>]*>/)?.[0];
  const schema = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => { try { return JSON.parse(m[1]); } catch { return m[1]; } });
  if (!res.ok || !title || !canonical || !schema.length) throw new Error(`Incomplete PDP: ${url} (${res.status})`);
  console.log(`${phase}: ${p.id} HTTP ${res.status}, title/canonical/schema present`);
  return { id: p.id, url, status: res.status, ms: Math.round(performance.now()-t), title, canonical, description, schema };
};
const pages = [];
// Keep origin concurrency low so QA doesn't compete with admin reads.
for (const product of catalogue.products) pages.push(await read(product));
const result = { at: new Date().toISOString(), durationMs: Math.round(performance.now()-start), catalogue, pages };
writeFileSync(`${dir}/${phase}-regression.json`, JSON.stringify(result,null,2));
if (phase === 'after') {
  const before=JSON.parse(readFileSync(`${dir}/before-regression.json`,'utf8'));
  const fields=['id','slug','name','price','priceMin','priceMax','sku','inStock','stockStatus','stockQuantity','weight','category','description'];
  const dataDiff=[]; for(const p of catalogue.products){const old=before.catalogue.products.find(x=>x.id===p.id); for(const field of fields)if(JSON.stringify(old?.[field])!==JSON.stringify(p[field]))dataDiff.push({id:p.id,field,before:old?.[field],after:p[field]});}
  const seoDiff=[];for(const p of pages){const old=before.pages.find(x=>x.id===p.id);for(const field of ['title','canonical','description','schema'])if(JSON.stringify(old?.[field])!==JSON.stringify(p[field]))seoDiff.push({id:p.id,field});}
  writeFileSync(`${dir}/regression-comparison.json`,JSON.stringify({dataDiff,seoDiff},null,2));
  console.log(JSON.stringify({dataDiff,seoDiff}));
  if(dataDiff.length||seoDiff.length)process.exitCode=1;
}
