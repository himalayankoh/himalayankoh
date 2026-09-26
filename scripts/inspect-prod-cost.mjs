import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 1) continue;
    out[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const auth = 'Basic ' + Buffer.from(env.WOOCOMMERCE_CONSUMER_KEY + ':' + env.WOOCOMMERCE_CONSUMER_SECRET).toString('base64');
const base = env.WORDPRESS_BASE_URL.replace(/\/+$/, '');

async function run() {
  console.log('--- Inspecting Product 2497 in WooCommerce ---');
  const res = await fetch(`${base}/wp-json/wc/v3/products/2497`, { headers: { Authorization: auth } });
  const p = await res.json();
  console.log('Product 2497 name:', p.name, 'sku:', p.sku, 'price:', p.price, 'type:', p.type);
  console.log('Product 2497 meta_data:');
  for (const m of p.meta_data || []) {
    if (m.key.toLowerCase().includes('cost') || m.key.toLowerCase().includes('price') || m.key.toLowerCase().includes('koh') || m.key.toLowerCase().includes('wholesale')) {
      console.log(`  ${m.key} = ${m.value}`);
    }
  }

  // Also check product 2487 (another product)
  console.log('\n--- Inspecting Product 2487 in WooCommerce ---');
  const res2 = await fetch(`${base}/wp-json/wc/v3/products/2487`, { headers: { Authorization: auth } });
  const p2 = await res2.json();
  console.log('Product 2487 name:', p2.name, 'sku:', p2.sku, 'price:', p2.price, 'type:', p2.type);
  console.log('Product 2487 meta_data:');
  for (const m of p2.meta_data || []) {
    if (m.key.toLowerCase().includes('cost') || m.key.toLowerCase().includes('price') || m.key.toLowerCase().includes('koh') || m.key.toLowerCase().includes('wholesale')) {
      console.log(`  ${m.key} = ${m.value}`);
    }
  }

  // Check all products in store
  console.log('\n--- Checking all products for costs ---');
  const allRes = await fetch(`${base}/wp-json/wc/v3/products?per_page=100`, { headers: { Authorization: auth } });
  const allProds = await allRes.json();
  console.log('Total store products:', allProds.length);
  for (const p of allProds) {
    const hkCost = p.meta_data?.find(m => m.key === '_himalayan_koh_cost_price')?.value;
    const landed = p.meta_data?.find(m => m.key === '_himalayan_koh_landed_cost')?.value;
    const wsPrice = p.meta_data?.find(m => m.key === '_owner_wholesale_price')?.value;
    console.log(`[${p.id}] ${p.name.slice(0, 35)}... (SKU: ${p.sku}) => hkCost: ${hkCost}, landed: ${landed}, wsPrice: ${wsPrice}`);
  }
}

run().catch(console.error);
