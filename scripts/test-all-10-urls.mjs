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

// Other potential fine-grain slugs that could be linked or tested:
const EXTRA_SLUGS = [
  'himalayan-salt-fine-grain-45-lbs',
  'himalayan-salt-fine-grain-45-lbs-0-5-1-0-mm',
  'himalayan-salt-fine-grain-6-lbs',
  'himalayan-pink-edible-salt-fine-grain-16-oz-jar',
  'himalayan-salt-fine-grain-3-lbs',
];

async function checkSlug(slug) {
  const res = await fetch(`https://preview.himalayankoh.com/api/catalog?slug=${slug}`);
  const json = await res.json();
  return {
    slug,
    returnedId: json.product?.id,
    returnedName: json.product?.name,
    returnedSlug: json.product?.slug,
    error: json.error
  };
}

async function run() {
  console.log('=== CHECKING PUBLIC 10 PRODUCTS ===');
  for (const p of PUBLIC_PRODUCTS) {
    const res = await checkSlug(p.slug);
    const pass = res.returnedId === p.id;
    console.log(`${p.slug} -> ID ${res.returnedId} ("${res.returnedName}") [${pass ? 'PASS' : 'MISMATCH'}]`);
  }

  console.log('\n=== CHECKING EXTRA/ALIAS SLUGS ===');
  for (const s of EXTRA_SLUGS) {
    const res = await checkSlug(s);
    console.log(`${s} -> ID ${res.returnedId} ("${res.returnedName}")`);
  }
}

run().catch(console.error);
