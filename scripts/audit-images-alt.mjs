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

async function check() {
  const r = await fetch(`${base}/wp-json/wc/v3/products?status=publish&per_page=20`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const products = await r.json();
  for (const p of products) {
    console.log(`\nProduct ID: ${p.id} | Name: ${p.name}`);
    console.log(`Main Image: ${p.images?.[0]?.src}`);
    console.log(`Main Image ALT: "${p.images?.[0]?.alt}"`);
    console.log(`All Images count: ${p.images?.length}`);
    p.images?.forEach((img, idx) => {
      console.log(`  [${idx}] id=${img.id} src=${img.src} alt="${img.alt}"`);
    });
  }
}
check();
