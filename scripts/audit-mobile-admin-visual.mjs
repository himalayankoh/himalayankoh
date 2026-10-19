import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { launchBrowser } from './qa-cdp.mjs';

const env = parse(readFileSync('.env.local'));
const siteBase = 'https://himalayankoh.com';
const artifactsDir = 'C:/Users/basco/.gemini/antigravity/brain/7e26961f-5440-4ba1-b17c-752c7193a158';
const localScreenshotsDir = join(process.cwd(), 'screenshots');

if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });
if (!existsSync(localScreenshotsDir)) mkdirSync(localScreenshotsDir, { recursive: true });

async function getAdminSession(maxAttempts = 4) {
  console.log('[1/4] Minting fresh admin session token from production...');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${siteBase}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: env.WORDPRESS_ADMIN_USER,
          password: env.WORDPRESS_ADMIN_APP_PASSWORD,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn(`  Attempt ${attempt} failed (${res.status}): ${text.slice(0, 100)}`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`Admin login failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      console.log('  Admin signed in:', data.user?.name, `(${data.user?.email})`);
      return {
        accessToken: data.token,
        refreshToken: '',
        expiresAt: data.expiresAt,
        user: {
          ...data.user,
          id: String(data.user?.id || '1')
        },
      };
    } catch (err) {
      if (attempt < maxAttempts) {
        console.warn(`  Attempt ${attempt} error: ${err.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      } else {
        throw err;
      }
    }
  }
}

function saveScreenshot(filename, buffer) {
  const p1 = join(artifactsDir, filename);
  const p2 = join(localScreenshotsDir, filename);
  writeFileSync(p1, buffer);
  writeFileSync(p2, buffer);
  console.log(`  Saved screenshot: ${filename} (${buffer.length} bytes)`);
}

async function runAudit() {
  console.log('=== STARTING PRODUCTION CHROME CDP VISUAL AUDIT ON SHA fb5dd97 ===\n');
  const session = await getAdminSession();

  console.log('\n[2/4] Launching native Chrome on CDP port 9666...');
  const browser = await launchBrowser({ headless: true, port: 9666 });
  console.log('  Chrome started successfully.');

  try {
    // Seed session at origin
    console.log('\n[3/4] Seeding admin session into localStorage...');
    await browser.navigate(`${siteBase}/`);
    await browser.evaluate(`
      localStorage.setItem('luxedge_sb_session', JSON.stringify(${JSON.stringify(session)}));
      localStorage.setItem('hk_mobile_theme', 'dark');
      document.documentElement.setAttribute('data-mobile-theme', 'dark');
    `);
    console.log('  Admin session seeded.');

    // Helper to test a page with mobile emulation
    async function auditMobilePage({ url, name, theme = 'dark', waitMs = 5000 }) {
      console.log(`\n--- Auditing Mobile [${name}] (Theme: ${theme}, URL: ${url}) ---`);
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true,
      });

      // Set theme in localStorage before navigating
      await browser.evaluate(`
        localStorage.setItem('hk_mobile_theme', '${theme}');
        document.documentElement.setAttribute('data-mobile-theme', '${theme}');
      `);

      await browser.navigate(url);
      await new Promise((r) => setTimeout(r, waitMs));

      // Re-assert theme attribute if needed
      await browser.evaluate(`
        const current = localStorage.getItem('hk_mobile_theme') || '${theme}';
        document.documentElement.setAttribute('data-mobile-theme', current);
      `);

      if (url.includes('/admin/leados')) {
        await browser.evaluate(`
          new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
              const hasItems = document.querySelectorAll('h3').length > 0;
              if (hasItems || Date.now() - start > 12000) {
                clearInterval(interval);
                resolve();
              }
            }, 300);
          })
        `);
      }

      // Check overflow metrics
      const metrics = await browser.evaluate(`(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body.scrollWidth;
        const currentTheme = document.documentElement.getAttribute('data-mobile-theme');
        const mainEl = document.querySelector('main');
        const mainBg = mainEl ? window.getComputedStyle(mainEl).backgroundColor : 'none';
        
        return {
          title: document.title,
          currentTheme,
          mainBg,
          winWidth,
          docWidth,
          bodyWidth
        };
      })()`);

      console.log(`  Metrics: width=${metrics.winWidth}px, docWidth=${metrics.docWidth}px, mainBg=${metrics.mainBg}`);

      const ss = await browser.screenshot();
      const filename = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      saveScreenshot(filename, ss);
      return { name, theme, ...metrics, filename };
    }

    // Helper for desktop
    async function auditDesktopPage({ url, name, waitMs = 4000 }) {
      console.log(`\n--- Auditing Desktop [${name}] (Width: 1440px, URL: ${url}) ---`);
      await browser.send('Emulation.clearDeviceMetricsOverride');
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await browser.navigate(url);
      await new Promise((r) => setTimeout(r, waitMs));

      if (url.includes('/admin/leados')) {
        await browser.evaluate(`
          new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
              const row = document.querySelector('tbody tr') || document.querySelector('.leados-workspace');
              if (row || Date.now() - start > 12000) {
                clearInterval(interval);
                resolve();
              }
            }, 300);
          })
        `);
      }

      const metrics = await browser.evaluate(`(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const hasDesktopRail = Boolean(document.querySelector('.admin-rail-link') || document.querySelector('.admin-topbar'));
        const railBg = document.querySelector('.hk-admin')?.getAttribute('class') || '';
        return {
          title: document.title,
          winWidth,
          docWidth,
          hasDesktopRail,
          railBg
        };
      })()`);

      console.log(`  Metrics: width=${metrics.winWidth}px, docWidth=${metrics.docWidth}px, hasDesktopRail=${metrics.hasDesktopRail}`);

      const ss = await browser.screenshot();
      const filename = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      saveScreenshot(filename, ss);
      return { name, ...metrics, filename };
    }

    const auditResults = [];

    // 1. Leads Dark
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/leados`,
      name: 'leads-dark',
      theme: 'dark',
      waitMs: 9000,
    }));

    // 2. Leads Light
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/leados`,
      name: 'leads-light',
      theme: 'light',
      waitMs: 8000,
    }));

    // 3. Inbox Dark
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/inbox`,
      name: 'inbox-dark',
      theme: 'dark',
    }));

    // 4. Inbox Light
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/inbox`,
      name: 'inbox-light',
      theme: 'light',
    }));

    // 5. Dashboard Mobile
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin`,
      name: 'dashboard-mobile',
      theme: 'dark',
    }));

    // 6. Products Mobile
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/products`,
      name: 'products-mobile',
      theme: 'dark',
    }));

    // 7. Orders Mobile
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/orders`,
      name: 'orders-mobile',
      theme: 'dark',
    }));

    // 8. Wholesale Mobile
    auditResults.push(await auditMobilePage({
      url: `${siteBase}/admin/wholesale`,
      name: 'wholesale-mobile',
      theme: 'dark',
    }));

    // 9. Original Desktop Dashboard
    auditResults.push(await auditDesktopPage({
      url: `${siteBase}/admin`,
      name: 'original-desktop',
    }));

    // 10. Original Desktop LeadOS
    auditResults.push(await auditDesktopPage({
      url: `${siteBase}/admin/leados`,
      name: 'original-desktop-leados',
    }));

    console.log('\n=== AUDIT COMPLETE ===');
    console.table(auditResults.map(r => ({
      Page: r.name,
      Theme: r.theme || 'desktop',
      Width: r.winWidth,
      DocWidth: r.docWidth,
      File: r.filename
    })));

  } finally {
    await browser.close();
  }
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
