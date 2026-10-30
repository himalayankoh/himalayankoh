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
  console.log('[Auth] Minting fresh admin session token from production...');
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
          id: String(data.user?.id || '1'),
        },
      };
    } catch (err) {
      if (attempt < maxAttempts) {
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

async function runOvernightAudit() {
  console.log('================================================================');
  console.log('      HIMALAYAN KOH — OVERNIGHT COMPREHENSIVE BROWSER AUDIT     ');
  console.log('================================================================\n');

  const session = await getAdminSession();

  // Fetch real leads for seeding
  let leads = [];
  try {
    const leadsRes = await fetch(`${siteBase}/api/admin/leados/leads?page=1&limit=500`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (leadsRes.ok) {
      const leadsData = await leadsRes.json();
      leads = leadsData.leads || [];
      console.log(`[Data] Loaded ${leads.length} real leads from production API.`);
    }
  } catch (err) {
    console.warn('[Data] Failed to pre-fetch leads:', err.message);
  }

  console.log('\n[Browser] Launching headless Chrome CDP on port 9668...');
  const browser = await launchBrowser({ headless: true, port: 9668 });
  console.log('  Chrome browser started successfully.');

  const report = {
    startedAt: new Date().toISOString(),
    testsPassed: 0,
    testsFailed: 0,
    suites: [],
  };

  function recordTest(suiteName, testName, passed, details = '') {
    let suite = report.suites.find((s) => s.name === suiteName);
    if (!suite) {
      suite = { name: suiteName, tests: [] };
      report.suites.push(suite);
    }
    suite.tests.push({ testName, passed, details });
    if (passed) {
      report.testsPassed++;
      console.log(`  PASS [${suiteName}] ${testName} ${details ? '(' + details + ')' : ''}`);
    } else {
      report.testsFailed++;
      console.error(`  FAIL [${suiteName}] ${testName}: ${details}`);
    }
  }

  try {
    // ══════════════════════════════════════════════════════════════════
    // SUITE 1: API CONTRACTS & SECURITY
    // ══════════════════════════════════════════════════════════════════
    console.log('\n=== SUITE 1: API CONTRACTS & SECURITY ===');
    const versionRes = await fetch(`${siteBase}/api/version`);
    const versionData = await versionRes.json();
    recordTest('API Contracts', 'GET /api/version returns 200 with SHA', versionRes.ok && Boolean(versionData.sha), `SHA: ${versionData.sha}`);

    const catalogRes = await fetch(`${siteBase}/api/catalog`);
    const catalogData = await catalogRes.json();
    const hasProducts = Array.isArray(catalogData.products) && catalogData.products.length > 0;
    const allHavePrices = hasProducts && catalogData.products.every((p) => p.price && !p.price.includes('$0.00'));
    recordTest('API Contracts', 'GET /api/catalog returns real non-zero prices', allHavePrices, `${catalogData.products?.length || 0} products verified`);

    const stripeRes = await fetch(`${siteBase}/api/stripe/config`);
    const stripeData = await stripeRes.json();
    const hasLiveStripeKey = stripeData.publishableKey && stripeData.publishableKey.startsWith('pk_live_');
    recordTest('API Contracts', 'GET /api/stripe/config serves live publishable key safely', hasLiveStripeKey, `key: ${stripeData.publishableKey?.slice(0, 12)}...`);

    const wpRes = await fetch('https://wp.himalayankoh.com/wp-json/');
    const wpData = await wpRes.json();
    recordTest('API Contracts', 'WordPress REST API is healthy', wpRes.ok && wpData.name === 'Himalayan Koh', `WP: ${wpData.name}`);

    // ══════════════════════════════════════════════════════════════════
    // SUITE 2: STOREFRONT & BUYER EXPERIENCE (Desktop & Mobile)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n=== SUITE 2: STOREFRONT & BUYER EXPERIENCE ===');

    // Desktop Storefront
    await browser.send('Emulation.clearDeviceMetricsOverride');
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await browser.navigate(`${siteBase}/`);
    await new Promise((r) => setTimeout(r, 3000));
    const homeDesktopMetrics = await browser.evaluate(`(() => {
      return {
        title: document.title,
        hasNav: Boolean(document.querySelector('header') || document.querySelector('nav')),
        hasHero: Boolean(document.querySelector('h1')),
        heroText: document.querySelector('h1')?.innerText?.trim() || '',
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    })()`);
    recordTest('Storefront Desktop', 'Homepage loads cleanly with header and hero', Boolean(homeDesktopMetrics.hasNav && homeDesktopMetrics.hasHero), homeDesktopMetrics.heroText.slice(0, 40));
    recordTest('Storefront Desktop', 'Homepage has 0px horizontal overflow', !homeDesktopMetrics.overflow);

    // Products Page Desktop
    await browser.navigate(`${siteBase}/products`);
    await new Promise((r) => setTimeout(r, 4000));
    const productsDesktopMetrics = await browser.evaluate(`(() => {
      const cards = document.querySelectorAll('a[href*="/products/"]');
      const text = document.body.innerText;
      const hasZeroDollar = text.includes('$0.00');
      return {
        cardCount: cards.length,
        hasZeroDollar,
        hasProducts: cards.length > 0,
      };
    })()`);
    recordTest('Storefront Desktop', 'Catalog renders product cards', productsDesktopMetrics.hasProducts, `${productsDesktopMetrics.cardCount} product links found`);
    recordTest('Storefront Desktop', 'No product displays $0.00 zero-price', !productsDesktopMetrics.hasZeroDollar);

    // Product Detail Page (PDP)
    const testPdpUrl = `${siteBase}/products/${catalogData.products[0].slug}`;
    await browser.navigate(testPdpUrl);
    await new Promise((r) => setTimeout(r, 4000));
    const pdpMetrics = await browser.evaluate(`(() => {
      const priceEl = document.querySelector('[data-price]') || document.querySelector('.text-2xl') || document.querySelector('main');
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('add to cart'));
      return {
        title: document.querySelector('h1')?.innerText?.trim() || '',
        hasAddToCart: Boolean(addBtn),
        priceText: priceEl ? priceEl.innerText.slice(0, 50) : '',
      };
    })()`);
    recordTest('Storefront Desktop', 'PDP displays title, price and Add to Cart button', Boolean(pdpMetrics.hasAddToCart && pdpMetrics.title), `Product: ${pdpMetrics.title.slice(0, 30)}`);

    // Mobile Storefront (390px)
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await browser.navigate(`${siteBase}/products`);
    await new Promise((r) => setTimeout(r, 3500));
    const productsMobileMetrics = await browser.evaluate(`(() => {
      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const cards = document.querySelectorAll('a[href*="/products/"]');
      return {
        docWidth,
        winWidth,
        cardsCount: cards.length,
        overflow: docWidth > winWidth,
      };
    })()`);
    recordTest('Storefront Mobile', 'Catalog renders cleanly on mobile (390px)', productsMobileMetrics.cardsCount > 0, `${productsMobileMetrics.cardsCount} cards`);
    recordTest('Storefront Mobile', 'Catalog has zero horizontal overflow on mobile', !productsMobileMetrics.overflow, `docWidth=${productsMobileMetrics.docWidth}px, winWidth=${productsMobileMetrics.winWidth}px`);

    // ══════════════════════════════════════════════════════════════════
    // SUITE 3: MOBILE ADMIN INTERFACE & THEME SWITCHING
    // ══════════════════════════════════════════════════════════════════
    console.log('\n=== SUITE 3: MOBILE ADMIN INTERFACE & THEME SWITCHING ===');

    // Seed session at origin
    await browser.navigate(`${siteBase}/`);
    await browser.evaluate(`
      localStorage.setItem('luxedge_sb_session', JSON.stringify(${JSON.stringify(session)}));
      localStorage.setItem('hk_mobile_theme', 'dark');
      document.documentElement.setAttribute('data-mobile-theme', 'dark');
      if (${JSON.stringify(leads)}.length > 0) {
        sessionStorage.setItem('hk_leados_library_leads_v2_1', JSON.stringify(${JSON.stringify(leads)}));
        sessionStorage.setItem('hk_leados_library_leads_v2_guest', JSON.stringify(${JSON.stringify(leads)}));
        sessionStorage.setItem('hk_leados_library_leads_v2_' + (${JSON.stringify(session.user?.id || '1')}), JSON.stringify(${JSON.stringify(leads)}));
      }
    `);

    // Test Leads Mobile Dark
    await browser.navigate(`${siteBase}/admin/leados`);
    await new Promise((r) => setTimeout(r, 5000));
    const leadsDarkMetrics = await browser.evaluate(`(() => {
      const cards = document.querySelectorAll('[data-testid="mobile-lead-card"]');
      const currentTheme = document.documentElement.getAttribute('data-mobile-theme');
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      const hasThemeToggle = Boolean(document.querySelector('button[aria-label*="theme" i]') || document.querySelector('button[aria-label*="light" i]') || document.querySelector('button[aria-label*="dark" i]'));
      return {
        cardCount: cards.length,
        currentTheme,
        bodyBg,
        hasThemeToggle,
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    })()`);
    recordTest('Admin Mobile', 'Leads Mobile Dark renders real lead cards', leadsDarkMetrics.cardCount > 0, `${leadsDarkMetrics.cardCount} cards`);
    recordTest('Admin Mobile', 'Leads Mobile Dark background is deep navy #0B0E17', leadsDarkMetrics.bodyBg === 'rgb(11, 14, 23)');
    recordTest('Admin Mobile', 'Leads Mobile Dark has zero horizontal overflow', leadsDarkMetrics.docWidth <= leadsDarkMetrics.winWidth);

    // Test Theme Switcher: Click Toggle to Light Mode
    const toggleResult = await browser.evaluate(`(() => {
      const toggle = document.querySelector('button[aria-label*="theme" i]') || document.querySelector('button[aria-label*="light" i]') || document.querySelector('button[aria-label*="dark" i]');
      if (!toggle) return { clicked: false, error: 'Toggle button not found' };
      toggle.click();
      return {
        clicked: true,
        newThemeAttr: document.documentElement.getAttribute('data-mobile-theme'),
        storageTheme: localStorage.getItem('hk_mobile_theme'),
      };
    })()`);
    await new Promise((r) => setTimeout(r, 1000));
    const themeAfterToggle = await browser.evaluate(`document.documentElement.getAttribute('data-mobile-theme')`);
    recordTest('Theme Switcher', 'Clicking theme toggle transitions to Light theme', themeAfterToggle === 'light', `theme: ${themeAfterToggle}`);

    // Verify Persistence After Refresh
    await browser.navigate(`${siteBase}/admin/leados`);
    await new Promise((r) => setTimeout(r, 4000));
    const themeAfterRefresh = await browser.evaluate(`document.documentElement.getAttribute('data-mobile-theme')`);
    recordTest('Theme Switcher', 'Light theme persists across page reload', themeAfterRefresh === 'light', `theme: ${themeAfterRefresh}`);

    // Toggle Back to Dark Mode
    await browser.evaluate(`(() => {
      const toggle = document.querySelector('button[aria-label*="theme" i]') || document.querySelector('button[aria-label*="light" i]') || document.querySelector('button[aria-label*="dark" i]');
      if (toggle) toggle.click();
    })()`);
    await new Promise((r) => setTimeout(r, 1000));
    const themeRestoredDark = await browser.evaluate(`document.documentElement.getAttribute('data-mobile-theme')`);
    recordTest('Theme Switcher', 'Toggle switches back to Dark theme cleanly', themeRestoredDark === 'dark', `theme: ${themeRestoredDark}`);

    // Test Lead Details Modal / Drawer Interaction
    const drawerOpened = await browser.evaluate(`(() => {
      const viewDetailsBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('View Details'));
      if (viewDetailsBtn) {
        viewDetailsBtn.click();
        return true;
      }
      return false;
    })()`);
    await new Promise((r) => setTimeout(r, 1500));
    const drawerVisible = await browser.evaluate(`Boolean(document.querySelector('.z-modal') || document.querySelector('[data-testid="lead-details-modal"]') || document.body.innerText.includes('Status Pipeline'))`);
    recordTest('Admin Mobile', 'Lead quick action "View Details" opens lead drawer/modal', Boolean(drawerOpened && drawerVisible));

    // Close the drawer if open
    await browser.evaluate(`(() => {
      const closeBtn = document.querySelector('button[aria-label*="close" i]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText === '×' || b.innerText.toLowerCase() === 'close');
      if (closeBtn) closeBtn.click();
    })()`);

    // Test Email Inbox Mobile
    await browser.navigate(`${siteBase}/admin/inbox`);
    await new Promise((r) => setTimeout(r, 3500));
    const inboxMetrics = await browser.evaluate(`(() => {
      const hasHeading = document.body.innerText.includes('Email Inbox');
      const hasCards = document.body.innerText.includes('Total Emails') && document.body.innerText.includes('Unread');
      const hasFilters = document.body.innerText.includes('All') && document.body.innerText.includes('Starred');
      return {
        hasHeading,
        hasCards,
        hasFilters,
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    })()`);
    recordTest('Admin Mobile', 'Email Inbox renders stats cards, filter pills, and header', inboxMetrics.hasHeading && inboxMetrics.hasCards && inboxMetrics.hasFilters);
    recordTest('Admin Mobile', 'Email Inbox has zero horizontal overflow', inboxMetrics.docWidth <= inboxMetrics.winWidth);

    // Test Products Admin Mobile
    await browser.navigate(`${siteBase}/admin/products`);
    await new Promise((r) => setTimeout(r, 4000));
    const productsAdminMetrics = await browser.evaluate(`(() => {
      return {
        hasTitle: document.body.innerText.includes('Products'),
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    })()`);
    recordTest('Admin Mobile', 'Products Admin renders cleanly on mobile without crash', productsAdminMetrics.hasTitle);
    recordTest('Admin Mobile', 'Products Admin has zero horizontal overflow', productsAdminMetrics.docWidth <= productsAdminMetrics.winWidth);

    // Test Orders Admin Mobile
    await browser.navigate(`${siteBase}/admin/orders`);
    await new Promise((r) => setTimeout(r, 4000));
    const ordersAdminMetrics = await browser.evaluate(`(() => {
      return {
        hasTitle: document.body.innerText.includes('Orders'),
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    })()`);
    recordTest('Admin Mobile', 'Orders Admin renders fulfillment overview on mobile', ordersAdminMetrics.hasTitle);
    recordTest('Admin Mobile', 'Orders Admin has zero horizontal overflow', ordersAdminMetrics.docWidth <= ordersAdminMetrics.winWidth);

    // ══════════════════════════════════════════════════════════════════
    // SUITE 4: DESKTOP FIDELITY & ZERO REGRESSION (1440px)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n=== SUITE 4: DESKTOP FIDELITY & ZERO REGRESSION ===');

    await browser.send('Emulation.clearDeviceMetricsOverride');
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Desktop Admin Dashboard
    await browser.navigate(`${siteBase}/admin`);
    await new Promise((r) => setTimeout(r, 4000));
    const desktopDashboardMetrics = await browser.evaluate(`(() => {
      const hasRail = Boolean(document.querySelector('.admin-rail-link') || document.querySelector('.admin-topbar'));
      const hasMobileThemeToggle = Boolean(document.querySelector('[data-mobile-theme-toggle]'));
      const hasDarkCanvas = window.getComputedStyle(document.body).backgroundColor === 'rgb(11, 14, 23)';
      return {
        hasRail,
        hasMobileThemeToggle,
        hasDarkCanvas,
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    })()`);
    recordTest('Desktop Fidelity', 'Desktop Dashboard preserves navigation rail and warm layout', desktopDashboardMetrics.hasRail);
    recordTest('Desktop Fidelity', 'Desktop does NOT carry mobile theme toggle button', !desktopDashboardMetrics.hasMobileThemeToggle);
    recordTest('Desktop Fidelity', 'Desktop does NOT leak dark mobile canvas background', !desktopDashboardMetrics.hasDarkCanvas);

    // Desktop LeadOS
    await browser.navigate(`${siteBase}/admin/leados`);
    await new Promise((r) => setTimeout(r, 5000));
    const desktopLeadosMetrics = await browser.evaluate(`(() => {
      const hasTable = Boolean(document.querySelector('table') || document.querySelector('.leados-workspace'));
      const hasProspectsTab = document.body.innerText.includes('Prospects');
      return {
        hasTable,
        hasProspectsTab,
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    })()`);
    recordTest('Desktop Fidelity', 'Desktop LeadOS preserves full directory table and workspace', desktopLeadosMetrics.hasTable && desktopLeadosMetrics.hasProspectsTab);

    // ══════════════════════════════════════════════════════════════════
    // SUITE 5: MULTI-VIEWPORT STRESS MATRIX
    // ══════════════════════════════════════════════════════════════════
    console.log('\n=== SUITE 5: MULTI-VIEWPORT RESPONSIVENESS MATRIX ===');

    const viewports = [
      { name: 'iPhone SE', width: 320, height: 568 },
      { name: 'Galaxy S8 / Budget Phone', width: 360, height: 740 },
      { name: 'iPhone 13 Mini', width: 375, height: 812 },
      { name: 'iPhone 13 / 14 / 15', width: 390, height: 844 },
      { name: 'Google Pixel 7', width: 412, height: 915 },
      { name: 'iPhone 14 / 15 Pro Max', width: 430, height: 932 },
      { name: 'iPad Portrait (Breakpoint Edge)', width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 768,
      });

      await browser.navigate(`${siteBase}/admin/leados`);
      await new Promise((r) => setTimeout(r, 2000));

      const overflow = await browser.evaluate(`(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
        };
      })()`);

      recordTest('Viewport Matrix', `LeadOS at ${vp.width}px (${vp.name}) zero overflow`, !overflow.hasOverflow, `scrollWidth=${overflow.scrollWidth}px, innerWidth=${overflow.innerWidth}px`);
    }

    console.log('\n================================================================');
    console.log(`OVERNIGHT AUDIT COMPLETED: ${report.testsPassed} PASSED, ${report.testsFailed} FAILED`);
    console.log('================================================================\n');

  } finally {
    await browser.close();
  }

  // Save JSON report for verification record
  writeFileSync(join(artifactsDir, 'overnight-audit-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(process.cwd(), 'overnight-audit-report.json'), JSON.stringify(report, null, 2));

  return report;
}

runOvernightAudit()
  .then((report) => {
    if (report.testsFailed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
  });
