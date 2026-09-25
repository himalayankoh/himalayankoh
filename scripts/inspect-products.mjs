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

async function check(id) {
  const r = await fetch(`${base}/wp-json/wc/v3/products/${id}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await r.json();
  console.log(`\nProduct ${id}:`);
  console.log('  Name:', data.name);
  console.log('  Type:', data.type);
  console.log('  Status:', data.status);
  console.log('  Slug:', data.slug);
  console.log('  Permalink:', data.permalink);
  console.log('  Catalog visibility:', data.catalog_visibility);
  console.log('  Regular price:', data.regular_price);
  console.log('  Price:', data.price);
  console.log('  Categories:', data.categories);
  console.log('  Variations count:', data.variations?.length || 0);
  console.log('  Meta data count:', data.meta_data?.length || 0);
}

await check(2497);
await check(2487);

const loginRes = await fetch('https://preview.himalayankoh.com/api/auth/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: env.WORDPRESS_ADMIN_USER,
    password: env.WORDPRESS_ADMIN_APP_PASSWORD,
  }),
});
const session = await loginRes.json();
const token = session.token;

const catRes = await fetch('https://preview.himalayankoh.com/api/admin/catalog', {
  headers: { Authorization: `Bearer ${token}` },
});
const catData = await catRes.json();
console.log('\n--- catData structure ---');
console.log('catData keys:', Object.keys(catData));
console.log('catData.page keys:', Object.keys(catData.page || {}));
const p2497 = catData.page?.rows?.find((r) => r.id === '2497');
const p2487 = catData.page?.rows?.find((r) => r.id === '2487');
console.log('\n--- Catalog rows from catData.page.rows ---');
console.log('2497:', { price: p2497?.price, priceMin: p2497?.priceMin, compareAtPrice: p2497?.compareAtPrice });
console.log('2487:', { price: p2487?.price, priceMin: p2487?.priceMin, compareAtPrice: p2487?.compareAtPrice });



const p2487Woo = await (await fetch(`${base}/wp-json/wc/v3/products/2487`, {
  headers: { Authorization: `Basic ${auth}` },
})).json();
console.log('2487 Woo SKU:', p2487Woo.sku);
console.log('2487 Woo Description:', p2487Woo.description?.slice(0, 100));

const detail2487 = await (await fetch('https://preview.himalayankoh.com/api/admin/products/2487', {
  headers: { Authorization: `Bearer ${token}` },
})).json();
console.log('\n--- Detail product from /api/admin/products/:id ---');
console.log('2497 price:', detail2497.product?.price, 'regularPrice:', detail2497.product?.regularPrice);
console.log('2487 price:', detail2487.product?.price, 'regularPrice:', detail2487.product?.regularPrice);

