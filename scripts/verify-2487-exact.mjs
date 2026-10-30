import { launchBrowser } from './qa-cdp.mjs';

async function verify2487() {
  console.log('=== VERIFYING PRODUCT 2487 PDP AND CART ===');
  const browser = await launchBrowser({ headless: true });

  try {
    const url = 'https://preview.himalayankoh.com/products/himalayan-salt-lick-5-to-6-lbs';
    console.log(`Navigating to ${url}...`);
    await browser.navigate(url);
    await new Promise((r) => setTimeout(r, 2000));

    const data = await browser.evaluate(`(() => {
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      const price = document.querySelector('.text-2xl, .text-3xl, [data-testid="product-price"]')?.textContent?.trim() || '';
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      const title = document.title;
      const meta = document.querySelector('meta[name="description"]')?.content || '';
      
      const images = Array.from(document.querySelectorAll('img')).map(img => img.src);
      const mainImg = images.find(src => src.includes('lick-4.jpg') || src.includes('2105'));

      // Check schema script
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      let productSchema = null;
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.textContent || '{}');
          if (json['@graph']) {
            const p = json['@graph'].find(item => item['@type'] === 'Product');
            if (p) productSchema = p;
          } else if (json['@type'] === 'Product') {
            productSchema = json;
          }
        } catch {}
      }

      return {
        h1,
        price,
        canonical,
        title,
        meta,
        mainImg,
        productSchema,
      };
    })()`);

    console.log('On-Page Data:');
    console.log('  H1:', data.h1);
    console.log('  Price:', data.price);
    console.log('  Canonical:', data.canonical);
    console.log('  Title:', data.title);
    console.log('  Meta Desc:', data.meta);
    console.log('  Main Image:', data.mainImg);
    console.log('  Schema SKU:', data.productSchema?.sku);
    console.log('  Schema Price:', data.productSchema?.offers?.price);

    // Clear existing cart and add 2487
    await browser.evaluate(`(() => {
      localStorage.removeItem('cart');
      localStorage.removeItem('himalayan-koh-cart');
    })()`);
    await browser.navigate(url);
    await new Promise((r) => setTimeout(r, 1500));

    // Click Add to Cart
    await browser.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find(b => b.textContent && b.textContent.includes('Add to Cart'));
      if (addBtn) addBtn.click();
    })()`);

    await new Promise((r) => setTimeout(r, 1500));

    // Open Cart Drawer
    await browser.evaluate(`(() => {
      const cartBtn = document.querySelector('button[aria-label="Cart"]');
      if (cartBtn) cartBtn.click();
    })()`);

    await new Promise((r) => setTimeout(r, 1000));

    const cartData = await browser.evaluate(`(() => {
      const itemEls = Array.from(document.querySelectorAll('h4.font-semibold')).map(e => e.textContent.trim());
      const subtotalEl = Array.from(document.querySelectorAll('span')).find(e => e.textContent === 'Subtotal')?.nextElementSibling;
      return {
        items: itemEls,
        subtotal: subtotalEl ? subtotalEl.textContent.trim() : ''
      };
    })()`);

    console.log('\nCart Drawer Verification:');
    console.log('  Items in cart:', cartData.items);
    console.log('  Subtotal:', cartData.subtotal);

    const pass =
      data.h1.includes('5 to 6 lbs') &&
      data.price.includes('$19.95') &&
      data.canonical === 'https://preview.himalayankoh.com/products/himalayan-salt-lick-5-to-6-lbs' &&
      data.productSchema?.sku === 'HK-LFH-6lbs' &&
      data.productSchema?.offers?.price === 19.95 &&
      cartData.items.some(item => item.includes('5 to 6 lbs')) &&
      cartData.subtotal === '$19.95';

    console.log('\nFINAL ACCEPTANCE VERDICT FOR PRODUCT 2487:', pass ? 'PASS' : 'FAIL');
  } finally {
    await browser.close();
  }
}

verify2487().catch(console.error);
