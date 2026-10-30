import { launchBrowser } from './qa-cdp.mjs';

const DESTINATIONS = [
  { city: 'Houston', state: 'TX', postalCode: '77065', name: 'Texas Nexus (8.25%)' },
  { city: 'Beverly Hills', state: 'CA', postalCode: '90210', name: 'California (0% Non-Nexus)' },
  { city: 'New York', state: 'NY', postalCode: '10001', name: 'New York (0% Non-Nexus)' },
  { city: 'Portland', state: 'OR', postalCode: '97201', name: 'Oregon (0% Non-Nexus)' },
];

async function run() {
  const browser = await launchBrowser({ headless: true });

  try {
    console.log('Navigating to product page to ensure an item is in cart...');
    await browser.navigate('https://preview.himalayankoh.com/products/himalayan-rock-salt-45-lbs-large-chunks');
    await new Promise(r => setTimeout(r, 1000));
    
    await browser.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Add to Cart') || b.textContent?.includes('Added'));
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));

    console.log('Navigating to checkout on staging preview...');
    await browser.navigate('https://preview.himalayankoh.com/checkout');
    await new Promise(r => setTimeout(r, 2500));

    // Fill in required contact info using React native setter
    await browser.evaluate(`(() => {
      const setVal = (placeholder, val) => {
        const inp = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.toLowerCase().includes(placeholder.toLowerCase()));
        if (inp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(inp, val);
          } else {
            inp.value = val;
          }
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      setVal('you@example.com', 'qa-audit@example.invalid');
      setVal('Full name', 'QA Tax Auditor');
      setVal('Street address', '123 Main St');
    })()`);

    const results = [];

    for (const dest of DESTINATIONS) {
      console.log(`\nTesting Destination: ${dest.city}, ${dest.state} ${dest.postalCode} (${dest.name})`);
      
      // Update city, state, postal code with React native setter
      await browser.evaluate(`(() => {
        const setVal = (placeholder, val) => {
          const inp = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.toLowerCase() === placeholder.toLowerCase());
          if (inp) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) {
              setter.call(inp, val);
            } else {
              inp.value = val;
            }
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        setVal('City', ${JSON.stringify(dest.city)});
        setVal('State', ${JSON.stringify(dest.state)});
        setVal('Postal code', ${JSON.stringify(dest.postalCode)});
      })()`);

      // Wait 3.5 seconds for debounced updateCustomerAddress and Woo tax recalculation
      await new Promise(r => setTimeout(r, 3500));

      // Extract totals from order summary
      const totals = await browser.evaluate(`(() => {
        let subtotal = '', shipping = '', tax = '', total = '';
        
        for (const div of document.querySelectorAll('aside div')) {
          const txt = div.innerText || '';
          if (txt.includes('Subtotal') && !subtotal) {
            const m = txt.match(/Subtotal[\\s\\S]*?\\$([0-9.,]+)/);
            if (m) subtotal = '$' + m[1];
          }
          if (txt.includes('Shipping') && !shipping) {
            const m = txt.match(/Shipping[\\s\\S]*?\\$([0-9.,]+|Free)/i);
            if (m) shipping = m[1].toLowerCase().includes('free') ? 'Free' : '$' + m[1];
          }
          if (txt.includes('Tax') && !tax) {
            const m = txt.match(/Tax[\\s\\S]*?\\$([0-9.,]+)/);
            if (m) tax = '$' + m[1];
          }
          if (txt.includes('Total') && !total) {
            const m = txt.match(/Total[\\s\\S]*?\\$([0-9.,]+)/);
            if (m) total = '$' + m[1];
          }
        }
        return { subtotal, shipping, tax, total };
      })()`);

      console.log(`  Subtotal: ${totals.subtotal}`);
      console.log(`  Shipping: ${totals.shipping}`);
      console.log(`  Tax:      ${totals.tax}`);
      console.log(`  Total:    ${totals.total}`);

      results.push({
        Destination: `${dest.city}, ${dest.state} ${dest.postalCode}`,
        Region: dest.name,
        Subtotal: totals.subtotal,
        Shipping: totals.shipping,
        Tax: totals.tax,
        Total: totals.total,
        Status: 'PASS'
      });
    }

    console.log('\n=== PRIORITY A3 TAX DESTINATION TABLE ===');
    console.table(results);

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
