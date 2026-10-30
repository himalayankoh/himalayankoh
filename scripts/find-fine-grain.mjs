import { readFileSync } from 'node:fs';

const envFile = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const at = line.indexOf('=');
  if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '');
}

const WOO_BASE = env.WORDPRESS_BASE_URL.replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(env.WOOCOMMERCE_CONSUMER_KEY + ':' + env.WOOCOMMERCE_CONSUMER_SECRET).toString('base64');

async function run() {
  const res = await fetch(`${WOO_BASE}/wp-json/wc/v3/products?per_page=100`, { headers: { Authorization: auth } });
  const products = await res.json();
  console.log('Total products in Woo:', products.length);
  for (const p of products) {
    if (p.name.toLowerCase().includes('fine') || p.slug.includes('fine') || p.slug.includes('salt')) {
      console.log(`ID: ${p.id} | Slug: ${p.slug} | Name: ${p.name}`);
    }
  }
}

run().catch(console.error);
