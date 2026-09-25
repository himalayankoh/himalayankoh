import { launchBrowser } from './qa-cdp.mjs';

const VIEWPORTS = [320, 360, 375, 390, 430];

async function run() {
  console.log('=== STARTING SUITE 3: MOBILE HOMEPAGE VIEWPORT OVERFLOW CHECK ===');
  const browser = await launchBrowser({ headless: true });

  try {
    const results = [];

    for (const w of VIEWPORTS) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 800,
        deviceScaleFactor: 2,
        mobile: true,
      });

      await browser.navigate('https://preview.himalayankoh.com/');
      await new Promise(r => setTimeout(r, 1500));

      const metrics = await browser.evaluate(`(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body.scrollWidth;
        
        // Find any elements exceeding winWidth
        const overflowing = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (rect.right > winWidth + 1) {
            overflowing.push({
              tag: el.tagName,
              className: el.className?.toString()?.slice(0, 50) || '',
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            });
          }
        }
        return {
          docWidth,
          winWidth,
          bodyWidth,
          overflowCount: overflowing.length,
          sampleOverflow: overflowing.slice(0, 3)
        };
      })()`);

      const pass = metrics.docWidth <= w && metrics.bodyWidth <= w;
      console.log(`Viewport ${w}px: docWidth=${metrics.docWidth}px, bodyWidth=${metrics.bodyWidth}px -> ${pass ? 'PASS' : 'FAIL'}`);
      if (!pass) {
        console.log('  Overflow elements:', JSON.stringify(metrics.sampleOverflow));
      }

      results.push({
        Viewport_Width: `${w}px`,
        Doc_ScrollWidth: `${metrics.docWidth}px`,
        Body_ScrollWidth: `${metrics.bodyWidth}px`,
        Overflowing_Elements: metrics.overflowCount,
        Status: pass ? 'PASS' : 'FAIL'
      });
    }

    console.log('\n=== SUITE 3 MOBILE SUMMARY ===');
    console.table(results);

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
