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
  console.log('--- Updating Order 2639 with realistic test financial metadata ---');
  const updatePayload = {
    meta_data: [
      { key: '_hk_cogs', value: '35.00' },
      { key: '_hk_cogs_source', value: 'manual' },
      { key: '_hk_shipping_cost', value: '8.00' },
      { key: '_hk_shipping_cost_source', value: 'manual' },
      { key: '_hk_payment_fee', value: '3.00' },
      { key: '_hk_payment_fee_source', value: 'manual' },
      { key: '_hk_other_expense', value: '2.00' },
      { key: '_hk_other_expense_source', value: 'manual' },
      { key: '_hk_net_profit', value: '51.90' },
      { key: '_hk_profit_margin', value: '51.95' },
      { key: '_hk_financial_snapshotted', value: 'true' },
    ],
    line_items: [
      {
        id: 277,
        meta_data: [
          { key: '_unit_cost', value: '17.50' },
          { key: '_line_cogs', value: '35.00' },
          { key: '_cogs_source', value: 'manual' },
        ],
      },
    ],
  };

  const res = await fetch(`${base}/wp-json/wc/v3/orders/2639`, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  const updated = await res.json();
  if (!res.ok) {
    console.error('Failed to update order 2639:', res.status, updated);
    return;
  }

  console.log('Order 2639 successfully updated with financial metadata!');
  console.log('Order meta keys now:', updated.meta_data?.map(m => `${m.key}=${m.value}`));
  console.log('Line item 277 meta:', updated.line_items?.[0]?.meta_data?.map(m => `${m.key}=${m.value}`));
}

run().catch(console.error);
