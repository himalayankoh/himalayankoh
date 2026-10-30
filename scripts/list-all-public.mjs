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

const r = await fetch(`${base}/wp-json/wc/v3/products?status=publish&per_page=50`, {
  headers: { Authorization: `Basic ${auth}` },
});
const products = await r.json();

console.log(`Found ${products.length} published products:`);
for (const p of products) {
  console.log(`\nID: ${p.id} | Slug: ${p.slug} | Name: ${p.name}`);
  console.log(`  SKU: ${p.sku || '(none)'} | Price: ${p.price} | Type: ${p.type}`);
  console.log(`  Short desc: ${p.short_description}`);
  console.log(`  Desc: ${p.description}`);
  const yoastTitle = p.meta_data?.find(m => m.key === '_yoast_wpseo_title')?.value;
  const yoastDesc = p.meta_data?.find(m => m.key === '_yoast_wpseo_metadesc')?.value;
  console.log(`  Yoast Title: ${yoastTitle}`);
  console.log(`  Yoast Desc: ${yoastDesc}`);
}
