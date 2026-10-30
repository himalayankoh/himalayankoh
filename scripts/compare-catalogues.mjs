#!/usr/bin/env node
/**
 * Compare the live catalogue with the one the storefront currently serves.
 *
 *   node scripts/compare-catalogues.mjs [--out docs/production/CATALOG-COMPARISON.md]
 *
 * Read-only. Every request below is a GET, and nothing writes to WordPress,
 * WooCommerce or the store.
 *
 * ## The problem this answers
 *
 * The two hosts are **separate WordPress installations**, so "the catalogue" is not one
 * thing, and the question the cutover turns on is not "is the store open" but "which
 * catalogue is the store going to serve". Measured on 2026-10-08: the live apex holds a
 * 2022–2025 catalogue that the curated staging catalogue has largely replaced, the
 * staging storefront serves the curated one, and the production Worker serves nothing
 * because it has no live key pair. Cutting over without reconciling therefore does not
 * produce a richer store — it produces the **old** store, at the new domain, with the
 * new one's URLs in its sitemap.
 *
 * ## Three sources, and why each is read the way it is
 *
 * | Source | Endpoint | Auth |
 * | --- | --- | --- |
 * | live apex | `/wp-json/wp/v2/product?per_page=100` | anonymous — the `product` post type is registered `show_in_rest`, so ids, slugs, titles, statuses, categories, featured media and modified dates are public |
 * | live apex (rich) | `/wp-json/wc/v3/products` | the configured pair — **only if the apex accepts it**; today it does not, so price, SKU and stock are reported as *not readable* rather than guessed |
 * | staging | `${STAGING_BACKEND_ORIGIN}/wp-json/wc/v3/products?status=any` | the configured pair |
 * | storefront | `<origin>/api/catalog` | none — this is what a shopper is actually served, including the storefront's own display names and SEO fields, which differ from the raw WooCommerce names |
 *
 * The apex is read through WP REST rather than WooCommerce REST because that is the
 * only thing this environment is allowed to see, and because it is the honest floor:
 * **anything below is readable by any visitor to the live site.** The rich fields are
 * printed only when a credential actually unlocks them.
 *
 * ## Matching, and why it is deliberately weak
 *
 * Product ids are independent between the installations (`271` and `2752` are different
 * products on the two hosts, and the two id spaces do not overlap at all), so id
 * equality proves nothing. SKUs would be the honest key, and the apex does not expose
 * them. So pairs are *suggested* by normalised-name comparison and printed with the
 * score and the differing words, for a human to accept or reject — never used to decide
 * anything automatically. Anything the comparison cannot establish is printed as
 * unknown.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APEX_ORIGIN as APEX,
  STAGING_BACKEND as STAGING,
  STAGING_SITE,
  nameSimilarity as similarity,
  productionWorkerOrigin,
  readCatalogueSources,
  significantTokens as tokens,
} from './lib/catalogueSources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
/**
 * `join(ROOT, value)` alone mangles an absolute path, so writing the report to a scratch
 * location (to diff two runs, most obviously) is refused with a confusing `ENOENT` from
 * `mkdir` naming a directory nobody typed. An absolute `--out` is used as given.
 */
const outPath = (value) => (isAbsolute(value) ? value : join(ROOT, value));
const OUT = outPath(outFlag !== -1 && args[outFlag + 1] ? args[outFlag + 1] : 'docs/production/CATALOG-COMPARISON.md');

/* ------------------------------------------------------------------ */
/* Read the sources (through the shared reader)                       */
/* ------------------------------------------------------------------ */

/**
 * The reads happen in `lib/catalogueSources.mjs`, which
 * `plan-catalogue-migration.mjs` uses too.
 *
 * This file used to carry its own copy of every fetch, URL and row mapping. When the
 * migration manifest needed the same four reads, the choice was one reader or two
 * implementations that drift — and the way they drift here is expensive, because the
 * live apex is only half readable: a second reader that forgot the pair check would
 * print a `null` price as though it were a fact. So the reader moved out, and this file
 * keeps only what is unique to it: the report below.
 */
const sources = await readCatalogueSources();

const APEX_PRODUCTS = sources.live.page;
const APEX_CATS = sources.live.categoriesRead;
const APEX_MEDIA = sources.live.mediaRead;
const APEX_RICH = sources.live.rich;
const STAGING_PRODUCTS = sources.curated.products;
const STAGING_CATS = sources.curated.categoriesRead;
const PREVIEW = sources.served.catalog;
const PRODUCTION = sources.preProduction.unauth;
const PRODUCTION_WORKER_ORIGIN = sources.preProduction.origin;

const hasPair = sources.hasPair;
const apexAcceptsPair = sources.live.acceptsPair;

const apexList = sources.live.rows;
const apexRichList = Array.isArray(APEX_RICH.json) ? APEX_RICH.json : [];
const stagingList = sources.curated.rows;
const previewList = sources.served.rows;
const productionList = sources.preProduction.rows;

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/**
 * The row shape this report prints.
 *
 * The reader's rows use `name`/`categories`/`imageUrls`; the tables below were written
 * against `label`/`cats`/`images`. Rather than rewrite every line of the report — and
 * risk changing prose that has already been reviewed — the two aliases are applied here,
 * once.
 */
const forReport = (row) => ({
  ...row,
  label: row.name,
  cats: row.categories,
  images: row.imageUrls.length,
});

const apexRows = apexList.map(forReport);
const stagingRows = stagingList.map(forReport);

/** Every apex product worth a human look for this staging product, best first. */
function suggestionsFor(name, rows) {
  return rows
    .map((row) => ({ row, score: similarity(name, row.label) }))
    .filter((entry) => entry.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

const apexPublished = apexRows.filter((r) => r.status === 'publish');
const stagingPublished = stagingRows.filter((r) => r.status === 'publish');

/** The requested diff: what the storefront serves that the live install does not hold. */
const unresolved = stagingPublished.map((row) => ({ row, suggestions: suggestionsFor(row.label, apexPublished) }));
const onPreviewNotOnLive = unresolved.filter((entry) => entry.suggestions.length === 0);
const needsReview = unresolved.filter((entry) => entry.suggestions.length > 0);

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const now = new Date().toISOString();
const L = [];

L.push('# Catalogue comparison — live WordPress vs the storefront’s catalogue');
L.push('');
L.push(`Generated ${now} by \`scripts/compare-catalogues.mjs\` (read-only; every request is a GET).`);
L.push('');
L.push('**This is a comparison, not a migration.** Nothing was copied, created, updated or');
L.push('deleted, and nothing in it may be acted on automatically. It exists to make the');
L.push('cutover decision about the catalogue an informed one, and to be re-runnable after the');
L.push('live credentials are in place.');
L.push('');
L.push('## Sources, and how each was read');
L.push('');
L.push('| Source | Endpoint | Auth | Result |');
L.push('| --- | --- | --- | --- |');
L.push(`| Live catalogue (ids, titles, slugs, status, categories, media) | \`GET ${APEX}/wp-json/wp/v2/product?per_page=100\` | **none — public** | HTTP ${APEX_PRODUCTS.status}, ${apexList.length} products |`);
L.push(`| Live catalogue (featured image URLs) | \`GET ${APEX}/wp-json/wp/v2/media?include=…\` | **none — public** | HTTP ${APEX_MEDIA.status}, ${sources.live.mediaResolvedCount} of ${sources.live.mediaIdsCount} media record(s) resolved |`);
L.push(`| Live catalogue (price, SKU, stock) | \`GET ${APEX}/wp-json/wc/v3/products\` | configured WooCommerce pair | ${apexAcceptsPair ? `HTTP 200, ${apexRichList.length} products` : `**HTTP ${APEX_RICH.status} — the apex does not accept the configured pair, so price, SKU and stock are NOT readable and are shown as unknown below**`} |`);
L.push(`| Staging catalogue (full field set) | \`GET ${STAGING}/wp-json/wc/v3/products?status=any\` | configured pair | HTTP ${STAGING_PRODUCTS.status}, ${stagingList.length} products |`);
L.push(`| Storefront (what a shopper is served today) | \`GET ${STAGING_SITE}/api/catalog\` | none | HTTP ${PREVIEW.status}, ${previewList.length} products, degraded: ${PREVIEW.json?.degraded} |`);
L.push(`| Pre-cutover production Worker | \`GET ${PRODUCTION_WORKER_ORIGIN}/api/catalog\` | none | HTTP ${PRODUCTION.status}, ${productionList.length} products, degraded: ${PRODUCTION.json?.degraded} |`);
L.push('');
L.push('The live catalogue is read through WP REST because the `product` post type is');
L.push('registered `show_in_rest` on that installation. **Everything in that column is');
L.push('readable by any visitor to the live site** — it is not privileged information. The rich');
L.push('fields (price, SKU, stock) come only from WooCommerce REST, which needs a key pair the');
L.push('apex does not yet accept, so they are reported as unknown rather than inferred from the');
L.push('public pages.');
L.push('');

L.push('## Totals');
L.push('');
L.push('| | Live apex | Staging | Preview storefront | Production Worker |');
L.push('| --- | --- | --- | --- | --- |');
L.push(`| Products returned | ${apexList.length} | ${stagingList.length} | ${previewList.length} | ${productionList.length} |`);
L.push(`| Published | ${apexPublished.length} | ${stagingPublished.length} | — | — |`);
L.push(`| Draft | ${apexRows.filter((r) => r.status === 'draft').length} | ${stagingRows.filter((r) => r.status === 'draft').length} | — | — |`);
L.push(`| Categories | ${Array.isArray(APEX_CATS.json) ? APEX_CATS.json.length : '?'} | ${Array.isArray(STAGING_CATS.json) ? STAGING_CATS.json.length : '?'} | — | — |`);
L.push(`| Products with an image | ${apexRows.filter((r) => r.image).length} of ${apexRows.length} | ${stagingRows.filter((r) => r.images > 0).length} of ${stagingRows.length} | — | — |`);
L.push('');

L.push('## Live apex — the 13 products as published today');
L.push('');
L.push('| id | title | status | categories | image | SKU / price / stock | modified |');
L.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of apexRows.slice().sort((a, b) => a.id - b.id)) {
  const rich = row.sku === null ? '_not readable (no live key)_' : `${row.sku} / ${row.price} / ${row.stockStatus}`;
  const image = row.image ? `yes (media ${row.featuredMedia})` : row.featuredMedia ? `media ${row.featuredMedia} — URL not read` : '**none**';
  L.push(`| ${row.id} | ${row.label.slice(0, 74)} | ${row.status} | ${row.cats.join(', ')} | ${image} | ${rich} | ${String(row.modified || '').slice(0, 10)} |`);
}
L.push('');
L.push('### The live apex’s featured images, as URLs');
L.push('');
L.push('The product record only carries an attachment id; these are the URLs the media endpoint');
L.push('resolved for those ids, and they are what the storefront’s `/wp-content/*` passthrough');
L.push('would have to serve after the cutover.');
L.push('');
for (const row of apexRows.slice().sort((a, b) => a.id - b.id)) {
  L.push(`- **${row.id}** ${row.label.slice(0, 46)} — ${row.image ? `\`${row.image}\`${row.imageMime ? ` _(${row.imageMime})_` : ''}` : '_no featured image resolved_'}`);
}
L.push('');
L.push(`Categories on the live apex: ${(Array.isArray(APEX_CATS.json) ? APEX_CATS.json : []).map((c) => `\`${c.id}\` ${c.name} (${c.count})`).join(' · ') || '_none readable_'}`);
L.push('');

L.push('## Staging — the curated catalogue the storefront serves');
L.push('');
L.push('| id | SKU | name | status | price | stock | images | categories |');
L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of stagingRows) {
  L.push(`| ${row.id} | ${row.sku || '—'} | ${String(row.label).slice(0, 58)} | ${row.status} | ${row.price} | ${row.stockStatus}${row.stockQuantity === null ? '' : ` (${row.stockQuantity})`} | ${row.images} | ${row.cats.join(', ') || '—'} |`);
}
L.push('');
L.push(`Categories on staging: ${(Array.isArray(STAGING_CATS.json) ? STAGING_CATS.json : []).map((c) => `\`${c.id}\` ${c.name} (${c.count})`).join(' · ') || '_none readable_'}`);
L.push('');

L.push('## Products the storefront serves that the live apex does not hold');
L.push('');
if (!hasPair) {
  L.push('_The staging pair is not configured on this machine, so the storefront catalogue could not be read against the live one._');
} else if (needsReview.length === 0 && onPreviewNotOnLive.length === 0) {
  L.push('_None._');
} else {
  if (needsReview.length > 0) {
    L.push(`**${needsReview.length} of ${stagingPublished.length} published storefront products have no counterpart on the live`);
    L.push('installation by id — but a likely counterpart by name.** These need a human decision: the');
    L.push('name match is a suggestion, not an identity, and the pairs below are the whole point of');
    L.push('reading the two catalogues together.');
    L.push('');
    for (const { row, suggestions } of needsReview) {
      L.push(`- **${row.label}** (\`${row.sku}\`, id ${row.id}, ${row.price})`);
      for (const { row: candidate, score } of suggestions) {
        const shared = [...tokens(row.label)].filter((word) => tokens(candidate.label).has(word));
        L.push(`  - live id ${candidate.id} — “${candidate.label.slice(0, 60)}” (similarity ${score.toFixed(2)}; shares: ${shared.join(', ') || 'nothing'})`);
      }
    }
    L.push('');
  }
  if (onPreviewNotOnLive.length > 0) {
    L.push(`**${onPreviewNotOnLive.length} ${onPreviewNotOnLive.length === 1 ? 'has' : 'have'} no counterpart at all** — not by id, and not by any name`);
    L.push('overlap worth reporting:');
    L.push('');
    for (const { row } of onPreviewNotOnLive) {
      L.push(`- **${row.label}** (\`${row.sku}\`, id ${row.id}, ${row.price}, ${row.stockStatus})`);
    }
    L.push('');
  }
}

const apexNotOnStaging = apexPublished.filter((row) => stagingRows.every((s) => similarity(row.label, s.label) < 0.34));
L.push('## Live apex products with no counterpart in the curated catalogue');
L.push('');
L.push(`**${apexNotOnStaging.length} of ${apexPublished.length}** live products match nothing in the curated`);
L.push('catalogue by name. Some are clearly retired lines (a salt lamp, food jars); others are the');
L.push('older edition of a line that was re-created on staging. This list is the destructive');
L.push('question of the cutover — every one of these is what a shopper searching the live domain');
L.push('finds today, and the default assumption must be that they stay published until the owner');
L.push('says otherwise.');
L.push('');
for (const row of apexNotOnStaging) L.push(`- live id ${row.id} — “${row.label.slice(0, 70)}” (\`${row.link?.replace(APEX, '')}\`)`);
L.push('');

L.push('## Reconciliation plan');
L.push('');
L.push('Ordered so that every step is reversible and none of them is automatic. **Nothing here');
L.push('creates, copies, overwrites or deletes a product**, and steps 1–3 change nothing at all.');
L.push('');
L.push('1. **Back up the live database and files, and verify the restore.** This is the precondition');
L.push('   for everything after it, and it is the one item still blocked (see');
L.push('   `docs/PRODUCTION-REMEDIATION.md` §R). No product work begins before it is verified —');
L.push('   the catalogue is the part of WordPress that a mistake here would damage irreversibly.');
L.push('2. **Create a live WooCommerce REST key pair on the apex installation** (WooCommerce →');
L.push('   Settings → Advanced → REST API), read-only for the first pass. This turns every');
L.push('   `_not readable_` cell above into a fact — price, SKU and stock for all 13 — and re-running');
L.push('   this script then produces the complete comparison instead of the public half of it.');
L.push('3. **Re-run `npm run compare:catalogues` and decide the mapping.** The pairs above are');
L.push('   suggestions; the decision that matters is whether each curated product *replaces* a live');
L.push('   one or is *additional* to it. That decision is the owner’s, and it needs no system change.');
L.push('4. **Reconcile the categories before the products, and do not import term ids.** Both');
L.push('   installations have a category with **id `75`**, and it means different things on each:');
L.push('   `Uncategorized` on the live apex, `Live Stock` on staging. `105` (`Bulk Order`) exists on');
L.push('   both. Any copy that carries term ids across will therefore file curated livestock products');
L.push('   under `Uncategorized` while looking like it succeeded. Map by **name**, create the missing');
L.push('   terms, and verify the assignment read-back.');
L.push('5. **Do not import product ids.** The two id spaces do not overlap (`271`–`2461` live,');
L.push('   `2653`–`2752` staging), so an import by id cannot overwrite by accident — which is the good');
L.push('   news — but it also means a re-run creates duplicates rather than updating. Key any import on');
L.push('   **SKU**, assign a SKU to every live product that lacks one, and treat a missing SKU as a');
L.push('   stop rather than a match.');
L.push('6. **Bring the curated products across as drafts first.** Create, then inspect price, stock,');
L.push('   images and categories against the staging values in the table above, and only then publish.');
L.push('   A draft is invisible to shoppers and to the sitemap, so this is the step that costs nothing');
L.push('   to get wrong.');
L.push('7. **Leave the live products published until the owner retires them, one at a time.** The live');
L.push('   catalogue is what the live domain sells today, and the products above are also indexed in');
L.push('   its sitemap and linked from its pages. Removing them is a decision with SEO consequences,');
L.push('   not cleanup, and the retired URLs should redirect to their replacements rather than 404.');
L.push('8. **Verify after each change**, in this order: the live `/api/catalog` from the production');
L.push('   Worker (products, prices, stock), one product page per shelf, the images through the');
L.push('   `/wp-content/*` passthrough, then the sitemap. Re-run this script — the diff shrinking is');
L.push('   the evidence that reconciliation is complete.');
L.push('');
L.push('## What this comparison cannot establish');
L.push('');
L.push('- **Whether a suggested pair is the same product.** Names are the only shared key available,');
L.push('  and the two catalogues name the same items differently (“Bag of Himalayan Pink Salt for');
L.push('  Livestock (45 lbs.)” against “Himalayan Rock Salt for Livestock (45 lb)”). The similarity');
L.push('  score is a reading aid, not an identity.');
L.push(`- **Price, SKU and stock on the live apex.** ${apexAcceptsPair ? 'Readable in this run.' : 'Not readable in this run — WooCommerce REST returned HTTP ' + APEX_RICH.status + ' for the configured pair, and the public pages are not a substitute for the record.'}`);
L.push('- **Variations and their children.** A variable product’s variations are separate records with');
L.push('  their own SKUs, prices and stock, and neither source here expands them.');
L.push('- **Anything unpublished.** Only `publish` and (via WooCommerce REST) `draft` are visible;');
L.push('  trashed, private and pending products are invisible to both paths.');
L.push('- **Customer, order or inventory history.** This compares catalogue *definitions* only. It says');
L.push('  nothing about orders already placed against the live products, which must be preserved.');
L.push('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${L.join('\n')}\n`, 'utf8');

process.stdout.write(`Live apex: ${apexList.length} products (${apexPublished.length} published)` +
  `${apexAcceptsPair ? ' with price/SKU/stock' : ', price/SKU/stock NOT readable'}\n`);
process.stdout.write(`Staging:   ${stagingList.length} products (${stagingPublished.length} published)\n`);
process.stdout.write(`Storefront: ${previewList.length} products | Production Worker: ${productionList.length}\n`);
process.stdout.write(`Storefront products with no live counterpart by id: ${stagingPublished.length}\n`);
process.stdout.write(`  of which a likely live counterpart exists by name: ${needsReview.length}\n`);
process.stdout.write(`  of which match nothing at all: ${onPreviewNotOnLive.length}\n`);
process.stdout.write(`Live products with no curated counterpart: ${apexNotOnStaging.length}\n`);
process.stdout.write(`\nWritten to ${OUT.replace(ROOT, '.').split('\\').join('/')}\n`);
