// Himalayan Koh — insert 6 cattle/livestock & edible salt products into Supabase.
//
// HOW TO RUN:
// 1. Install Node.js if you don't have it: https://nodejs.org (download the LTS version)
// 2. Edit the two lines below (https://timpjroyxoafhkwpxkiu.supabase.co and <REDACTED>) with your values
// 3. Open a terminal in the folder where you saved this file
// 4. Run:  node insert-himalayan-products.mjs
// 5. Read the output — it tells you exactly what was created or skipped
//
// This only touches the 6 new products. It will NOT create a duplicate if a
// product with the same slug already exists — it skips those and tells you.

const SUPABASE_URL = process.env.SUPABASE_URL;        // e.g. https://xxxxx.supabase.co
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // starts with eyJ...

// ---------------------------------------------------------------------------

const CATEGORY_NAME_BY_SLUG_HINT = {
  cattle: ['Salt for Cattle', 'Cattle & Livestock', 'Salt for Cattle & Livestock'],
  edible: ['Edible Cooking Salt', 'Edible Salt'],
};

const PRODUCTS = [
  {
    name: 'Himalayan Salt Block 30 lbs',
    slug: 'himalayan-salt-block-30-lbs',
    short_description: 'Natural 30 lb Himalayan salt block for cattle and livestock.',
    description: 'A natural 30 lb Himalayan salt block intended for cattle and livestock. Place it in a suitable salt-block holder or protected feeding location. Natural color, shape, surface texture and mineral pattern may vary from piece to piece.',
    price: 49.95,
    sku: 'HK-LB-30LBS',
    weight: 30,
    weight_unit: 'lbs',
    categoryHint: 'cattle',
    images: [
      '/images/products/himalayan-salt-block-30lbs-hero.webp',
      '/images/products/himalayan-salt-block-30lbs-horse.webp',
      '/images/products/himalayan-salt-block-30lbs-cow.webp',
      '/images/products/himalayan-salt-block-30lbs-livestock.webp',
    ],
    meta_title: 'Himalayan Salt Block 30 lbs for Cattle & Livestock | Himalayan Koh',
    meta_description: 'Natural 30 lb Himalayan salt block for cattle and livestock. Retail price $49.95.',
  },
  {
    name: 'Himalayan Salt Lick 5 ~ 6 lbs    (4 pcs / box)',
    slug: 'himalayan-salt-lick-5-6-lbs-4-pcs-box',
    short_description: 'Box of four natural 5–6 lb Himalayan salt licks with rope for cattle and livestock.',
    description: 'A box of four natural Himalayan salt licks, each weighing approximately 5–6 lb and supplied with rope. Designed for cattle and livestock use. Install the rope securely in an appropriate feeding area. Natural shape, shade and exact weight vary.',
    price: 79.80,
    sku: 'HK-LFH-6lbs',
    weight: 22,
    weight_unit: 'lbs',
    categoryHint: 'cattle',
    images: ['/images/legacy/cattle-salt-bag.jpg', '/images/legacy/cattle-grazing.jpg'],
    meta_title: 'Himalayan Salt Lick 5–6 lbs, 4 pcs per Box for Cattle | Himalayan Koh',
    meta_description: 'Four 5–6 lb Himalayan salt licks with rope for cattle and livestock. Box retail $79.80.',
  },
  {
    name: 'Himalayan Salt Lick 1 ~ 2 lbs    (6 pcs / box)',
    slug: 'himalayan-salt-lick-1-2-lbs-6-pcs-box',
    short_description: 'Box of six natural 1–2 lb Himalayan salt licks with rope for cattle and livestock.',
    description: 'A box of six natural Himalayan salt licks, each weighing approximately 1–2 lb and supplied with rope. Intended for cattle and livestock use. Secure each rope correctly in an appropriate feeding location. Natural color, shape and exact weight vary.',
    price: 77.70,
    sku: 'HK-LFH-2lbs',
    weight: 9,
    weight_unit: 'lbs',
    categoryHint: 'cattle',
    images: ['/images/legacy/cattle-salt-bag.jpg', '/images/legacy/cattle-grazing.jpg'],
    meta_title: 'Himalayan Salt Lick 1–2 lbs, 6 pcs per Box for Cattle | Himalayan Koh',
    meta_description: 'Six 1–2 lb Himalayan salt licks with rope for cattle and livestock. Box retail $77.70.',
  },
  {
    name: 'Himalayan Pink Eidible Salt Fine Grain Pouche (6 pcs / box)',
    slug: 'himalayan-pink-eidible-salt-fine-grain-pouche-6-pcs-box',
    short_description: 'Fine-grain Himalayan pink edible salt in 3 lb pouches, sold as a 6-pouch case.',
    description: 'Fine-grain Himalayan pink edible salt supplied in 3 lb pouches, sold as a case of six. Use for cooking and seasoning. Natural pink shade may vary.',
    price: 89.70,
    sku: 'HK-ESF-3lbs',
    weight: 18,
    weight_unit: 'lbs',
    categoryHint: 'edible',
    images: ['/images/legacy/salt-pouch-6lb.webp', '/images/legacy/bowl-of-salt.jpg'],
    meta_title: 'Himalayan Pink Edible Salt Fine Grain Pouch, 3 lbs | Himalayan Koh',
    meta_description: 'Fine-grain Himalayan pink edible salt, sold as a 6-pouch case of 3 lb pouches.',
  },
  {
    name: 'Himalayan Pink Eidible Salt Fine Grain Pouche (3 pcs / box)',
    slug: 'himalayan-pink-eidible-salt-fine-grain-pouche-3-pcs-box',
    short_description: 'Fine-grain Himalayan pink edible salt in 6 lb pouches (single unit).',
    description: 'Fine-grain Himalayan pink edible salt supplied in a 6 lb pouch. Use for cooking and seasoning. Natural pink shade may vary.',
    price: 19.95,
    sku: 'HK-ESF-6lbs',
    weight: 6,
    weight_unit: 'lbs',
    categoryHint: 'edible',
    images: ['/images/legacy/salt-pouch-6lb.webp', '/images/legacy/bowl-of-salt.jpg'],
    meta_title: 'Himalayan Pink Edible Salt Fine Grain Pouch, 6 lbs | Himalayan Koh',
    meta_description: 'Fine-grain Himalayan pink edible salt, 6 lb pouch. $19.95.',
  },
  {
    name: 'Himalayan Rock Salt 45 lbs - (2 to 3 large chuncks)',
    slug: 'himalayan-rock-salt-45-lbs-2-to-3-large-chuncks',
    short_description: 'A 45 lb cattle and livestock rock-salt package containing approximately 2–3 large natural chunks.',
    description: 'A 45 lb package of natural Himalayan rock salt containing approximately two to three large chunks, intended for cattle and livestock. Exact chunk count, size, shape and color naturally vary. Place in a suitable protected feeding location.',
    price: 49.95,
    sku: 'HK-LFC-45lbs',
    weight: 45,
    weight_unit: 'lbs',
    categoryHint: 'cattle',
    images: ['/images/legacy/salt-rock-bag.jpg', '/images/legacy/cattle-grazing.jpg'],
    meta_title: 'Himalayan Rock Salt 45 lbs, 2–3 Large Chunks for Cattle | Himalayan Koh',
    meta_description: 'Natural 45 lb Himalayan rock salt package with approximately 2–3 large chunks for cattle and livestock.',
  },
];

// ---------------------------------------------------------------------------

const headers = {
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function findCategoryId(hintKey) {
  const names = CATEGORY_NAME_BY_SLUG_HINT[hintKey];
  const all = await rest('categories?select=id,name');
  for (const name of names) {
    const match = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
  }
  // Fuzzy fallback: contains "cattle" or "edible"
  const fuzzy = all.find((c) => c.name.toLowerCase().includes(hintKey));
  return fuzzy ? fuzzy.id : null;
}

async function productExists(slug) {
  const existing = await rest(`products?slug=eq.${encodeURIComponent(slug)}&select=id,slug`);
  return existing && existing.length > 0;
}

async function main() {
  if (SUPABASE_URL.includes('PASTE_YOUR') || SERVICE_ROLE_KEY.includes('PASTE_YOUR')) {
    console.error('\n❌ Edit the SUPABASE_URL and SERVICE_ROLE_KEY constants at the top of this file first.\n');
    process.exit(1);
  }

  console.log('Checking categories...');
  const categoryCache = {};

  for (const p of PRODUCTS) {
    console.log(`\n— ${p.name}`);

    const exists = await productExists(p.slug);
    if (exists) {
      console.log(`  ⏭️  Skipped — a product with slug "${p.slug}" already exists.`);
      continue;
    }

    if (!categoryCache[p.categoryHint]) {
      categoryCache[p.categoryHint] = await findCategoryId(p.categoryHint);
    }
    const category_id = categoryCache[p.categoryHint];
    if (!category_id) {
      console.log(`  ⚠️  Could not find a matching category for "${p.categoryHint}". Creating without a category — set it manually in Admin → Products after.`);
    }

    const [product] = await rest('products', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: p.name,
        slug: p.slug,
        description: p.description,
        short_description: p.short_description,
        price: p.price,
        sku: p.sku,
        weight: p.weight,
        weight_unit: p.weight_unit,
        category_id: category_id || null,
        images: p.images,
        thumbnail: p.images[0],
        is_active: true,
        is_featured: false,
        grain_sizes: [],
        tags: [],
        meta_title: p.meta_title,
        meta_description: p.meta_description,
      }),
    });

    await rest('inventory', {
      method: 'POST',
      body: JSON.stringify({
        product_id: product.id,
        quantity: 0,
        low_stock_threshold: 10,
        track_inventory: true,
        allow_backorder: false,
      }),
    });

    try {
      await rest('product_images', {
        method: 'POST',
        body: JSON.stringify(
          p.images.map((url, i) => ({
            product_id: product.id,
            image_url: url,
            sort_order: i,
            is_thumbnail: i === 0,
          }))
        ),
      });
    } catch {
      // product_images table may not exist in every setup — safe to skip
    }

    console.log(`  ✅ Created (id: ${product.id}, price: $${p.price})`);
  }

  console.log('\nDone. Refresh /products on your live site to check.');
  console.log('Reminder: stock quantity is set to 0 by default — update it in Admin → Products → Inventory once you know real stock.');
}

main().catch((err) => {
  console.error('\n❌ Something failed:', err.message);
  process.exit(1);
});
