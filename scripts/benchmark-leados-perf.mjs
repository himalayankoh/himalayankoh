import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { launchBrowser } from './qa-cdp.mjs';

const env = parse(readFileSync('.env.local'));
const siteBase = 'https://himalayankoh.com';
const artifactsDir = 'C:/Users/basco/.gemini/antigravity-ide/brain/6dad7f9a-64da-4eff-8985-65025e454e58';

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function median(arr) {
  return percentile(arr, 50);
}

async function getAdminSession() {
  console.log('[1/4] Authenticating admin on production...');
  for (let attempt = 1; attempt <= 4; attempt++) {
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
        const errText = await res.text();
        if (attempt < 4) {
          console.log(`  Login attempt ${attempt} failed (${res.status}), retrying in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error(`Admin login failed: ${res.status} ${errText}`);
      }

      const data = await res.json();
      console.log('  Admin signed in:', data.user?.name, `(${data.user?.email})`);
      return {
        accessToken: data.token,
        refreshToken: '',
        expiresAt: data.expiresAt,
        user: data.user,
      };
    } catch (e) {
      if (attempt < 4) {
        console.log(`  Login attempt ${attempt} error: ${e.message}, retrying in 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw e;
    }
  }
}

async function runBenchmark() {
  console.log('=== LEAD-OS SAVED PROSPECTS 10-RUN BENCHMARK & MAP QA ===\n');
  const session = await getAdminSession();

  console.log('[2/4] Launching Chrome on CDP port 9334...');
  const browser = await launchBrowser({ headless: true, port: 9334, width: 1440, height: 900 });
  console.log('  Chrome launched successfully.');

  try {
    // Navigate and set auth session
    await browser.navigate(`${siteBase}/`);
    await browser.evaluate(`
      localStorage.setItem('luxedge_sb_session', JSON.stringify(${JSON.stringify(session)}));
    `);

    // Verify SHA
    const versionData = await browser.evaluate(`
      fetch('/api/version').then(r => r.json())
    `);
    console.log('  Production SHA:', versionData.sha);

    // Warm up the route and session
    console.log('\n[3/4] Running 10 Cold & 10 Warm benchmark runs on Saved Prospects...');
    const coldTimes = [];
    const warmTimes = [];

    // First do 10 Cold runs
    for (let i = 1; i <= 10; i++) {
      // Clear sessionStorage for true cold run
      await browser.evaluate(`
        sessionStorage.clear();
      `);

      const t0 = Date.now();
      await browser.navigate(`${siteBase}/admin/leados?tab=library`);

      await browser.evaluate(`
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Cold load timeout')), 15000);
          const check = () => {
            const rows = document.querySelectorAll('tbody tr');
            const loading = document.body.innerText.includes('Loading saved prospects...');
            if (rows.length > 0 && !loading) {
              clearTimeout(timeout);
              resolve(true);
            } else {
              setTimeout(check, 30);
            }
          };
          check();
        })
      `);
      const elapsed = Date.now() - t0;
      coldTimes.push(elapsed);
      console.log(`  Cold Run ${i}/10: ${elapsed}ms`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // Now do 10 Warm runs
    // In each warm run, data is in session cache. We switch tabs or re-render tab=library
    for (let i = 1; i <= 10; i++) {
      // Navigate to overview or market-map tab first
      await browser.evaluate(`
        (() => {
          const tabBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Market Map'));
          if (tabBtn) tabBtn.click();
        })()
      `);
      await new Promise((r) => setTimeout(r, 600));

      const t0 = Date.now();
      // Click Saved Prospects tab
      await browser.evaluate(`
        (() => {
          const tabBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Saved Prospects'));
          if (tabBtn) tabBtn.click();
        })()
      `);

      await browser.evaluate(`
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Warm load timeout')), 5000);
          const check = () => {
            const rows = document.querySelectorAll('tbody tr');
            const loading = document.body.innerText.includes('Loading saved prospects...');
            if (rows.length > 0 && !loading) {
              clearTimeout(timeout);
              resolve(true);
            } else {
              setTimeout(check, 10);
            }
          };
          check();
        })
      `);
      const elapsed = Date.now() - t0;
      warmTimes.push(elapsed);
      console.log(`  Warm Run ${i}/10: ${elapsed}ms`);
      await new Promise((r) => setTimeout(r, 300));
    }

    const coldMedian = median(coldTimes);
    const coldP95 = percentile(coldTimes, 95);
    const warmMedian = median(warmTimes);
    const warmP95 = percentile(warmTimes, 95);

    console.log('\n--- PERFORMANCE SUMMARY ---');
    console.log(`Cold Load: Median = ${coldMedian}ms | P95 = ${coldP95}ms (10 runs: ${coldTimes.join(', ')}ms)`);
    console.log(`Warm Load: Median = ${warmMedian}ms | P95 = ${warmP95}ms (10 runs: ${warmTimes.join(', ')}ms)`);

    // Screenshot of Saved Prospects
    const ssLib = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-saved-prospects-bench.png'), ssLib);

    // [4/4] Map Compactness and Interaction QA
    console.log('\n[4/4] QA Testing Compact Live USA Map...');
    await browser.navigate(`${siteBase}/admin/leados?tab=market-map`);
    await new Promise((r) => setTimeout(r, 2500));

    const mapMetrics = await browser.evaluate(`
      (() => {
        const mapContainer = document.getElementById('live-usa-market-map-container') || document.querySelector('[data-testid="market-map-container"]');
        const svg = document.getElementById('live-usa-market-map-svg') || mapContainer?.querySelector('svg');
        const rect = mapContainer ? mapContainer.getBoundingClientRect() : null;
        const svgRect = svg ? svg.getBoundingClientRect() : null;
        const paths = svg ? svg.querySelectorAll('path').length : 0;
        const circles = svg ? svg.querySelectorAll('circle').length : 0;

        const expandBtn = document.getElementById('map-expand-fullscreen-toggle');
        const resetBtn = document.getElementById('map-reset-usa-button');
        const zoomInBtn = document.getElementById('map-zoom-in-button');
        const zoomOutBtn = document.getElementById('map-zoom-out-button');

        return {
          containerHeight: rect ? Math.round(rect.height) : null,
          containerWidth: rect ? Math.round(rect.width) : null,
          svgHeight: svgRect ? Math.round(svgRect.height) : null,
          svgWidth: svgRect ? Math.round(svgRect.width) : null,
          paths,
          pins: circles,
          hasExpandBtn: Boolean(expandBtn),
          hasResetBtn: Boolean(resetBtn),
          hasZoomIn: Boolean(zoomInBtn),
          hasZoomOut: Boolean(zoomOutBtn)
        };
      })()
    `);
    console.log('  Map Dimensions and Controls:', mapMetrics);

    const ssMapCompact = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-market-map-compact.png'), ssMapCompact);

    // Test Texas fit state
    console.log('  Testing Texas state selection and bounds...');
    const txClickResult = await browser.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const txBtn = buttons.find(b => b.innerText.trim().startsWith('Texas') || b.innerText.trim() === 'TX');
        if (txBtn) {
          txBtn.click();
          return { success: true, text: txBtn.innerText.trim() };
        }
        return { success: false };
      })()
    `);
    console.log('  Texas State Button Click:', txClickResult);
    await new Promise((r) => setTimeout(r, 1500));

    const txZoomMetrics = await browser.evaluate(`
      (() => {
        const svg = document.getElementById('live-usa-market-map-svg') || document.querySelector('#live-usa-market-map-container svg');
        return {
          viewBox: svg ? svg.getAttribute('viewBox') : null,
          fitBtnPresent: Boolean(document.getElementById('map-fit-state-button'))
        };
      })()
    `);
    console.log('  Texas ViewBox:', txZoomMetrics);

    const ssTexas = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-market-map-texas-zoom.png'), ssTexas);

    // Test Expand/Fullscreen Toggle
    console.log('  Testing Expand / Collapse Toggle...');
    const expandResult = await browser.evaluate(`
      (() => {
        const btn = document.getElementById('map-expand-fullscreen-toggle');
        if (btn) {
          btn.click();
          return { clicked: true, title: btn.title };
        }
        return { clicked: false };
      })()
    `);
    console.log('  Expand Button Click:', expandResult);
    await new Promise((r) => setTimeout(r, 1000));

    const expandedMetrics = await browser.evaluate(`
      (() => {
        const mapContainer = document.getElementById('live-usa-market-map-container');
        const rect = mapContainer ? mapContainer.getBoundingClientRect() : null;
        return {
          expandedHeight: rect ? Math.round(rect.height) : null
        };
      })()
    `);
    console.log('  Expanded Height:', expandedMetrics);

    // Collapse back to compact
    await browser.evaluate(`
      (() => {
        const btn = document.getElementById('map-expand-fullscreen-toggle');
        if (btn) btn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Save final JSON results
    const finalReport = {
      productionSha: versionData.sha,
      coldTimes,
      coldMedian,
      coldP95,
      warmTimes,
      warmMedian,
      warmP95,
      mapMetrics,
      txZoomMetrics,
      expandedMetrics,
    };

    writeFileSync(
      join('C:/Users/basco/.gemini/antigravity-ide/brain/6dad7f9a-64da-4eff-8985-65025e454e58/scratch', 'benchmark-results.json'),
      JSON.stringify(finalReport, null, 2)
    );
    console.log('\nBenchmark completed successfully! Results saved to benchmark-results.json');
  } finally {
    await browser.close();
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
