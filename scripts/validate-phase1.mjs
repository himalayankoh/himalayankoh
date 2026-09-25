/**
 * Phase 1 validation — HTTP + optional Playwright browser checks.
 * Usage: node scripts/validate-phase1.mjs --base http://localhost:5173
 */
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baseArg = args.find((a) => a.startsWith('--base='))?.split('=')[1];
const base = baseArg || args[args.indexOf('--base') + 1] || 'http://localhost:4173';
const runBrowser = !args.includes('--http-only');

const results = [];

function record(id, label, status, detail = '') {
  results.push({ id, label, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗';
  console.log(`${icon} [${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, { redirect: 'follow', ...options });
  const text = await res.text();
  return { res, text };
}

async function httpChecks() {
  console.log(`\n=== HTTP checks @ ${base} ===\n`);

  const spaPaths = [
    '/',
    '/products',
    '/products/himalayan-edible-pink-salt-fine',
    '/products/nonexistent-slug-xyz',
    '/checkout',
    '/login',
    '/admin',
    '/admin/products',
    '/blog',
    '/reset-password',
  ];

  for (const p of spaPaths) {
    try {
      const { res, text } = await fetchText(`${base}${p}`);
      const hasRoot = text.includes('id="root"') || text.includes('id=\'root\'');
      if (res.status === 200 && hasRoot) {
        record(`http${p}`, `SPA shell ${p}`, 'PASS', `status ${res.status}`);
      } else if (res.status === 200) {
        record(`http${p}`, `SPA shell ${p}`, 'WARN', '200 but no #root in HTML (may still be SPA)');
      } else {
        record(`http${p}`, `SPA shell ${p}`, 'FAIL', `status ${res.status}`);
      }
    } catch (err) {
      record(`http${p}`, `SPA shell ${p}`, 'FAIL', err.message);
    }
  }

  try {
    const { res, text } = await fetchText(`${base}/sitemap.xml`);
    const productCount = (text.match(/\/products\//g) || []).length;
    const blogCount = (text.match(/\/blog\//g) || []).length;
    if (res.status === 200 && productCount >= 6 && blogCount >= 1) {
      record('sitemap', 'sitemap.xml served', 'PASS', `${productCount} product URLs, ${blogCount} blog URLs`);
    } else {
      record('sitemap', 'sitemap.xml served', 'FAIL', `status ${res.status}, products=${productCount}, blogs=${blogCount}`);
    }
  } catch (err) {
    record('sitemap', 'sitemap.xml served', 'FAIL', err.message);
  }

  try {
    const { res } = await fetchText(`${base}/robots.txt`);
    record('robots', 'robots.txt served', res.status === 200 ? 'PASS' : 'FAIL', `status ${res.status}`);
  } catch (err) {
    record('robots', 'robots.txt served', 'FAIL', err.message);
  }
}

async function browserChecks() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    record('browser', 'Playwright browser checks', 'WARN', 'playwright not installed; run: npm i -D playwright && npx playwright install chromium');
    return;
  }

  console.log(`\n=== Browser checks @ ${base} ===\n`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
    const homeCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const homeTitle = await page.title();
    if (homeCanonical === 'https://himalayankoh.com/') {
      record('canonical-home', 'Home canonical URL', 'PASS', homeCanonical);
    } else {
      record('canonical-home', 'Home canonical URL', 'FAIL', `got ${homeCanonical}`);
    }
    if (homeTitle.includes('Himalayan Koh')) {
      record('title-home', 'Home document title', 'PASS', homeTitle.slice(0, 60));
    } else {
      record('title-home', 'Home document title', 'FAIL', homeTitle);
    }

    const orgLd = await page.locator('script#json-ld-organization').count();
    record('jsonld-org', 'Organization JSON-LD on home', orgLd > 0 ? 'PASS' : 'FAIL');

    await page.goto(`${base}/products/himalayan-edible-pink-salt-fine`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    const pdpTitle = await page.title();
    const pdpCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const productLd = await page.locator('script#json-ld-product').count();
    const h1 = await page.locator('h1').first().textContent();

    if (pdpCanonical === 'https://himalayankoh.com/products/himalayan-edible-pink-salt-fine') {
      record('canonical-pdp', 'PDP canonical URL', 'PASS', pdpCanonical);
    } else {
      record('canonical-pdp', 'PDP canonical URL', 'FAIL', `got ${pdpCanonical}`);
    }
    if (productLd > 0) {
      record('jsonld-product', 'Product JSON-LD on PDP', 'PASS');
    } else {
      record('jsonld-product', 'Product JSON-LD on PDP', 'FAIL');
    }
    if (h1 && h1.length > 5) {
      record('pdp-render', 'PDP renders product h1', 'PASS', h1.slice(0, 50));
    } else {
      record('pdp-render', 'PDP renders product h1', 'FAIL', 'missing h1');
    }

    await page.goto(`${base}/products/nonexistent-slug-xyz`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    const notFound = await page.getByText('Product Not Found').count();
    record('pdp-404', 'Unknown product slug shows not found', notFound > 0 ? 'PASS' : 'FAIL');

    await page.goto(`${base}/#/products`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    const hashRedirect = page.url().replace(base, '');
    if (!hashRedirect.includes('#') && hashRedirect.includes('/products')) {
      record('hash-redirect', 'Hash URL migrates to clean path', 'PASS', hashRedirect);
    } else {
      record('hash-redirect', 'Hash URL migrates to clean path', 'WARN', `url=${page.url()}`);
    }

    await page.goto(`${base}/products`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.reload({ waitUntil: 'networkidle' });
    const afterRefresh = page.url().replace(base, '');
    record('refresh-products', 'Hard refresh /products', afterRefresh.startsWith('/products') ? 'PASS' : 'FAIL', afterRefresh);

    await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    const loginForm = await page.locator('input[type="email"], input[name="email"]').count();
    record('auth-login', 'Login page loads', loginForm > 0 ? 'PASS' : 'FAIL');

    await page.goto(`${base}/checkout`, { waitUntil: 'networkidle', timeout: 30000 });
    const emptyOrCheckout = await page.getByText(/cart is empty|checkout/i).count();
    record('checkout-route', 'Checkout route loads', emptyOrCheckout > 0 ? 'PASS' : 'WARN');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
    const menuBtn = page.getByRole('button', { name: /menu/i });
    if (await menuBtn.count()) {
      await menuBtn.click();
      const navLink = page.getByRole('link', { name: 'Products' });
      record('mobile-nav', 'Mobile menu opens Products link', (await navLink.count()) > 0 ? 'PASS' : 'FAIL');
    } else {
      record('mobile-nav', 'Mobile menu button', 'WARN', 'menu button not found');
    }
  } catch (err) {
    record('browser-run', 'Browser test run', 'FAIL', err.message);
  }

  if (consoleErrors.length) {
    record('console-errors', 'No critical console errors', 'WARN', consoleErrors.slice(0, 3).join(' | '));
  } else {
    record('console-errors', 'No critical console errors', 'PASS');
  }

  await browser.close();
}

function staticChecks() {
  console.log('\n=== Static / build checks ===\n');

  try {
    const sitemap = readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8');
    const urls = (sitemap.match(/<loc>/g) || []).length;
    record('sitemap-file', 'public/sitemap.xml exists', urls >= 15 ? 'PASS' : 'WARN', `${urls} URLs`);
  } catch {
    record('sitemap-file', 'public/sitemap.xml exists', 'FAIL');
  }

  try {
    const wrangler = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
    if (wrangler.includes('preview.himalayankoh.com')) {
      record('wrangler-toml', 'wrangler.toml staging route present', 'PASS');
    } else {
      record('wrangler-toml', 'wrangler.toml staging route present', 'FAIL');
    }
  } catch {
    record('wrangler-toml', 'wrangler.toml exists', 'FAIL');
  }
}

async function main() {
  console.log(`Phase 1 validation\nBase URL: ${base}\n`);
  staticChecks();
  await httpChecks();
  if (runBrowser) await browserChecks();

  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const pass = results.filter((r) => r.status === 'PASS').length;

  console.log(`\n--- Summary: ${pass} PASS, ${warn} WARN, ${fail} FAIL ---\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
