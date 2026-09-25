import { launchBrowser } from './qa-cdp.mjs';

const PUBLIC_PRODUCTS = [
  { id: 2497, slug: 'himalayan-rock-salt-45-lbs-large-chunks', name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)' },
  { id: 2492, slug: 'himalayan-salt-6-lbs', name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs' },
  { id: 2490, slug: 'himalayan-salt-fine-grain-3-lbs', name: 'Himalayan Salt Fine Grain — 3 lbs' },
  { id: 2488, slug: 'himalayan-salt-lick-12-to-14-lbs', name: 'Himalayan Salt Lick — 12 to 14 lbs' },
  { id: 2487, slug: 'himalayan-salt-lick-5-to-6-lbs', name: 'Himalayan Salt Lick — 5 to 6 lbs' },
  { id: 2485, slug: 'himalayan-salt-lick-1-to-2-lbs', name: 'Himalayan Salt Lick — 1 to 2 lbs' },
  { id: 2484, slug: 'himalayan-salt-block-30-lbs', name: 'Himalayan Salt Block — 30 lbs' },
  { id: 2482, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs', name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 6 lbs' },
  { id: 2481, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-3-lbs', name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 3 lbs' },
  { id: 2479, slug: 'himalayan-pink-edible-salt-16-oz-jar', name: 'Himalayan Pink Edible Salt Fine & Coarse Grain — 16 oz Jar' },
];

async function runCartPdpTests() {
  console.log('=== STARTING SUITE 1: 10 PUBLIC PRODUCTS CART RETEST IN CHROME ===');
  const browser = await launchBrowser({ headless: true });
  const results = [];

  try {
    for (const prod of PUBLIC_PRODUCTS) {
      console.log(`\nTesting Product ${prod.id}: ${prod.name}`);
      const pdpUrl = `https://preview.himalayankoh.com/products/${prod.slug}`;

      // Measure PDP navigation & readiness
      const t0 = performance.now();
      await browser.navigate(pdpUrl);
      const pdpNavMs = Math.round(performance.now() - t0);

      // Verify page title and SEO meta description
      const seoInfo = await browser.evaluate(`(() => {
        const meta = document.querySelector('meta[name="description"]')?.content || '';
        const title = document.title;
        return { meta, title };
      })()`);

      console.log(`  PDP loaded in ${pdpNavMs}ms: "${seoInfo.title}"`);
      console.log(`  Meta description: "${seoInfo.meta.slice(0, 100)}..."`);

      // Check if Add to Cart button exists
      const btnState = await browser.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => b.textContent.includes('Add to Cart'));
        return {
          exists: !!addBtn,
          disabled: addBtn ? addBtn.disabled : null,
          text: addBtn ? addBtn.textContent.trim() : null
        };
      })()`);

      if (!btnState.exists) {
        console.error(`  FAIL: Add to Cart button not found on ${prod.slug}`);
        results.push({ ...prod, success: false, error: 'Add to Cart button missing' });
        continue;
      }

      // Click Add to Cart and measure response time
      const addStart = performance.now();
      
      // Trigger click
      await browser.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => b.textContent.includes('Add to Cart'));
        addBtn.click();
      })()`);

      // Check loading feedback within 300ms
      await new Promise(r => setTimeout(r, 80));
      const loadingState = await browser.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const activeBtn = btns.find(b => b.textContent.includes('Adding to Cart') || b.textContent.includes('Add to Cart') || b.textContent.includes('Added to Cart'));
        const hasSpinner = !!activeBtn?.querySelector('.animate-spin');
        const isDisabled = !!activeBtn?.disabled;
        const text = activeBtn?.textContent.trim();
        return { hasSpinner, isDisabled, text };
      })()`);

      // Wait until button says "Added to Cart!" or loading finishes
      let addSucceeded = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 200));
        const check = await browser.evaluate(`(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const addedBtn = btns.find(b => b.textContent.includes('Added to Cart') || b.textContent.includes('Add to Cart'));
          const cartBadge = document.querySelector('button[aria-label="Cart"] span');
          return {
            isAdded: !!btns.find(b => b.textContent.includes('Added to Cart')),
            cartCount: cartBadge ? cartBadge.textContent.trim() : '0'
          };
        })()`);
        if (check.isAdded || Number(check.cartCount) > 0) {
          addSucceeded = true;
          break;
        }
      }

      const addMs = Math.round(performance.now() - addStart);
      console.log(`  Add to Cart completed in ${addMs}ms (immediate loading feedback: ${loadingState.hasSpinner || loadingState.isDisabled || loadingState.text?.includes('Adding')})`);

      // Now open Cart Drawer via header Cart button
      await browser.evaluate(`(() => {
        const cartBtn = document.querySelector('button[aria-label="Cart"]');
        if (cartBtn) cartBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 600));

      // Inspect Cart Drawer DOM & Accessibility
      const drawerData = await browser.evaluate(`(() => {
        const closeBtn = document.querySelector('button[aria-label="Close cart"]');
        const plusBtn = document.querySelector('button[aria-label*="Increase quantity"]');
        const minusBtn = document.querySelector('button[aria-label*="Decrease quantity"]');
        const removeBtn = document.querySelector('button[aria-label*="Remove"]');
        
        const itemEls = Array.from(document.querySelectorAll('h4.font-semibold')).map(e => e.textContent.trim());
        const subtotalEl = Array.from(document.querySelectorAll('span')).find(e => e.textContent === 'Subtotal')?.nextElementSibling;
        const qtySpan = document.querySelector('button[aria-label*="Decrease quantity"]')?.nextElementSibling;

        return {
          hasCloseAria: !!closeBtn,
          closeAria: closeBtn ? closeBtn.getAttribute('aria-label') : null,
          hasPlusAria: !!plusBtn,
          plusAria: plusBtn ? plusBtn.getAttribute('aria-label') : null,
          hasMinusAria: !!minusBtn,
          minusAria: minusBtn ? minusBtn.getAttribute('aria-label') : null,
          hasRemoveAria: !!removeBtn,
          removeAria: removeBtn ? removeBtn.getAttribute('aria-label') : null,
          items: itemEls,
          subtotalText: subtotalEl ? subtotalEl.textContent.trim() : '',
          currentQty: qtySpan ? qtySpan.textContent.trim() : ''
        };
      })()`);

      console.log(`  Drawer items:`, drawerData.items);
      console.log(`  Subtotal: ${drawerData.subtotalText} | Qty: ${drawerData.currentQty}`);
      console.log(`  Accessibility labels:`);
      console.log(`    Close: "${drawerData.closeAria}"`);
      console.log(`    Plus: "${drawerData.plusAria}"`);
      console.log(`    Minus: "${drawerData.minusAria}"`);
      console.log(`    Remove: "${drawerData.removeAria}"`);

      // Test Quantity Increase (+)
      await browser.evaluate(`(() => {
        const plusBtn = document.querySelector('button[aria-label*="Increase quantity"]');
        if (plusBtn) plusBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 1000));
      const afterInc = await browser.evaluate(`(() => {
        const qtySpan = document.querySelector('button[aria-label*="Decrease quantity"]')?.nextElementSibling;
        const subtotalEl = Array.from(document.querySelectorAll('span')).find(e => e.textContent === 'Subtotal')?.nextElementSibling;
        return { qty: qtySpan ? qtySpan.textContent.trim() : null, subtotal: subtotalEl ? subtotalEl.textContent.trim() : '' };
      })()`);
      console.log(`  After (+): qty = ${afterInc.qty}, subtotal = ${afterInc.subtotal}`);

      // Test Quantity Decrease (-)
      await browser.evaluate(`(() => {
        const minusBtn = document.querySelector('button[aria-label*="Decrease quantity"]');
        if (minusBtn) minusBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 1000));
      const afterDec = await browser.evaluate(`(() => {
        const qtySpan = document.querySelector('button[aria-label*="Decrease quantity"]')?.nextElementSibling;
        const subtotalEl = Array.from(document.querySelectorAll('span')).find(e => e.textContent === 'Subtotal')?.nextElementSibling;
        return { qty: qtySpan ? qtySpan.textContent.trim() : null, subtotal: subtotalEl ? subtotalEl.textContent.trim() : '' };
      })()`);
      console.log(`  After (-): qty = ${afterDec.qty}, subtotal = ${afterDec.subtotal}`);

      // Close cart drawer
      await browser.evaluate(`(() => {
        const closeBtn = document.querySelector('button[aria-label="Close cart"]');
        if (closeBtn) closeBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 500));

      const itemMatches = drawerData.items.some(name => prod.name.includes(name) || name.includes(prod.name.slice(0, 20)));

      results.push({
        ...prod,
        pdpNavMs,
        addMs,
        immediateLoading: loadingState.hasSpinner || loadingState.isDisabled || loadingState.text?.includes('Adding'),
        drawerOpened: drawerData.hasCloseAria,
        hasAria: drawerData.hasCloseAria && drawerData.hasPlusAria && drawerData.hasMinusAria && drawerData.hasRemoveAria,
        itemFound: itemMatches || drawerData.items.length > 0,
        qtyIncOk: afterInc.qty === '2',
        qtyDecOk: afterDec.qty === '1',
        subtotalText: drawerData.subtotalText,
        metaDescription: seoInfo.meta,
        success: addSucceeded && (drawerData.hasCloseAria)
      });
    }

    // Refresh Persistence Test
    console.log('\n--- TESTING REFRESH PERSISTENCE ---');
    await browser.evaluate('location.reload()');
    await new Promise(r => setTimeout(r, 3000));
    const cartCountAfterReload = await browser.evaluate(`(() => {
      const badge = document.querySelector('button[aria-label="Cart"] span');
      return badge ? badge.textContent.trim() : '0';
    })()`);
    console.log(`Cart item count badge after page reload: ${cartCountAfterReload}`);

    // Direct Checkout Hydration Test (Priority A4)
    console.log('\n--- TESTING DIRECT CHECKOUT HYDRATION (PRIORITY A4) ---');
    const chkStart = performance.now();
    await browser.navigate('https://preview.himalayankoh.com/checkout');
    const chkNavMs = Math.round(performance.now() - chkStart);

    const checkoutState = await browser.evaluate(`(() => {
      const text = document.body.innerText;
      const hasPreparing = text.includes('Preparing your checkout') || text.includes('Loading your cart');
      const hasEmptyNotice = text.includes('Your cart is empty');
      const hasOrderSummary = text.includes('Order Summary');
      return { hasPreparing, hasEmptyNotice, hasOrderSummary };
    })()`);
    console.log(`Checkout loaded in ${chkNavMs}ms:`);
    console.log(`  False "Your cart is empty" flash: ${checkoutState.hasEmptyNotice}`);
    console.log(`  Has Order Summary: ${checkoutState.hasOrderSummary}`);

    console.log('\n=== SUITE 1 SUMMARY ===');
    console.table(results.map(r => ({
      Product: r.name.slice(0, 32),
      PDP_Nav: `${r.pdpNavMs}ms`,
      Add_Time: `${r.addMs}ms`,
      Immediate_Loader: r.immediateLoading ? 'YES' : 'NO',
      Aria_Labels: r.hasAria ? 'YES' : 'NO',
      Qty_Cycle: (r.qtyIncOk && r.qtyDecOk) ? 'PASS' : 'WARN',
      Status: r.success ? 'PASS' : 'FAIL'
    })));

    return { results, cartCountAfterReload, checkoutState };
  } finally {
    await browser.close();
  }
}

runCartPdpTests().catch(err => {
  console.error('Test Suite 1 Error:', err);
  process.exit(1);
});
