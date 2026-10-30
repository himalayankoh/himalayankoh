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
const BASE = 'https://preview.himalayankoh.com';

async function verify() {
  console.log('=== VERIFYING SALES API ON PREVIEW.HIMALAYANKOH.COM ===');

  // 1. Authenticate as Admin
  console.log('1. Signing in as administrator...');
  const loginRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env.WORDPRESS_ADMIN_USER,
      password: env.WORDPRESS_ADMIN_APP_PASSWORD,
    }),
  });

  const session = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok || !session.token) {
    console.error('Failed to get admin token:', session);
    process.exit(1);
  }
  console.log('Admin token received successfully!');

  // 2. Fetch Sales Dashboard
  console.log('\n2. Calling GET /api/admin/sales?period=today...');
  const salesRes = await fetch(`${BASE}/api/admin/sales?period=today`, {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });

  const salesData = await salesRes.json().catch(() => ({}));
  if (!salesRes.ok) {
    console.error('Failed to get sales data:', salesRes.status, salesData);
    process.exit(1);
  }

  console.log('\n--- SALES DASHBOARD API RESPONSE ---');
  console.log('Date Range:', salesData.dateRange);
  console.log('Revenue:', salesData.revenue);
  console.log('Wholesale Summary:', salesData.wholesaleSummary);
  console.log('Today KPIs:', salesData.todayKpis);
  console.log('Orders Count:', salesData.orders?.length);

  // Look for our 2 mock sales
  const retailMock = salesData.orders?.find(o => o.orderNumber === '2639' || o.id === '2639');
  const wholesaleMock = salesData.orders?.find(o => o.orderNumber.startsWith('WS-MOCK') || o.customerName.includes('TEST WHOLESALE DEMO 2'));

  console.log('\n--- MOCK SALES VERIFICATION ---');
  if (retailMock) {
    console.log('PASS: Retail Mock Order 2639 found!');
    console.log('  Customer:', retailMock.customerName);
    console.log('  Channel:', retailMock.channel);
    console.log('  Total:', retailMock.total, retailMock.currency);
    console.log('  Payment Status:', retailMock.paymentStatus);
    console.log('  Items:', retailMock.items.length);
  } else {
    console.log('FAIL: Retail Mock Order 2639 not found in today period. Checking all period...');
  }

  if (wholesaleMock) {
    console.log('PASS: Wholesale Mock Order found!');
    console.log('  Ref:', wholesaleMock.orderNumber);
    console.log('  Customer:', wholesaleMock.customerName);
    console.log('  Channel:', wholesaleMock.channel);
    console.log('  Total:', wholesaleMock.total, wholesaleMock.currency);
    console.log('  Payment Status:', wholesaleMock.paymentStatus);
  } else {
    console.log('Checking all period for wholesale...');
  }

  // Also check period=all
  const allRes = await fetch(`${BASE}/api/admin/sales?period=all`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const allData = await allRes.json();
  const allRetail = allData.orders?.find(o => o.orderNumber === '2639' || o.id === '2639');
  const allWs = allData.orders?.find(o => o.orderNumber.startsWith('WS-MOCK') || o.customerName.includes('TEST WHOLESALE DEMO 2'));
  console.log('\nIn period=all:');
  console.log('  Retail 2639 found?', Boolean(allRetail));
  console.log('  Wholesale found?', Boolean(allWs));
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
