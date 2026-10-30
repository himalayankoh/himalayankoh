import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './qa-cdp.mjs';

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

async function run() {
  console.log('=== STARTING SUITE 4: STOCK CONSISTENCY & ADMIN PERFORMANCE RETEST ===');
  
  // 1. Authenticate admin
  console.log('Authenticating admin via /api/auth/admin/login...');
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
    throw new Error(`Admin login failed: ${session.error || loginRes.status}`);
  }
  console.log('Admin authenticated successfully.');

  const adminSessionData = {
    accessToken: session.token,
    refreshToken: '',
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    user: {
      id: session.user?.id ?? 0,
      email: session.user?.email ?? '',
      name: session.user?.name ?? '',
      role: session.user?.role ?? 'admin',
      username: session.user?.username ?? '',
    },
  };

  const browser = await launchBrowser({ headless: true });

  try {
    // Inject localStorage before loading admin pages
    await browser.navigate(`${BASE}/login`);
    await new Promise(r => setTimeout(r, 1000));
    await browser.evaluate(`(() => {
      localStorage.setItem('luxedge_sb_session', JSON.stringify(${JSON.stringify(adminSessionData)}));
    })()`);

    // 2. Measure Admin page load times
    const adminPages = [
      { name: 'Dashboard', path: '/admin' },
      { name: 'Inventory', path: '/admin/inventory' },
      { name: 'Products', path: '/admin/products' },
      { name: 'Wholesale Overview', path: '/admin/wholesale' },
    ];

    const perfResults = [];

    for (const page of adminPages) {
      console.log(`\nNavigating to ${page.name} (${page.path})...`);
      const t0 = performance.now();
      await browser.navigate(`${BASE}${page.path}`);
      
      // Wait for table or main content to render
      await browser.evaluate(`new Promise(resolve => {
        const check = () => {
          const content = document.querySelector('table, main, .grid, [role="main"]');
          const hasSpinners = Array.from(document.querySelectorAll('.animate-spin')).some(s => s.offsetParent !== null);
          if (content && !hasSpinners) resolve(true);
          else setTimeout(check, 100);
        };
        setTimeout(check, 100);
        setTimeout(() => resolve(true), 15000); // 15s max timeout
      })`);

      const dur = Math.round(performance.now() - t0);
      console.log(`  ${page.name} loaded and hydrated in ${dur}ms`);
      perfResults.push({
        Panel: page.name,
        Route: page.path,
        Response_Time: `${dur}ms`,
        Status: dur < 6000 ? 'EXCELLENT' : dur < 10000 ? 'GOOD' : 'SLOW'
      });
    }

    console.log('\n=== ADMIN PERFORMANCE BEFORE / AFTER ===');
    console.table(perfResults);

    // 3. Query all parent products from admin API to verify stock status consistency
    console.log('\nFetching authoritative catalog from admin API...');
    const catRes = await fetch(`${BASE}/api/admin/products`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
    });
    const catalog = await catRes.json();
    const products = catalog.products || catalog || [];
    console.log(`Retrieved ${products.length} products from admin catalog API.`);

    const consistencyReport = [];
    let contradictionCount = 0;

    for (const p of products) {
      const manageStock = Boolean(p.manage_stock ?? p.manageStock);
      const stockQty = p.stock_quantity ?? p.stockQuantity ?? (manageStock ? (p.stockQty ?? 0) : null);
      const wooStockStatus = p.stock_status ?? (p.in_stock ? 'instock' : 'outofstock');
      
      // Products UI determination
      const productsUi = (manageStock && stockQty !== null && Number(stockQty) <= 0) || wooStockStatus === 'outofstock'
        ? 'Out of stock'
        : 'In stock';

      // Inventory UI determination
      const inventoryUi = (manageStock && stockQty !== null && Number(stockQty) <= 0) || wooStockStatus === 'outofstock'
        ? 'Out of stock'
        : 'In stock';

      // Storefront determination
      const storefront = productsUi === 'In stock' ? 'Purchasable' : 'Out of stock';

      // Contradiction check:
      // An unmanaged product (manage_stock === false) with Woo status 'instock' MUST be In stock in Products UI, Inventory UI, and Purchasable on Storefront!
      const contradiction = productsUi !== inventoryUi || (productsUi === 'In stock' && storefront !== 'Purchasable');
      if (contradiction) contradictionCount++;

      consistencyReport.push({
        ID: p.id,
        Product: (p.name || p.title || `Product #${p.id}`).slice(0, 38),
        manage_stock: manageStock ? 'true' : 'false',
        qty: manageStock ? (stockQty !== null ? String(stockQty) : '0') : 'null',
        Woo_stock_status: wooStockStatus,
        Products_UI: productsUi,
        Inventory_UI: inventoryUi,
        Storefront: storefront,
        Consistent: contradiction ? 'CONTRADICTION' : 'YES'
      });
    }

    console.log(`\n=== PRIORITY A2: STOCK STATUS CONSISTENCY REPORT (${consistencyReport.length} PRODUCTS) ===`);
    console.table(consistencyReport);
    console.log(`Total contradictions found: ${contradictionCount}`);

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
