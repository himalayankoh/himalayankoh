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
  console.log('--- Checking Order 2639 line_items meta_data ---');
  const res = await fetch(`${base}/wp-json/wc/v3/orders/2639`, { headers: { Authorization: auth } });
  const o = await res.json();
  console.log('Order 2639 line_item[0] meta_data:', o.line_items?.[0]?.meta_data);
  console.log('Order 2639 order meta_data:', o.meta_data);
}

run().catch(console.error);
