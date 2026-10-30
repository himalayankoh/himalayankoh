import { launchBrowser } from './qa-cdp.mjs';

const PUBLIC_PRODUCTS = [
  { id: 2497, slug: 'himalayan-rock-salt-45-lbs-large-chunks', name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)', isVariable: false },
  { id: 2492, slug: 'himalayan-salt-6-lbs', name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs', isVariable: true },
  { id: 2490, slug: 'himalayan-salt-fine-grain-3-lbs', name: 'Himalayan Salt Fine Grain — 3 lbs', isVariable: false },
  { id: 2488, slug: 'himalayan-salt-lick-12-to-14-lbs', name: 'Himalayan Salt Lick — 12 to 14 lbs', isVariable: false },
  { id: 2487, slug: 'himalayan-salt-lick-5-to-6-lbs', name: 'Himalayan Salt Lick — 5 to 6 lbs', isVariable: false },
  { id: 2485, slug: 'himalayan-salt-lick-1-to-2-lbs', name: 'Himalayan Salt Lick — 1 to 2 lbs', isVariable: false },
  { id: 2484, slug: 'himalayan-salt-block-30-lbs', name: 'Himalayan Salt Block — 30 lbs', isVariable: false },
  { id: 2482, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs', name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 6 lbs', isVariable: false },
  { id: 2481, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-3-lbs', name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 3 lbs', isVariable: false },
  { id: 2479, slug: 'himalayan-pink-edible-salt-16-oz-jar', name: 'Himalayan Pink Edible Salt Fine & Coarse Grain — 16 oz Jar', isVariable: true },
];

async function runMobileAudit() {
  console.log('=== P10: REAL CHROME MOBILE VIEWPORT AUDIT (375 x 812) ===\n');
  const browser = await launchBrowser({ headless: true });

  const results = [];

  try {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 3,
      mobile: true,
    });

    for (const prod of PUBLIC_PRODUCTS) {
      const url = `https://preview.himalayankoh.com/products/${prod.slug}`;
      console.log(`Auditing Product ${prod.id} (${prod.slug})...`);

      await browser.navigate(url);
      await new Promise((r) => setTimeout(r, 2000));

      const evaluation = await browser.evaluate(`(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body.scrollWidth;

        const h1 = document.querySelector('h1')?.textContent?.trim() || '';
        const priceEl = document.querySelector('[data-testid="product-price"], .text-2xl, .text-3xl, .price');
        const price = priceEl?.textContent?.trim() || '';

        const images = Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.alt,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          visible: img.offsetParent !== null
        }));
        const mainImage = images.find(img => img.visible && !img.src.includes('logo') && !img.src.includes('icon'));

        const buttons = Array.from(document.querySelectorAll('button'));
        const addBtn = buttons.find(b => b.textContent && b.textContent.includes('Add to Cart'));

        // Quantity controls
        const qtyInput = document.querySelector('input[type="number"], input[name="quantity"]') ||
                         buttons.find(b => b.textContent === '+' || b.textContent === '-');

        // Variation selector
        const variationSelector = document.querySelector('[role="radiogroup"], select, [data-testid="grain-selector"]') ||
                                  document.body.innerText.includes('Grain Size') ||
                                  document.body.innerText.includes('Fine Grain') ||
                                  document.body.innerText.includes('Coarse Grain');

        // Description
        const descEl = document.querySelector('[data-testid="product-description"], .prose, .product-description') ||
                       document.querySelector('div.mt-8, div.space-y-4');
        const hasDescription = !!(descEl && descEl.textContent.trim().length > 20);

        const noHorizontalOverflow = docWidth <= 375 && bodyWidth <= 375;

        return {
          h1,
          price,
          hasMainImage: !!mainImage,
          mainImageSrc: mainImage ? mainImage.src : '',
          mainImageAlt: mainImage ? mainImage.alt : '',
          hasAddBtn: !!addBtn,
          addBtnDisabled: addBtn ? addBtn.disabled : null,
          hasQty: !!qtyInput,
          hasVariationSelector: !!variationSelector,
          hasDescription,
          docWidth,
          bodyWidth,
          noHorizontalOverflow,
        };
      })()`);

      const pass =
        evaluation.h1.length > 0 &&
        evaluation.price.length > 0 &&
        evaluation.hasAddBtn &&
        evaluation.hasDescription &&
        evaluation.noHorizontalOverflow &&
        (!prod.isVariable || evaluation.hasVariationSelector);

      console.log(`  H1: ${evaluation.h1}`);
      console.log(`  Price: ${evaluation.price}`);
      console.log(`  Main Image: ${evaluation.hasMainImage ? 'FOUND' : 'MISSING'} (${evaluation.mainImageAlt})`);
      console.log(`  Add to Cart Button: ${evaluation.hasAddBtn ? 'YES' : 'NO'}`);
      console.log(`  Variation Selector: ${prod.isVariable ? (evaluation.hasVariationSelector ? 'YES' : 'NO') : 'N/A'}`);
      console.log(`  Description: ${evaluation.hasDescription ? 'YES' : 'NO'}`);
      console.log(`  Horizontal Overflow: ${evaluation.noHorizontalOverflow ? 'NONE (PASS)' : `OVERFLOW doc=${evaluation.docWidth} body=${evaluation.bodyWidth}`}`);
      console.log(`  VERDICT: ${pass ? 'PASS' : 'FAIL'}\n`);

      results.push({
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        ...evaluation,
        status: pass ? 'PASS' : 'FAIL',
      });
    }

    console.log('=== SUMMARY OF P10 MOBILE AUDIT ===');
    console.table(
      results.map((r) => ({
        ID: r.id,
        Product: r.name.slice(0, 30),
        Price: r.price,
        Img: r.hasMainImage ? 'YES' : 'NO',
        CartBtn: r.hasAddBtn ? 'YES' : 'NO',
        VarSel: r.hasVariationSelector ? 'YES' : 'N/A',
        Overflow: r.noHorizontalOverflow ? 'NO' : 'YES',
        Status: r.status,
      }))
    );
  } finally {
    await browser.close();
  }
}

runMobileAudit().catch(console.error);
