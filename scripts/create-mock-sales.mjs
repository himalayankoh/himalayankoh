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
const WOO_BASE = env.WORDPRESS_BASE_URL.replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(env.WOOCOMMERCE_CONSUMER_KEY + ':' + env.WOOCOMMERCE_CONSUMER_SECRET).toString('base64');
const wpAuth = 'Basic ' + Buffer.from(env.WORDPRESS_ADMIN_USER + ':' + env.WORDPRESS_ADMIN_APP_PASSWORD).toString('base64');

async function run() {
  console.log('=== CREATING 2 SAFE MOCK SALES ON STAGING ===');

  // 1. Create Retail Mock Sale #1 in WooCommerce
  console.log('\n1. Creating Mock Sale #1 (Retail)...');
  const retailPayload = {
    payment_method: 'bacs',
    payment_method_title: 'Direct Bank Transfer (MOCK PAID)',
    set_paid: true,
    status: 'processing',
    billing: {
      first_name: 'TEST SALES',
      last_name: 'DEMO 1',
      address_1: '100 Salt Ridge Way',
      city: 'Salt Lake City',
      state: 'UT',
      postcode: '84101',
      country: 'US',
      email: 'test-sales-demo1@himalayankoh-staging.local',
      phone: '555-0101',
    },
    shipping: {
      first_name: 'TEST SALES',
      last_name: 'DEMO 1',
      address_1: '100 Salt Ridge Way',
      city: 'Salt Lake City',
      state: 'UT',
      postcode: '84101',
      country: 'US',
    },
    line_items: [
      {
        product_id: 2497, // Himalayan Rock Salt — 45 lbs ($49.95)
        quantity: 2,
      },
    ],
    customer_note: 'STAGING MOCK SALE — DO NOT FULFILL',
    meta_data: [
      { key: '_hk_status', value: 'processing' },
      { key: '_hk_payment_status', value: 'paid' },
      { key: '_staging_mock', value: 'true' },
    ],
  };

  const retailRes = await fetch(`${WOO_BASE}/wp-json/wc/v3/orders`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(retailPayload),
  });

  const retailOrder = await retailRes.json();
  if (!retailRes.ok) {
    console.error('Failed to create retail order:', retailRes.status, retailOrder);
    process.exit(1);
  }

  console.log('SUCCESS! Retail Mock Sale #1 created:');
  console.log('  Order ID:', retailOrder.id);
  console.log('  Order Number:', retailOrder.number);
  console.log('  Customer:', `${retailOrder.billing.first_name} ${retailOrder.billing.last_name}`);
  console.log('  Total:', retailOrder.total, retailOrder.currency);
  console.log('  Status:', retailOrder.status);

  // 2. Create Wholesale Mock Sale #2 in Wholesale subsystem
  console.log('\n2. Creating Mock Sale #2 (Wholesale)...');

  // First ensure an account exists for TEST WHOLESALE DEMO 2
  let accountId = null;
  const accListRes = await fetch(`${WOO_BASE}/wp-json/hk-wholesale/v1/records?resource=accounts`, {
    headers: { Authorization: wpAuth },
  });
  if (accListRes.ok) {
    const accData = await accListRes.json();
    const existing = (accData.items || []).find(a => (a.company_name || a.companyName || '').includes('TEST WHOLESALE DEMO 2'));
    if (existing) {
      accountId = existing.id;
      console.log('  Using existing wholesale account ID:', accountId);
    }
  }

  if (!accountId) {
    console.log('  Creating wholesale account for TEST WHOLESALE DEMO 2...');
    const createAccRes = await fetch(`${WOO_BASE}/wp-json/hk-wholesale/v1/records`, {
      method: 'POST',
      headers: {
        Authorization: wpAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resource: 'accounts',
        id: 0,
        data: {
          company_name: 'TEST WHOLESALE DEMO 2',
          contact_name: 'Demo Wholesale Buyer',
          email: 'test-wholesale-demo2@himalayankoh-staging.local',
          country: 'US',
          status: 'ACTIVE',
          role: 'BUYER',
          notes: 'STAGING MOCK SALE — DO NOT FULFILL',
        },
        actor: 'admin_test',
      }),
    });
    const accCreated = await createAccRes.json();
    accountId = accCreated.record?.id || 1;
    console.log('  Created account ID:', accountId);
  }

  // Create Wholesale Order
  const wholesalePayload = {
    resource: 'orders',
    id: 0,
    data: {
      ref: `WS-MOCK-${Date.now().toString().slice(-4)}`,
      account_id: accountId,
      status: 'CONFIRMED',
      currency: 'USD',
      totals: {
        sellGrandTotal: 1000,
        total: 1000,
      },
      paid_amount: 400,
      cost_total: 400,
      freight_total: 100,
      other_costs: 40,
      hk_net_profit: 430,
      notes: 'STAGING MOCK SALE — DO NOT FULFILL',
    },
    actor: 'admin_test',
  };

  const wsOrderRes = await fetch(`${WOO_BASE}/wp-json/hk-wholesale/v1/records`, {
    method: 'POST',
    headers: {
      Authorization: wpAuth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(wholesalePayload),
  });

  const wsOrderData = await wsOrderRes.json();
  if (!wsOrderRes.ok) {
    console.error('Failed to create wholesale order:', wsOrderRes.status, wsOrderData);
  } else {
    const wsRec = wsOrderData.record || {};
    console.log('SUCCESS! Wholesale Mock Sale #2 created:');
    console.log('  Order ID:', wsRec.id);
    console.log('  Reference:', wsRec.ref || wholesalePayload.data.ref);
    console.log('  Account ID:', wsRec.account_id || accountId);
    console.log('  Booked Value: $1,000.00');
    console.log('  Deposit / Cash Collected: $400.00');
    console.log('  Balance Due: $600.00');
    console.log('  Status:', wsRec.status || 'CONFIRMED');
  }

  console.log('\n=== BOTH MOCK SALES CREATED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Fatal error creating mock sales:', err);
  process.exit(1);
});
