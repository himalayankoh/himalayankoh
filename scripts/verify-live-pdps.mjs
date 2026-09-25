import { readFileSync } from 'node:fs';

const STAGING = 'https://preview.himalayankoh.com';

const products = [
  { id: 2497, slug: 'himalayan-rock-salt-45-lbs-large-chunks' },
  { id: 2492, slug: 'himalayan-salt-6-lbs' },
  { id: 2490, slug: 'himalayan-salt-fine-grain-3-lbs' },
  { id: 2488, slug: 'himalayan-salt-lick-12-to-14-lbs' },
  { id: 2487, slug: 'himalayan-salt-lick-5-to-6-lbs' },
  { id: 2485, slug: 'himalayan-salt-lick-1-to-2-lbs' },
  { id: 2484, slug: 'himalayan-salt-block-30-lbs' },
  { id: 2482, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs' },
  { id: 2481, slug: 'himalayan-pink-edible-salt-fine-grain-pouch-3-lbs' },
  { id: 2479, slug: 'himalayan-pink-edible-salt-16-oz-jar' },
];

async function verify() {
  console.log(`Auditing 10 PDPs on ${STAGING}...\n`);
  for (const p of products) {
    const url = `${STAGING}/products/${p.slug}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Acceptance-Audit)' } });
      const html = await res.text();
      const status = res.status;
      
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : 'NONE';
      
      const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
      const meta = metaMatch ? metaMatch[1] : 'NONE';

      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i);
      const ogTitle = ogTitleMatch ? ogTitleMatch[1] : 'NONE';

      const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
      const ogDesc = ogDescMatch ? ogDescMatch[1] : 'NONE';

      const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
      const canonical = canonicalMatch ? canonicalMatch[1] : 'NONE';

      const hasProductSchema = html.includes('"@type":"Product"') || html.includes('"@type": "Product"');
      const hasBreadcrumbSchema = html.includes('"@type":"BreadcrumbList"') || html.includes('"@type": "BreadcrumbList"');
      
      const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
      const h1 = h1Match ? h1Match[1].trim() : 'NONE';

      console.log(`[Product ${p.id}] /products/${p.slug}`);
      console.log(`  HTTP Status: ${status}`);
      console.log(`  H1: ${h1}`);
      console.log(`  Title: ${title}`);
      console.log(`  Meta Desc: ${meta}`);
      console.log(`  OG Title: ${ogTitle}`);
      console.log(`  OG Desc: ${ogDesc}`);
      console.log(`  Canonical: ${canonical}`);
      console.log(`  Product Schema: ${hasProductSchema ? 'YES' : 'NO'}`);
      console.log(`  Breadcrumb Schema: ${hasBreadcrumbSchema ? 'YES' : 'NO'}`);
      console.log('--------------------------------------------------');
    } catch (e) {
      console.error(`Failed ${url}:`, e);
    }
  }
}

verify();
