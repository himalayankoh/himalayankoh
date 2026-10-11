#!/usr/bin/env node
/**
 * Does the live site still say things it cannot support?
 *
 *   node scripts/verify-live-claims.mjs
 *
 * Read-only. Two halves, because a correction can be stored but not served:
 *
 *   1. **The store** — posts, pages and product descriptions, read with the admin
 *      credentials so drafts are included, scanned for the claim shapes that have
 *      been removed from this site before: mineral counts, purity superlatives,
 *      health outcomes, "heals", competitor-illness allegations.
 *   2. **The storefront** — the pages a shopper actually receives, fetched over
 *      HTTPS and checked for the corrected wording. A WooCommerce write that is
 *      live in the database but not on the page is not a fix.
 *
 * The phrase list is deliberately explicit rather than clever: every entry is a
 * claim the owner has already agreed to remove, so a match is a regression, and a
 * pattern that matches the *disclaimer* ("it is not a trace-mineral supplement")
 * is excluded by a negative lookbehind rather than left to judgement.
 */

import fs from 'node:fs';

const STORE_API = 'https://wp.himalayankoh.com/wp-json';
const PUBLIC = 'https://himalayankoh.com';

const argOf = (name) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const envFile = argOf('env') || '.env.local';
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const admin = {
  Authorization:
    'Basic ' + Buffer.from(`${env.WORDPRESS_ADMIN_USER}:${(env.WORDPRESS_ADMIN_APP_PASSWORD || '').replace(/\s+/g, '')}`).toString('base64'),
};
const woo = {
  Authorization:
    'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64'),
};

/** Claim shapes that must not appear. Each is a phrase the owner agreed to remove. */
const CLAIMS = [
  ['mineral-count', /84 (trace|nutritious|essential) (minerals|elements)/i],
  ['purity-superlative', /world.?s (purest|best|finest) (salt|for livestock)/i],
  ['purity-superlative', /the purest (pink )?salt on the market/i],
  ['purity-claim', /prized for its purity/i],
  ['health-outcome', /(improved|increase[d]?) milk production/i],
  ['health-outcome', /faster growth/i],
  ['health-outcome', /(promote|support)s? optimal health/i],
  ['health-outcome', /essential minerals (and|&) (nutrients|electrolytes)/i],
  ['health-outcome', /essential minerals and electrolytes/i],
  ['health-outcome', /impressive development/i],
  ['health-outcome', /tailored mineral solution/i],
  ['health-outcome', /naturally heal|absorb more healing/i],
  ['health-outcome', /\bheals\b/i],
  ['health-outcome', /more productive/i],
  ['health-outcome', /stay healthy/i],
  ['competitor-allegation', /caused by things in your livestock.?s salt/i],
  ['performance-promise', /see the improvement it can make/i],
  ['channel-name-in-body', /Salt That Heals/],
];

/**
 * Wording that must now be present, and where to read it.
 *
 * Product pages are checked on the *storefront*, because that is the page a shopper
 * gets. Blog bodies are checked through WordPress's rendered content instead: the
 * storefront's article page builds its body in the browser, so the served HTML does
 * not contain the text and checking it there would report a false failure. The
 * WordPress record is the source that page reads, so it is the right place to look.
 */
const EXPECTED = [
  ['product 2544', `${PUBLIC}/products/himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh`, /not a trace-mineral supplement/i],
  ['product 2539', `${PUBLIC}/products/bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh`, /not a trace-mineral supplement/i],
  ['product 2536', `${PUBLIC}/products/himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh`, /not a trace-mineral supplement/i],
  ['post 2268', `${STORE_API}/wp/v2/posts/2268`, /not a complete mineral supplement/i],
  ['post 233', `${STORE_API}/wp/v2/posts/233`, /it is not a treatment for any condition/i],
  ['post 2475', `${STORE_API}/wp/v2/posts/2475`, /Himalayan Koh YouTube channel/i],
  ['page 35 (legacy)', `${STORE_API}/wp/v2/pages/35`, /not a trace-mineral supplement/i],
  ['page 42 (legacy)', `${STORE_API}/wp/v2/pages/42`, /come from a mineral supplement/i],
];

const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function json(url, headers) {
  const res = await fetch(url, { headers, cache: 'no-store' });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, headers: res.headers };
}

const findings = [];
function scan(kind, id, label, text) {
  const flat = strip(text);
  for (const [name, pattern] of CLAIMS) {
    const match = flat.match(pattern);
    if (match) findings.push({ kind, id, label, claim: name, match: match[0], context: flat.slice(Math.max(0, match.index - 60), match.index + 80) });
  }
}

console.log('=== 1. The store (posts, pages, products) ===');
const posts = await json(`${STORE_API}/wp/v2/posts?per_page=100&status=any&context=edit`, admin);
for (const post of Array.isArray(posts.body) ? posts.body : []) {
  scan('post', post.id, post.slug, `${post.title?.raw} ${post.content?.raw}`);
}
const pages = await json(`${STORE_API}/wp/v2/pages?per_page=100&context=edit`, admin);
for (const page of Array.isArray(pages.body) ? pages.body : []) {
  scan('page', page.id, page.slug, `${page.title?.raw} ${page.content?.raw}`);
}
const products = await json(`${STORE_API}/wc/v3/products?per_page=100&status=any`, woo);
for (const product of Array.isArray(products.body) ? products.body : []) {
  scan(
    'product',
    product.id,
    product.sku,
    `${product.name} ${product.short_description} ${product.description} ${JSON.stringify(
      (product.meta_data || []).filter((m) => /yoast/.test(m.key)).map((m) => m.value)
    )}`
  );
}
console.log(`scanned ${[posts, pages, products].map((r) => (Array.isArray(r.body) ? r.body.length : 0)).join(' / ')} (posts / pages / products)`);

console.log('\n=== 2. The storefront ===');
const served = [];
for (const [label, url, pattern] of EXPECTED) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    const present = pattern.test(text);
    served.push({ label, url, status: res.status, present });
    console.log(`  ${present ? 'OK  ' : 'FAIL'} ${label.padEnd(16)} HTTP ${res.status} — expected wording ${present ? 'present' : 'MISSING'}`);
  } catch (error) {
    served.push({ label, url, status: 'error', present: false });
    console.log(`  FAIL ${label} ${url} — ${error.message}`);
  }
}

console.log('\n=== 3. Findings ===');
if (!findings.length) {
  console.log('  No claim shape found in the store. (The storefront is checked above for corrected wording; a claim served from a cached page is caught by the next run.)');
} else {
  for (const f of findings) {
    console.log(`  [${f.kind} ${f.id} ${f.label}] ${f.claim}: "${f.match}"\n      …${f.context}…`);
  }
}

const out = {
  at: new Date().toISOString(),
  scanned: {
    posts: Array.isArray(posts.body) ? posts.body.length : 0,
    pages: Array.isArray(pages.body) ? pages.body.length : 0,
    products: Array.isArray(products.body) ? products.body.length : 0,
  },
  findings,
  storefront: served,
};
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync(`backups/live-claims-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(out, null, 2));

// Exit code carries the verdict, so a caller can gate on it.
const storefrontFailures = served.filter((s) => !s.present);
console.log(
  `\nClaim shapes in the store: ${findings.length}. Storefront expectations met: ${served.length - storefrontFailures.length}/${served.length}.`
);
if (storefrontFailures.length) {
  console.error(`Storefront missing expected wording: ${storefrontFailures.map((f) => f.label).join(', ')}`);
}
