import { readFileSync } from 'node:fs';
import { launchBrowser } from './qa-cdp.mjs';

const envFile = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const at = line.indexOf('=');
  if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '');
}

const WOO_BASE = env.WORDPRESS_BASE_URL.replace(/\/+$/, '');
const auth = 'Basic ' + Buffer.from(env.WOOCOMMERCE_CONSUMER_KEY + ':' + env.WOOCOMMERCE_CONSUMER_SECRET).toString('base64');

async function getProductStock(id) {
  const res = await fetch(`${WOO_BASE}/wp-json/wc/v3/products/${id}`, { headers: { Authorization: auth } });
  const p = await res.json();
  return { id: p.id, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock };
}

async function restoreStock(id, qty) {
  await fetch(`${WOO_BASE}/wp-json/wc/v3/products/${id}`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_quantity: qty })
  });
}

async function trashOrder(orderId) {
  await fetch(`${WOO_BASE}/wp-json/wc/v3/orders/${orderId}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: auth }
  });
}

async function run() {
  console.log('=== STARTING SUITE 5: OFFLINE QA ORDER FLOW IN CHROME ===');

  const initialStock = await getProductStock(2487);
  console.log(`Initial stock for Product 2487 (Himalayan Salt Lick 5-6 lbs): ${initialStock.stock_quantity}`);

  const browser = await launchBrowser({ headless: true });
  let createdOrderId = null;

  try {
    // Clear any previous cart cookies by navigating and evaluating
    await browser.navigate('https://preview.himalayankoh.com/');
    await new Promise(r => setTimeout(r, 1000));
    
    // Clear cart via cart API
    await browser.evaluate(`fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) })`);
    await new Promise(r => setTimeout(r, 1000));

    // Navigate to product 2487
    console.log('Navigating to product 2487...');
    await browser.navigate('https://preview.himalayankoh.com/products/himalayan-salt-lick-5-to-6-lbs');
    await new Promise(r => setTimeout(r, 2000));

    // Add 1 item to cart
    console.log('Adding product 2487 to cart...');
    await browser.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Add to Cart') || b.textContent?.includes('Added'));
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 2500));

    // Navigate to checkout
    console.log('Navigating to checkout...');
    await browser.navigate('https://preview.himalayankoh.com/checkout');
    await new Promise(r => setTimeout(r, 3000));

    // Fill in required contact info with React native setters
    console.log('Filling in contact and shipping info...');
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
      setVal('you@example.com', 'qa-offline-audit@example.invalid');
      setVal('(832) 224-6466', '8322246466');
      setVal('Full name', 'QA Offline Auditor');
      setVal('Street address', '12620 FM 1960 W');
      setVal('City', 'Houston');
      setVal('State', 'TX');
      setVal('Postal code', '77065');
      setVal('Country', 'United States');
    })()`);

    // Select Pay by Invoice
    console.log('Selecting Pay by Invoice...');
    await browser.evaluate(`(() => {
      const invoiceBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Pay by Invoice'));
      if (invoiceBtn) invoiceBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));

    // Read checkout totals
    const checkoutTotals = await browser.evaluate(`(() => {
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

    console.log('Checkout Totals:', checkoutTotals);

    // Click Place order (invoice)
    console.log('Submitting Place order (invoice)...');
    await browser.evaluate(`(() => {
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Place order (invoice)'));
      if (submitBtn) submitBtn.click();
    })()`);

    // Wait for navigation to order confirmation
    console.log('Waiting for order confirmation...');
    await new Promise(r => setTimeout(r, 7000));

    const confirmationInfo = await browser.evaluate(`(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 500)
      };
    })()`);

    console.log('Confirmation URL:', confirmationInfo.url);
    const orderMatch = confirmationInfo.url.match(/order-confirmation\?orderId=([0-9]+)/) ||
                       confirmationInfo.bodyText.match(/Order #?([0-9]+)/i);

    if (orderMatch) {
      createdOrderId = orderMatch[1];
      console.log(`\nCreated QA Order ID: ${createdOrderId}`);
    } else {
      console.log('Order text snippet:', confirmationInfo.bodyText.slice(0, 300));
    }

    // Verify created order in WooCommerce
    if (createdOrderId) {
      const wooOrderRes = await fetch(`${WOO_BASE}/wp-json/wc/v3/orders/${createdOrderId}`, {
        headers: { Authorization: auth }
      });
      const wooOrder = await wooOrderRes.json();
      
      console.log('\n=== WOOCOMMERCE ORDER TOTALS ===');
      console.log(`Order ID:     ${wooOrder.id}`);
      console.log(`Subtotal:     $${wooOrder.line_items?.[0]?.subtotal || ''}`);
      console.log(`Shipping:     $${wooOrder.shipping_total || ''}`);
      console.log(`Tax:          $${wooOrder.total_tax || ''}`);
      console.log(`Total:        $${wooOrder.total || ''}`);
      console.log(`Payment:      ${wooOrder.payment_method_title || wooOrder.payment_method}`);
      console.log(`Customer:     ${wooOrder.billing?.email}`);

      // Verify managed stock deduction
      const afterStock = await getProductStock(2487);
      console.log(`\nStock for Product 2487 after order: ${afterStock.stock_quantity}`);
      const stockDeducted = Number(initialStock.stock_quantity) - Number(afterStock.stock_quantity) === 1;
      console.log(`Stock correctly deducted by 1: ${stockDeducted ? 'YES' : 'NO'}`);

      // Check comparison table
      console.log('\n=== TOTALS EQUALITY VERIFICATION ===');
      const equalityTable = [
        {
          Metric: 'Subtotal',
          Checkout: checkoutTotals.subtotal,
          Created_Woo_Order: `$${Number(wooOrder.line_items?.[0]?.subtotal || 0).toFixed(2)}`,
          Equal: checkoutTotals.subtotal.replace('$', '') === Number(wooOrder.line_items?.[0]?.subtotal || 0).toFixed(2) ? 'PASS' : 'FAIL'
        },
        {
          Metric: 'Shipping',
          Checkout: checkoutTotals.shipping,
          Created_Woo_Order: `$${Number(wooOrder.shipping_total || 0).toFixed(2)}`,
          Equal: checkoutTotals.shipping.replace('$', '') === Number(wooOrder.shipping_total || 0).toFixed(2) ? 'PASS' : 'FAIL'
        },
        {
          Metric: 'Tax',
          Checkout: checkoutTotals.tax,
          Created_Woo_Order: `$${Number(wooOrder.total_tax || 0).toFixed(2)}`,
          Equal: checkoutTotals.tax.replace('$', '') === Number(wooOrder.total_tax || 0).toFixed(2) ? 'PASS' : 'FAIL'
        },
        {
          Metric: 'Total',
          Checkout: checkoutTotals.total,
          Created_Woo_Order: `$${Number(wooOrder.total || 0).toFixed(2)}`,
          Equal: checkoutTotals.total.replace('$', '') === Number(wooOrder.total || 0).toFixed(2) ? 'PASS' : 'FAIL'
        }
      ];
      console.table(equalityTable);

      // Cleanup
      console.log(`\nCleaning up QA Order #${createdOrderId}...`);
      await trashOrder(createdOrderId);
      console.log(`QA Order #${createdOrderId} deleted.`);

      console.log(`Restoring product 2487 stock to ${initialStock.stock_quantity}...`);
      await restoreStock(2487, initialStock.stock_quantity);
      console.log('Stock restored.');
    }

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
