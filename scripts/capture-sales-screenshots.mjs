import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './qa-cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_DIR = 'C:\\Users\\basco\\.gemini\\antigravity-ide\\brain\\099a176a-5268-447d-97a0-8bcaa9e27a72';
const PUBLIC_QA_DIR = join(ROOT, 'public', 'qa-screenshots');

mkdirSync(ARTIFACT_DIR, { recursive: true });
mkdirSync(PUBLIC_QA_DIR, { recursive: true });

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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function saveScreenshot(buffer, filename) {
  const artifactPath = join(ARTIFACT_DIR, filename);
  const publicPath = join(PUBLIC_QA_DIR, filename);
  writeFileSync(artifactPath, buffer);
  writeFileSync(publicPath, buffer);
  console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
}

async function run() {
  console.log('=== STARTING SALES DASHBOARD VISUAL CAPTURE ===');

  // 1. Authenticate as Admin
  console.log('1. Signing in as administrator to get valid admin session...');
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
    console.error('Failed to get admin session token:', session);
    process.exit(1);
  }
  console.log('Admin token received successfully!');

  const sbSession = {
    accessToken: session.token,
    refreshToken: '',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    user: session.user || {
      id: 'wp_admin',
      email: env.WORDPRESS_ADMIN_USER || 'admin',
      name: 'Administrator',
      role: 'admin',
      username: env.WORDPRESS_ADMIN_USER || 'admin',
    },
  };

  // 2. Launch headless Chrome via CDP
  console.log('\n2. Launching Chrome with remote debugging...');
  const browser = await launchBrowser({ headless: true, port: 9222 });

  try {
    const { send, navigate, evaluate, screenshot } = browser;

    // Set standard desktop viewport: 1440x900
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 3. Navigate to login first to seed localStorage for the domain
    console.log('\n3. Navigating to login page to inject session...');
    await navigate(`${BASE}/login`);
    await sleep(1000);

    await evaluate(`
      localStorage.setItem('luxedge_sb_session', ${JSON.stringify(JSON.stringify(sbSession))});
      localStorage.setItem('hk_admin_session', ${JSON.stringify(session.token)});
    `);
    console.log('Session injected into localStorage.');

    // 4. Navigate directly to /admin/sales
    console.log('\n4. Navigating to /admin/sales...');
    await navigate(`${BASE}/admin/sales`);
    await sleep(3500);

    // Wait for sales dashboard to appear and finish loading
    let ready = false;
    for (let i = 0; i < 20; i++) {
      const state = await evaluate(`(() => {
        const h1 = document.querySelector('h1')?.innerText || '';
        const hasSpinner = Boolean(document.querySelector('.animate-spin'));
        const hasCards = document.querySelectorAll('.bg-gradient-to-br').length;
        const text = document.body.innerText;
        return { h1, hasSpinner, hasCards, hasSalesText: text.includes('Himalayan Koh Sales') };
      })()`);
      console.log('Page state probe:', state);
      if (state.hasSalesText && !state.hasSpinner) {
        ready = true;
        break;
      }
      await sleep(1500);
    }

    if (!ready) {
      console.warn('Dashboard loading took longer than expected, proceeding with captures...');
    }

    // Set period to 'today' by clicking the 'Today' button to clearly highlight today's mock sales
    console.log('\nSetting period filter to "Today"...');
    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const todayBtn = buttons.find(b => b.innerText.trim() === 'Today');
      if (todayBtn) todayBtn.click();
    })()`);
    await sleep(2500);

    // ----------------------------------------------------
    // CAPTURE A: Executive Overview Desktop
    // ----------------------------------------------------
    console.log('\n--- Capturing Screenshot A: Executive Overview Desktop ---');
    // Ensure Overview tab is active
    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const overviewBtn = buttons.find(b => b.innerText.includes('Executive Overview'));
      if (overviewBtn) overviewBtn.click();
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;
    })()`);
    await sleep(2000);
    const shotA = await screenshot();
    await saveScreenshot(shotA, 'sales-overview-desktop.png');

    // ----------------------------------------------------
    // CAPTURE B: Orders Tab Desktop
    // ----------------------------------------------------
    console.log('\n--- Capturing Screenshot B: Orders Tab Desktop ---');
    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const ordersBtn = buttons.find(b => b.innerText.includes('Orders ('));
      if (ordersBtn) ordersBtn.click();
    })()`);
    await sleep(1500);
    await evaluate(`(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 120;
      const tableWrapper = document.querySelector('.overflow-x-auto');
      if (tableWrapper) tableWrapper.scrollLeft = 160;
    })()`);
    await sleep(1500);
    const shotB = await screenshot();
    await saveScreenshot(shotB, 'sales-orders-desktop.png');

    // ----------------------------------------------------
    // CAPTURE C: Payment Reconciliation Desktop
    // ----------------------------------------------------
    console.log('\n--- Capturing Screenshot C: Payment Reconciliation Desktop ---');
    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reconBtn = buttons.find(b => b.innerText.includes('Payment Reconciliation'));
      if (reconBtn) reconBtn.click();
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 120;
    })()`);
    await sleep(2000);
    const shotC = await screenshot();
    await saveScreenshot(shotC, 'sales-payments-desktop.png');

    // ----------------------------------------------------
    // CAPTURE D: Retail Mock Sale #1 Detail
    // ----------------------------------------------------
    console.log('\n--- Capturing Screenshot D: Retail Mock Sale #1 Detail ---');
    // Switch back to Orders tab
    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const ordersBtn = buttons.find(b => b.innerText.includes('Orders ('));
      if (ordersBtn) ordersBtn.click();
    })()`);
    await sleep(1500);

    // Click details button for Retail Order 2639
    const expandedRetail = await evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const retailRow = rows.find(r => r.innerText.includes('2639') || r.innerText.includes('TEST SALES DEMO 1'));
      if (retailRow) {
        const btn = retailRow.querySelector('button');
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    })()`);
    console.log('Retail button clicked:', expandedRetail);
    await sleep(1500);
    await evaluate(`(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 220;
    })()`);
    await sleep(1000);
    const shotD = await screenshot();
    await saveScreenshot(shotD, 'sales-retail-mock-detail.png');

    // ----------------------------------------------------
    // CAPTURE E: Wholesale Mock Sale #2 Detail
    // ----------------------------------------------------
    console.log('\n--- Capturing Screenshot E: Wholesale Mock Sale #2 Detail ---');
    // Click button for Wholesale Order
    const expandedWs = await evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const wsRow = rows.find(r => r.innerText.includes('WS-MOCK') || r.innerText.includes('Wholesale Partner') || r.innerText.includes('TEST WHOLESALE'));
      if (wsRow) {
        const btn = wsRow.querySelector('button');
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    })()`);
    console.log('Wholesale button clicked:', expandedWs);
    await sleep(1500);
    await evaluate(`(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 220;
    })()`);
    await sleep(1000);
    const shotE = await screenshot();
    await saveScreenshot(shotE, 'sales-wholesale-mock-detail.png');

    // ----------------------------------------------------
    // CAPTURE F: Mobile Orders View (375x812)
    // ----------------------------------------------------
    console.log('\n--- Capturing Screenshot F: Mobile Orders View ---');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await sleep(1000);

    // Switch to Orders tab on mobile and scroll down main to orders table
    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const ordersBtn = buttons.find(b => b.innerText.includes('Orders ('));
      if (ordersBtn) ordersBtn.click();
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 720;
    })()`);
    await sleep(2500);
    const shotF = await screenshot();
    await saveScreenshot(shotF, 'sales-orders-mobile.png');

    console.log('\n=== ALL 6 SCREENSHOTS CAPTURED SUCCESSFULLY ===');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
