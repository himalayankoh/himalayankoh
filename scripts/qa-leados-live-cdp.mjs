import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { launchBrowser } from './qa-cdp.mjs';

const env = parse(readFileSync('.env.local'));
const siteBase = 'https://himalayankoh.com';
const artifactsDir = 'C:/Users/basco/.gemini/antigravity-ide/brain/6dad7f9a-64da-4eff-8985-65025e454e58';

async function getAdminSession() {
  console.log('[1/6] Minting admin session token from production...');
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

async function runBrowserQA() {
  console.log('=== STARTING PRODUCTION CHROME CDP QA FOR LEAD-OS ===\n');
  const session = await getAdminSession();

  console.log('\n[2/6] Launching native Chrome on CDP port 9333...');
  const browser = await launchBrowser({ headless: true, port: 9333 });
  console.log('  Chrome started successfully.');

  try {
    // Navigate to origin first to seed localStorage
    console.log('\n[3/6] Seeding admin session into localStorage at himalayankoh.com...');
    await browser.navigate(`${siteBase}/`);
    await browser.evaluate(`
      localStorage.setItem('luxedge_sb_session', JSON.stringify(${JSON.stringify(session)}));
    `);
    console.log('  Session injected into luxedge_sb_session.');

    // Navigate to Market Map
    console.log('\n[4/6] Navigating to /admin/leados?tab=market-map...');
    await browser.navigate(`${siteBase}/admin/leados?tab=market-map`);
    
    // Wait for content to settle and load
    await new Promise((r) => setTimeout(r, 4000));

    // Capture initial Market Map screenshot
    console.log('  Capturing Market Map screenshot...');
    const ss1 = await browser.screenshot();
    const ss1Path = join(artifactsDir, 'leados-market-map-prod.png');
    writeFileSync(ss1Path, ss1);
    console.log('  Saved screenshot to:', ss1Path);

    // Inspect DOM for Compact Toolbar & Scheduler Status
    const domCheck = await browser.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasScheduler = bodyText.includes('Market Discovery Scheduler') || bodyText.includes('Autonomous Scheduler') || bodyText.includes('Discovery Worker');
        const hasEvidence = bodyText.includes('proven in durable store') || bodyText.includes('scheduled background scan');
        const hasStateMetrics = bodyText.includes('Texas') || bodyText.includes('Oklahoma') || bodyText.includes('Florida');
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
        const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || 'unknown';
        
        return {
          title: document.title,
          url: window.location.href,
          hasScheduler,
          hasEvidence,
          hasStateMetrics,
          sampleButtons: buttons.slice(0, 15),
          bodySnippet: bodyText.slice(0, 500).replace(/\\s+/g, ' ')
        };
      })()
    `);
    console.log('  DOM inspection result:', JSON.stringify(domCheck, null, 2));

    // Interact with Texas on the map or state selector
    console.log('\n[5/6] Testing Texas territory zoom...');
    await browser.evaluate(`
      (() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const txBtn = allButtons.find(b => b.innerText.includes('Texas') || b.innerText.includes('TX'));
        if (txBtn) {
          txBtn.click();
          return 'Clicked Texas button';
        }
        const stateSelect = document.querySelector('select');
        if (stateSelect) {
          stateSelect.value = 'TX';
          stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
          return 'Changed state select to TX';
        }
        return 'No direct TX button found in DOM';
      })()
    `);

    await new Promise((r) => setTimeout(r, 2500));
    const ss2 = await browser.screenshot();
    const ss2Path = join(artifactsDir, 'leados-market-map-texas-zoom.png');
    writeFileSync(ss2Path, ss2);
    console.log('  Saved Texas zoom screenshot to:', ss2Path);

    // Check Search Tab / Lead Library
    console.log('\n[6/6] Navigating to /admin/leados (Search / Lead Library)...');
    await browser.navigate(`${siteBase}/admin/leados`);
    await new Promise((r) => setTimeout(r, 4000));

    const ss3 = await browser.screenshot();
    const ss3Path = join(artifactsDir, 'leados-search-library.png');
    writeFileSync(ss3Path, ss3);
    console.log('  Saved Lead Library screenshot to:', ss3Path);

    const libraryCheck = await browser.evaluate(`
      (() => {
        const text = document.body.innerText;
        return {
          url: window.location.href,
          hasLeads: text.includes('Animal Clinic') || text.includes('Veterinary') || text.includes('Houston') || text.includes('Oklahoma City'),
          snippet: text.slice(0, 600).replace(/\\s+/g, ' ')
        };
      })()
    `);
    console.log('  Library inspection result:', JSON.stringify(libraryCheck, null, 2));

    console.log('\n=== CHROME CDP QA COMPLETED SUCCESSFULLY ===');
  } finally {
    await browser.close();
    console.log('Browser closed cleanly.');
  }
}

runBrowserQA().catch((err) => {
  console.error('QA Fatal Error:', err);
  process.exit(1);
});
