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

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env.WORDPRESS_ADMIN_USER,
      password: env.WORDPRESS_ADMIN_APP_PASSWORD,
    }),
  });
  const session = await loginRes.json();
  const salesRes = await fetch(`${BASE}/api/admin/sales?period=today`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const data = await salesRes.json();
  console.log('--- PROFIT SUMMARY ---', data.profit);
  console.log('--- COST SUMMARY ---', data.costs);
  const r2639 = data.orders.find(o => o.orderNumber === '2639' || o.id === 2639);
  console.log('--- ORDER 2639 FINANCIALS ---', {
    orderNumber: r2639?.orderNumber,
    customerName: r2639?.customerName,
    grossTotal: r2639?.grossTotal,
    refundAmount: r2639?.refundAmount,
    netTotal: r2639?.netTotal,
    cogs: r2639?.cogs,
    cogsStatus: r2639?.cogsStatus,
    cogsSource: r2639?.cogsSource,
    actualShippingCost: r2639?.actualShippingCost,
    shippingCostSource: r2639?.shippingCostSource,
    paymentFee: r2639?.paymentFee,
    paymentFeeSource: r2639?.paymentFeeSource,
    otherExpense: r2639?.otherExpense,
    otherExpenseSource: r2639?.otherExpenseSource,
    totalCosts: r2639?.totalCosts,
    netProfit: r2639?.netProfit,
    profitMarginPct: r2639?.profitMarginPct,
    items: r2639?.items,
  });
  const ws = data.orders.find(o => o.channel === 'wholesale');
  console.log('--- WHOLESALE ORDER FINANCIALS ---', {
    orderNumber: ws?.orderNumber,
    customerName: ws?.customerName,
    grossTotal: ws?.grossTotal,
    paidAmount: ws?.paidAmount,
    pendingBalance: ws?.pendingBalance,
    paymentStatus: ws?.paymentStatus,
    netProfit: ws?.netProfit,
    profitMarginPct: ws?.profitMarginPct,
  });
}

main().catch(console.error);
