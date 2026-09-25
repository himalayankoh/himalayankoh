import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const auth = Buffer.from(env.WORDPRESS_ADMIN_USER + ':' + env.WORDPRESS_ADMIN_APP_PASSWORD).toString('base64');
const base = env.NEXT_PUBLIC_WORDPRESS_BASE_URL || 'https://himalayankoh.com/staging';

async function getProduct(id) {
  const r = await fetch(`${base}/wp-json/wc/v3/products/${id}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return r.json();
}

async function getVariations(id) {
  const r = await fetch(`${base}/wp-json/wc/v3/products/${id}/variations`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return r.json();
}

for (const id of [2490, 2481, 2492, 2488, 2485, 2487, 2479, 2497]) {
  const p = await getProduct(id);
  console.log(`\n================== Product ${id} ==================`);
  console.log('Name:', p.name);
  console.log('Slug:', p.slug);
  console.log('Type:', p.type);
  console.log('SKU:', p.sku);
  console.log('Price:', p.price, 'Regular:', p.regular_price);
  console.log('Images:', p.images?.map(img => ({ id: img.id, src: img.src, alt: img.alt })));
  console.log('Short description:', p.short_description);
  console.log('Description:', p.description);
  console.log('SEO meta:', p.meta_data?.filter(m => m.key.includes('yoast') || m.key.includes('himalayan')));
  if (p.type === 'variable') {
    const vars = await getVariations(id);
    console.log('Variations count:', vars.length);
    console.log('Variations:', vars.map(v => ({ id: v.id, sku: v.sku, price: v.price, regular_price: v.regular_price, attributes: v.attributes })));
  }
}
