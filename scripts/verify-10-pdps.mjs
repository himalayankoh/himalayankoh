const PUBLIC_PRODUCTS = [
  { id: 2497, slug: 'himalayan-rock-salt-45-lbs-large-chunks', expectedName: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)', expectedSku: 'HK-LFC-45lbs' },
  { id: 2492, slug: 'himalayan-salt-6-lbs', expectedName: 'Himalayan Salt Fine & Coarse Grain — 6 lbs', expectedSku: '' },
  { id: 2490, slug: 'himalayan-salt-fine-grain-3-lbs', expectedName: 'Himalayan Salt Fine Grain — 3 lbs', expectedSku: 'HK-SFL-F-3lbs' },
  { id: 2488, slug: 'himalayan-salt-lick-12-to-14-lbs', expectedName: 'Himalayan Salt Lick — 12 to 14 lbs', expectedSku: 'HK-LFH-14lbs' },
  { id: 2487, slug: 'himalayan-salt-lick-5-to-6-lbs', expectedName: 'Himalayan Salt Lick — 5 to 6 lbs', expectedSku: 'HK-LFH-6lbs' },
  { id: 2485, slug: 'himalayan-salt-lick-1-to-2-lbs', expectedName: 'Himalayan Salt Lick — 1 to 2 lbs', expectedSku: 'HK-LFH-2lbs' },
  { id: 2484, slug: 'himalayan-salt-block-30-lbs', expectedName: 'Himalayan Salt Block — 30 lbs', expectedSku: 'HK-LB-30LBS' },
  { id: 2482, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs', expectedName: 'Himalayan Pink Edible Salt Fine Grain Pouch — 6 lbs', expectedSku: 'HK-ESF-6lbs' },
  { id: 2481, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-3-lbs', expectedName: 'Himalayan Pink Edible Salt Fine Grain Pouch — 3 lbs', expectedSku: 'HK-ESF-3lbs' },
  { id: 2479, slug: 'himalayan-pink-edible-salt-16-oz-jar', expectedName: 'Himalayan Pink Edible Salt Fine & Coarse Grain — 16 oz Jar', expectedSku: '' },
];

async function verifyPdp(item) {
  const url = 'https://preview.himalayankoh.com/products/' + item.slug;
  const res = await fetch(url);
  const html = await res.text();

  // Canonical
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : '';

  // JSON-LD
  const jsonLdMatches = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  let jsonLdName = '';
  let jsonLdId = '';
  let jsonLdSku = '';
  let jsonLdPrice = '';

  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const graph = parsed['@graph'] || [parsed];
      for (const node of graph) {
        if (node['@type'] === 'Product') {
          jsonLdName = node.name || '';
          jsonLdId = node['@id'] || node.productID || '';
          jsonLdSku = node.sku || '';
          jsonLdPrice = node.offers?.price || '';
        }
      }
    } catch {}
  }

  // API lookup for raw model check
  const apiRes = await fetch('https://preview.himalayankoh.com/api/catalog?slug=' + item.slug);
  const apiJson = await apiRes.json();
  const prod = apiJson.product;

  const pass = prod && prod.id === item.id;

  return {
    slug: item.slug,
    id: prod ? prod.id : 'NOT FOUND',
    sku: prod?.sku || '',
    price: prod?.price || '',
    expectedProduct: item.expectedName,
    actualProduct: prod?.name || 'NOT FOUND',
    mainImage: prod?.image || '',
    canonical,
    jsonLdName,
    jsonLdId,
    status: pass ? 'PASS' : 'FAIL'
  };
}

async function run() {
  const results = [];
  for (const item of PUBLIC_PRODUCTS) {
    results.push(await verifyPdp(item));
  }
  console.log(JSON.stringify(results, null, 2));
}
run().catch(console.error);
