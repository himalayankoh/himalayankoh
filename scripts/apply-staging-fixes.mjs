import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const auth = Buffer.from(env.WORDPRESS_ADMIN_USER + ':' + env.WORDPRESS_ADMIN_APP_PASSWORD).toString('base64');
const base = env.NEXT_PUBLIC_WORDPRESS_BASE_URL || 'https://himalayankoh.com/staging';

async function updateProduct(id, payload) {
  const r = await fetch(`${base}/wp-json/wc/v3/products/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Failed to update product ${id}: ${r.status} ${txt}`);
  }
  return r.json();
}

async function run() {
  console.log('1. Fixing duplicate gallery on Product 2492...');
  // 2492 has images [2462, 2465, 2464, 2462, 2463]. Remove duplicate 2462.
  await updateProduct(2492, {
    images: [
      { id: 2462, alt: 'Himalayan pink salt 6 lb pouch front packaging' },
      { id: 2465, alt: 'Himalayan pink salt 6 lb pouch package on white background' },
      { id: 2464, alt: 'Himalayan pink salt 6 lb pouch back label and nutrition information' },
      { id: 2463, alt: 'Himalayan pink salt 6 lb pouch back packaging overview' },
    ],
  });
  console.log('Product 2492 gallery deduplicated and ALT texts updated.');

  console.log('2. Updating ALT text on Product 2497 (45 lbs rock salt)...');
  await updateProduct(2497, {
    images: [
      { id: 2534, alt: 'Himalayan rock salt chunks 45 lbs bulk presentation' },
      { id: 2535, alt: 'Himalayan pink rock salt large natural chunk' },
    ],
  });

  console.log('3. Updating ALT text and sanitizing copy on Product 2488 (12 to 14 lbs salt lick)...');
  await updateProduct(2488, {
    images: [
      { id: 2105, alt: 'Himalayan pink salt lick on rope 12 to 14 lbs for livestock' },
    ],
    short_description: '<p>Himalayan pink salt lick, 12 to 14 lbs. Unrefined natural mineral lick on rope for livestock.</p>',
    description: '<p><strong>Himalayan Salt Lick — 12 to 14 lbs</strong></p>\n<ul>\n<li>Weight: 12 to 14 lbs</li>\n<li>Format: Natural mineral salt lick on hanging rope</li>\n<li>Origin: Khewra salt range, Punjab, Pakistan</li>\n<li>Unrefined, 100% natural, no chemical additives</li>\n</ul>',
  });

  console.log('4. Updating ALT text on Product 2487 (5 to 6 lbs salt lick)...');
  await updateProduct(2487, {
    images: [
      { id: 2105, alt: 'Himalayan pink salt lick on rope 5 to 6 lbs for livestock' },
    ],
  });

  console.log('5. Updating ALT text and sanitizing copy on Product 2485 (1 to 2 lbs salt lick)...');
  await updateProduct(2485, {
    images: [
      { id: 2105, alt: 'Himalayan pink salt lick on rope 1 to 2 lbs for small animals' },
    ],
    short_description: '<p>Himalayan pink salt lick, 1 to 2 lbs. Unrefined natural mineral lick on rope for small animals and horses.</p>',
    description: '<p><strong>Himalayan Salt Lick — 1 to 2 lbs</strong></p>\n<ul>\n<li>Weight: 1 to 2 lbs</li>\n<li>Format: Natural mineral salt lick on hanging rope</li>\n<li>Origin: Khewra salt range, Punjab, Pakistan</li>\n<li>Unrefined, 100% natural, no chemical additives</li>\n</ul>',
  });

  console.log('6. Sanitizing retail copy on Product 2479 (16 oz jar)...');
  await updateProduct(2479, {
    images: [
      { id: 2447, alt: 'Himalayan pink edible salt in 16 oz jar with black lid' },
      { id: 2448, alt: 'Himalayan pink cooking salt 16 oz jar front view' },
      { id: 2449, alt: 'Himalayan pink edible salt 16 oz jar packaging' },
    ],
    description: '<p><strong>Himalayan Pink Edible Salt — 16 oz Jar</strong></p>\n<ul>\n<li>Grain: Available in fine grain or coarse grain</li>\n<li>Net weight: 16 oz (1 lb)</li>\n<li>Origin: Khewra salt range, Punjab, Pakistan</li>\n<li>Unrefined, additive-free cooking and finishing salt</li>\n</ul>',
  });

  console.log('All staging product updates applied successfully.');
}

run().catch((e) => {
  console.error('Error applying fixes:', e);
  process.exit(1);
});
