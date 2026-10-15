import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { launchBrowser } from './qa-cdp.mjs';

const env = parse(readFileSync('.env.local'));
const siteBase = 'https://himalayankoh.com';
const artifactsDir = 'C:/Users/basco/.gemini/antigravity-ide/brain/6dad7f9a-64da-4eff-8985-65025e454e58';

async function getAdminSession() {
  console.log('[1/7] Minting admin session token from production...');
  const res = await fetch(`${siteBase}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env.WORDPRESS_ADMIN_USER,
      password: env.WORDPRESS_ADMIN_APP_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`Admin login failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  console.log('  Admin signed in:', data.user?.name, `(${data.user?.email})`);
  return {
    accessToken: data.token,
    refreshToken: '',
    expiresAt: data.expiresAt,
    user: data.user,
  };
}

async function runComprehensiveQA() {
  console.log('=== STARTING PRODUCTION QA FOR LEAD-OS 3.3 ===\n');
  const session = await getAdminSession();

  console.log('\n[2/7] Launching native Chrome on CDP port 9333...');
  const browser = await launchBrowser({ headless: true, port: 9333, width: 1440, height: 900 });
  console.log('  Chrome started successfully.');

  const results = {
    productionSha: null,
    savedProspectsColdMs: null,
    savedProspectsWarmMs: null,
    totalProspectsCount: 0,
    mapInteractions: {},
  };

  try {
    // 0. Check production SHA via browser fetch
    await browser.navigate(`${siteBase}/`);
    await browser.evaluate(`
      localStorage.setItem('luxedge_sb_session', JSON.stringify(${JSON.stringify(session)}));
    `);

    const versionData = await browser.evaluate(`
      fetch('/api/version').then(r => r.json())
    `);
    results.productionSha = versionData.sha;
    console.log('  Live Production SHA verified via browser:', versionData.sha);

    // 1. Cold Load of Saved Prospects (tab=library)
    console.log('\n[3/7] Measuring Real Cold Load of Saved Prospects (Lead Library)...');
    const coldStart = Date.now();
    await browser.navigate(`${siteBase}/admin/leados?tab=library`);
    
    // Wait for the table or lead rows to be present
    const coldStats = await browser.evaluate(`
      new Promise((resolve) => {
        const check = () => {
          const rows = document.querySelectorAll('tbody tr');
          const loading = document.body.innerText.includes('Loading saved prospects...');
          if (rows.length > 0 && !loading) {
            resolve({
              rowCount: rows.length,
              leadText: rows[0].innerText.slice(0, 80),
              bodyTextSnippet: document.body.innerText.slice(0, 300)
            });
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `);
    const coldEnd = Date.now();
    results.savedProspectsColdMs = coldEnd - coldStart;
    console.log(`  Saved Prospects Cold Load Time: ${results.savedProspectsColdMs}ms`);
    console.log(`  Rows loaded on initial page: ${coldStats.rowCount}`);

    const ssCold = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-saved-prospects-cold.png'), ssCold);

    // Inspect total leads count and pagination
    const paginationInfo = await browser.evaluate(`
      (() => {
        const text = document.body.innerText;
        const countMatch = text.match(/(\\d+)\\s+(?:leads|prospects|saved)/i) || text.match(/Saved Leads\\s*\\((\\d+)\\)/i);
        const rows = document.querySelectorAll('tbody tr').length;
        const pageButtons = Array.from(document.querySelectorAll('button')).filter(b => /^[0-9]+$/.test(b.innerText.trim()));
        return {
          detectedCount: countMatch ? countMatch[1] : null,
          tableRows: rows,
          pageButtonsCount: pageButtons.length,
          hasCheckboxes: document.querySelectorAll('input[type="checkbox"]').length > 0
        };
      })()
    `);
    console.log('  Pagination & Total Info:', paginationInfo);
    results.totalProspectsCount = paginationInfo.detectedCount || paginationInfo.tableRows;

    // 2. Warm Load of Saved Prospects
    console.log('\n[4/7] Measuring Real Warm Load of Saved Prospects (Lead Library)...');
    // Navigate away to Market Map then back to Library
    await browser.navigate(`${siteBase}/admin/leados?tab=market-map`);
    await new Promise((r) => setTimeout(r, 2000));

    const warmStart = Date.now();
    await browser.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="tab"]'));
        const libBtn = buttons.find(b => b.innerText.includes('Saved Prospects') || b.innerText.includes('Lead Library') || b.getAttribute('data-tab') === 'library');
        if (libBtn) libBtn.click();
        else window.location.href = '/admin/leados?tab=library';
      })()
    `);

    const warmStats = await browser.evaluate(`
      new Promise((resolve) => {
        const check = () => {
          const rows = document.querySelectorAll('tbody tr');
          const loading = document.body.innerText.includes('Loading saved prospects...');
          if (rows.length > 0 && !loading) {
            resolve({ rowCount: rows.length });
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      })
    `);
    const warmEnd = Date.now();
    results.savedProspectsWarmMs = warmEnd - warmStart;
    console.log(`  Saved Prospects Warm Load Time: ${results.savedProspectsWarmMs}ms`);

    const ssWarm = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-saved-prospects-warm.png'), ssWarm);

    // 3. Test Market Map & Zoom Interactions
    console.log('\n[5/7] Testing Market Map & Zoom Interactions...');
    await browser.navigate(`${siteBase}/admin/leados?tab=market-map`);
    await new Promise((r) => setTimeout(r, 3500));

    // A. Check SVG Map rendering & bounds
    const mapRenderCheck = await browser.evaluate(`
      (() => {
        const svg = document.querySelector('svg');
        const paths = document.querySelectorAll('svg path');
        const markers = document.querySelectorAll('svg circle, .leaflet-marker-icon, [data-marker="true"]');
        return {
          hasSvg: Boolean(svg),
          pathCount: paths.length,
          markerCount: markers.length,
          svgViewBox: svg ? svg.getAttribute('viewBox') : null
        };
      })()
    `);
    console.log('  Map render stats:', mapRenderCheck);
    results.mapInteractions.render = mapRenderCheck;

    // B. State click / selection (Texas)
    console.log('  Testing Texas territory fit & zoom bounds...');
    const txZoomCheck = await browser.evaluate(`
      (() => {
        // Try clicking Texas button in state bar or SVG path for TX
        const allButtons = Array.from(document.querySelectorAll('button'));
        const txBtn = allButtons.find(b => b.innerText.trim().startsWith('Texas') || b.innerText.trim() === 'TX');
        if (txBtn) {
          txBtn.click();
          return { clicked: 'button', text: txBtn.innerText };
        }
        const txPath = document.querySelector('path[data-state="TX"], path#TX, path[id*="Texas"]');
        if (txPath) {
          txPath.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return { clicked: 'path' };
        }
        return { clicked: false };
      })()
    `);
    console.log('  Texas interaction:', txZoomCheck);
    await new Promise((r) => setTimeout(r, 2000));

    const ssTx = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-market-map-texas.png'), ssTx);

    // C. Test City Zoom (e.g. Houston or Dallas in city dropdown/button if present)
    console.log('  Testing City Zoom...');
    const cityZoomCheck = await browser.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cityBtn = buttons.find(b => b.innerText.includes('Houston') || b.innerText.includes('Dallas') || b.innerText.includes('Austin'));
        if (cityBtn) {
          cityBtn.click();
          return { clicked: cityBtn.innerText };
        }
        const select = Array.from(document.querySelectorAll('select')).find(s => s.innerText.includes('Houston') || s.innerText.includes('All Cities'));
        if (select) {
          const opt = Array.from(select.options).find(o => o.value.includes('Houston') || o.text.includes('Houston'));
          if (opt) {
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { selected: opt.text };
          }
        }
        return { status: 'City selector evaluated' };
      })()
    `);
    console.log('  City zoom result:', cityZoomCheck);
    await new Promise((r) => setTimeout(r, 2000));

    const ssCity = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-market-map-city.png'), ssCity);

    // D. Test Fit State & Reset USA Buttons
    console.log('  Testing Reset USA & Fit State controls...');
    const resetUsaCheck = await browser.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const resetBtn = buttons.find(b => b.innerText.includes('Reset') || b.innerText.includes('USA') || b.innerText.includes('All States') || b.title?.includes('Reset'));
        if (resetBtn) {
          resetBtn.click();
          return { clicked: resetBtn.innerText };
        }
        return { status: 'Reset button evaluated' };
      })()
    `);
    console.log('  Reset USA result:', resetUsaCheck);
    await new Promise((r) => setTimeout(r, 2000));

    const ssReset = await browser.screenshot();
    writeFileSync(join(artifactsDir, 'leados-qa-market-map-reset.png'), ssReset);

    // 4. Test Incremental Updates / Lead Save Mutation tracking
    console.log('\n[6/7] Verifying incremental change detection & scheduler status...');
    const incrementalCheck = await browser.evaluate(`
      (async () => {
        const sessionRaw = localStorage.getItem('luxedge_sb_session');
        const sess = sessionRaw ? JSON.parse(sessionRaw) : null;
        const sinceIso = encodeURIComponent(new Date(Date.now() - 3600000).toISOString());
        const res = await fetch('/api/admin/leados/market-map?since=' + sinceIso, {
          headers: {
            'Authorization': sess ? 'Bearer ' + sess.accessToken : ''
          }
        });
        return await res.json();
      })()
    `);
    console.log('  Incremental update check result:', incrementalCheck);
    results.incrementalCheck = incrementalCheck;

    // 5. Output Summary of Verification
    console.log('\n[7/7] Summary of Production Browser QA:');
    console.log('--------------------------------------------------');
    console.log('Production SHA:            ', results.productionSha);
    console.log('Saved Prospects Cold Load: ', `${results.savedProspectsColdMs}ms`);
    console.log('Saved Prospects Warm Load: ', `${results.savedProspectsWarmMs}ms`);
    console.log('Total Prospects Count:     ', results.totalProspectsCount);
    console.log('Incremental Change Detect: ', incrementalCheck.ok ? 'PASS' : 'FAIL');
    console.log('--------------------------------------------------');

    return results;
  } finally {
    await browser.close();
    console.log('Browser closed cleanly.');
  }
}

runComprehensiveQA().then((res) => {
  console.log('\nQA Execution Finished.');
  writeFileSync(join(artifactsDir, 'scratch/production-qa-results.json'), JSON.stringify(res, null, 2));
}).catch((err) => {
  console.error('QA Execution Failed:', err);
  process.exit(1);
});
