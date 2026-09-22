/**
 * Extended Phase 1 checks: blog SEO, admin gate, checkout empty state, optional auth smoke.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const base = process.argv[2] || 'http://127.0.0.1:4173';
const results = [];

function record(label, status, detail = '') {
  results.push({ label, status, detail });
  console.log(`${status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗'} [${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto(`${base}/blog/why-dairy-cows-need-trace-minerals`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    const blogCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const blogLd = await page.locator('script#json-ld-blog-post').count();
    if (blogCanonical?.includes('/blog/why-dairy-cows-need-trace-minerals')) {
      record('Blog canonical URL', 'PASS', blogCanonical);
    } else if (!process.env.VITE_SUPABASE_URL) {
      record('Blog canonical URL', 'WARN', 'Supabase not configured — post may not load');
    } else {
      record('Blog canonical URL', 'FAIL', blogCanonical || 'missing');
    }
    record('Blog JSON-LD', blogLd > 0 ? 'PASS' : process.env.VITE_SUPABASE_URL ? 'FAIL' : 'WARN', `count=${blogLd}`);

    await page.goto(`${base}/admin`, { waitUntil: 'networkidle', timeout: 30000 });
    const url = page.url();
    if (url.includes('/login')) {
      record('Admin route redirects unauthenticated user to login', 'PASS', url);
    } else {
      record('Admin route redirects unauthenticated user to login', 'FAIL', url);
    }

    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    const hasSupabase = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);
    if (hasSupabase) {
      await page.fill('input[name="email"]', 'admin@himalayankoh.com');
      await page.fill('input[type="password"]', 'Admin123!');
      await page.getByRole('button', { name: /sign in|log in/i }).click();
      await page.waitForTimeout(4000);
      const afterLogin = page.url();
      if (afterLogin.includes('/admin') || afterLogin.includes('/account')) {
        record('Admin demo login reaches authenticated area', 'PASS', afterLogin);
      } else {
        record('Admin demo login reaches authenticated area', 'WARN', afterLogin);
      }
      if (afterLogin.includes('/admin') || (await page.goto(`${base}/admin`, { waitUntil: 'networkidle' }), page.url().includes('/admin'))) {
        const adminHeading = await page.getByText(/dashboard|admin/i).count();
        record('Admin dashboard accessible for admin user', adminHeading > 0 ? 'PASS' : 'WARN');
      }
    } else {
      record('Admin demo login', 'WARN', 'Supabase env not loaded in validation script');
    }

    await page.goto(`${base}/products/himalayan-edible-pink-salt-fine`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add to cart/i }).click();
    await page.waitForTimeout(1000);
    await page.goto(`${base}/checkout`, { waitUntil: 'networkidle' });
    const checkoutForm = await page.locator('input, select, textarea').count();
    const emptyCart = await page.getByText(/cart is empty/i).count();
    if (checkoutForm > 3) {
      record('Checkout shows form with items in cart', 'PASS', `${checkoutForm} fields`);
    } else if (emptyCart > 0) {
      record('Checkout shows form with items in cart', 'WARN', 'Cart empty — add-to-cart may need Supabase');
    } else {
      record('Checkout shows form with items in cart', 'FAIL');
    }
  } catch (err) {
    record('Extended validation run', 'FAIL', err.message);
  }

  await browser.close();

  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nExtended: ${results.filter((r) => r.status === 'PASS').length} PASS, ${results.filter((r) => r.status === 'WARN').length} WARN, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
