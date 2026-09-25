import { readFileSync } from 'node:fs';

const envFile = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const at = line.indexOf('=');
  if (at > 0) env[line.slice(0, at).trim()] = line.slice(at+1).trim().replace(/^["']|["']$/g, '');
}

const WOO_BASE = env.WORDPRESS_BASE_URL.replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(env.WOOCOMMERCE_CONSUMER_KEY + ':' + env.WOOCOMMERCE_CONSUMER_SECRET).toString('base64');

async function check(id) {
  const res = await fetch(`${WOO_BASE}/wp-json/wc/v3/products/${id}`, { headers: { Authorization: auth } });
  const p = await res.json();
  console.log(`Product ${id}:`, {
    id: p.id,
    name: p.name,
    manage_stock: p.manage_stock,
    stock_quantity: p.stock_quantity,
    stock_status: p.stock_status,
    price: p.price
  });
  return p;
}

await check(2487);
await check(2484);
