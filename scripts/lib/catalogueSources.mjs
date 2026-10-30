/**
 * The catalogue sources this migration reads, in exactly one place.
 *
 *   import { readCatalogueSources } from './lib/catalogueSources.mjs';
 *   const sources = await readCatalogueSources();
 *
 * ## Why this module exists
 *
 * Two scripts now ask the same question of the same four places:
 * `compare-catalogues.mjs` prints *what differs*, and `plan-catalogue-migration.mjs`
 * turns the answer into a reviewable, SKU-keyed migration manifest. They used to be
 * one script; the moment a second one needed the same reads, the alternative was two
 * implementations of "read the live catalogue" that drift apart — and the specific
 * way they drift is expensive here, because the live apex is only half readable. A
 * second reader that quietly forgot the `hasPair` check would print `null` price as
 * if it were a fact, and the whole point of this work is that an unreadable field is
 * reported as unreadable rather than guessed.
 *
 * So: one reader, one normalised row shape, and a `readable` map per source that says
 * which fields that source can actually answer for. Everything downstream — matching,
 * diffing, rendering — reads those flags instead of assuming.
 *
 * ## The four sources, and what each can honestly answer
 *
 * | Key | What it is | Read | Can answer |
 * | --- | --- | --- | --- |
 * | `live` | the apex WordPress/WooCommerce catalogue that the domain sells today | WP REST (public) + WooCommerce REST (pair, best-effort) | ids, names, slugs, statuses, categories, featured-image URLs, modified dates. **Price, SKU and stock only if the apex accepts the pair** — today it does not. |
 * | `curated` | the staging WordPress/WooCommerce catalogue the storefront serves | WooCommerce REST v3 (pair) | the full field set, including SKU |
 * | `served` | what a shopper is actually served by the staging storefront | `GET <origin>/api/catalog` | the storefront's own display names, prices, SKUs, stock and images |
 * | `preProduction` | the deployed production Worker, before any cutover | `GET <worker>/api/catalog`, unauthenticated **and** with the preview token | whether its gate is up, and what it would serve |
 *
 * ## Read-only
 *
 * Every request in this module is a GET. There is no write path here and there must
 * never be one: the migration's rule is that a write requires a separate, explicit
 * owner approval, and a reader that can write is a reader that can be pointed at
 * production by a typo.
 *
 * ## The row shape
 *
 * One shape for all four sources, so a row from the apex and a row from the storefront
 * can be compared field by field:
 *
 *   { source, id, name, sku, status, slug, link, price, regularPrice,
 *     stockStatus, stockQuantity, categoryIds, categories, imageUrls, image,
 *     featuredMedia, modified, raw }
 *
 * An unreadable field is `null` — never `0`, `''` or a guess — and the source's
 * `readable` map is what says whether `null` means "empty" or "not asked".
 */

import { loadEnv } from './env.mjs';
import {
  PRODUCTION_SITE_ORIGIN,
  PRODUCTION_WORKER_NAME,
  STAGING_BACKEND_ORIGIN,
  STAGING_SITE_ORIGIN,
} from '../production-target.mjs';

/** Sent on every request so a host operator can tell what touched their site. */
export const CATALOGUE_UA = 'Mozilla/5.0 (compatible; HimalayanKoh-catalogue-plan/1.0)';

/** The apex: the storefront's own future origin, and today's live WordPress site. */
export const APEX_ORIGIN = PRODUCTION_SITE_ORIGIN;

/** Staging's WordPress/WooCommerce backend, mounted under the apex's `/staging`. */
export const STAGING_BACKEND = STAGING_BACKEND_ORIGIN;

/** Staging's public storefront origin. */
export const STAGING_SITE = STAGING_SITE_ORIGIN;

/**
 * The pre-cutover Worker's own address, the only place it is reachable.
 *
 * Read from the environment so a future deployment does not have to be found here by
 * hand; the default is the account's real subdomain, measured. It is a public
 * hostname — no secret is involved — and it is the name a cutover will replace.
 */
export function productionWorkerOrigin(env = process.env) {
  return (
    (env.PRODUCTION_WORKER_ORIGIN || '').trim().replace(/\/+$/, '') ||
    `https://${PRODUCTION_WORKER_NAME}.himalayankoh-pk.workers.dev`
  );
}

/** The configured WooCommerce pair, if this machine has one. Never printed. */
export function resolvePair(env = process.env) {
  return {
    key: (env.WOOCOMMERCE_CONSUMER_KEY || '').trim(),
    secret: (env.WOOCOMMERCE_CONSUMER_SECRET || '').trim(),
  };
}

/** The preview access token, if this machine has one. Never printed. */
export function resolvePreviewToken(env = process.env) {
  return (env.PREVIEW_ACCESS_TOKEN || '').trim();
}

/**
 * One GET, with the outcome always returned rather than thrown.
 *
 * A catalogue read that fails has to be *reported*, not fatal: the honest output of
 * this tooling on a machine with no credentials is a manifest full of "not readable",
 * and a thrown error would replace that with a crash. `transport` records a DNS or TLS
 * failure, which is a different fact from an HTTP status.
 */
export async function getJson(url, { auth = false, authorization = '', pair } = {}) {
  const started = Date.now();
  const basic =
    auth && pair?.key && pair?.secret
      ? `Basic ${Buffer.from(`${pair.key}:${pair.secret}`).toString('base64')}`
      : '';
  const headers = { 'User-Agent': CATALOGUE_UA, Accept: 'application/json' };
  if (basic) headers.Authorization = basic;
  if (authorization) headers.Authorization = authorization;
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON — e.g. an HTML challenge or a WordPress 404 page */
    }
    return { url, status: response.status, json, ms: Date.now() - started, bytes: text.length };
  } catch (error) {
    return {
      url,
      status: 0,
      json: null,
      ms: Date.now() - started,
      transport: String(error?.cause?.code || error?.message || error),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Name comparison                                                     */
/* ------------------------------------------------------------------ */

/**
 * Name overlap, re-exported from the classification module rather than redefined.
 *
 * The comparison report and the migration manifest rank candidate pairs with the same
 * score on purpose: a pair that looks like a match in one of them and not the other is
 * worse than either report on its own. One definition, in `catalogueDiff.mjs`, used by
 * both — see `STOP_WORDS` there for why the brand words are and are not stop-listed.
 */
export { nameSimilarity, significantTokens } from './catalogueDiff.mjs';

/**
 * One row, reduced to the fields a human reviews — used by the manifest renderer.
 *
 * Keeping this here rather than in the renderer means the JSON artefact and the
 * Markdown artefact cannot disagree about what a product's identity is.
 */
export function trimRow(row) {
  if (!row) return null;
  return {
    source: row.source,
    id: row.id,
    sku: row.sku,
    name: row.name,
    status: row.status,
    slug: row.slug,
    link: row.link ?? null,
    price: row.price,
    stockStatus: row.stockStatus,
    stockQuantity: row.stockQuantity,
    categories: row.categories,
    imageCount: row.imageUrls.length,
    image: row.image || null,
    modified: row.modified ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* The read                                                            */
/* ------------------------------------------------------------------ */

/**
 * Read all four sources, normalised.
 *
 * @param {object} [options]
 * @param {boolean} [options.loadEnvironment] call `loadEnv()` first (default true)
 * @param {boolean} [options.includePreProduction] read the production Worker too (default true)
 * @returns {Promise<object>} `{ live, curated, served, preProduction, pair, previewToken }`
 */
export async function readCatalogueSources(options = {}) {
  const { loadEnvironment = true, includePreProduction = true } = options;
  if (loadEnvironment) loadEnv();

  const pair = resolvePair();
  const previewToken = resolvePreviewToken();
  const hasPair = Boolean(pair.key && pair.secret);
  const workerOrigin = productionWorkerOrigin();

  /* ---- live apex: WP REST always, WooCommerce REST only if it answers ---- */
  const livePage = await getJson(`${APEX_ORIGIN}/wp-json/wp/v2/product?per_page=100`);
  const liveCats = await getJson(`${APEX_ORIGIN}/wp-json/wp/v2/product_cat?per_page=100`);
  const liveRich = hasPair
    ? await getJson(`${APEX_ORIGIN}/wp-json/wc/v3/products?per_page=100&status=any`, {
        auth: true,
        pair,
      })
    : { url: `${APEX_ORIGIN}/wp-json/wc/v3/products?per_page=100&status=any`, status: 0, json: null };

  const liveList = Array.isArray(livePage.json) ? livePage.json : [];
  const liveRichList = Array.isArray(liveRich.json) ? liveRich.json : [];
  const liveRichById = new Map(liveRichList.map((p) => [p.id, p]));
  const liveAcceptsPair = liveRich.status === 200;

  /**
   * Featured images on the live apex.
   *
   * The product endpoint carries an attachment **id**, not a URL, so the media
   * endpoint is asked once for the ids the products actually use. Still one public
   * GET, still read-only, and it is what turns "this product has an image" into "this
   * product's image is at …" — the thing an owner needs when the live admin is not
   * reachable. It is also the only image fact the apex can be held to today.
   */
  const liveMediaIds = [
    ...new Set(liveList.map((p) => p.featured_media).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  const liveMedia = liveMediaIds.length
    ? await getJson(`${APEX_ORIGIN}/wp-json/wp/v2/media?include=${liveMediaIds.join(',')}&per_page=100`)
    : { url: `${APEX_ORIGIN}/wp-json/wp/v2/media`, status: 0, json: [] };
  const liveMediaById = new Map(
    (Array.isArray(liveMedia.json) ? liveMedia.json : []).map((m) => [m.id, m]),
  );

  const liveCatName = new Map(
    (Array.isArray(liveCats.json) ? liveCats.json : []).map((c) => [c.id, c.name]),
  );
  const liveCatUnmapped = [];

  const liveRows = liveList.map((p) => {
    const rich = liveRichById.get(p.id);
    const categoryIds = Array.isArray(p.product_cat) ? p.product_cat : [];
    const categories = categoryIds.map((id) => {
      const name = liveCatName.get(id);
      if (name === undefined) liveCatUnmapped.push({ productId: p.id, termId: id });
      return name ?? `term:${id}`;
    });
    const media = liveMediaById.get(p.featured_media);
    return {
      source: 'live',
      id: p.id,
      name: decodeEntities(p.title?.rendered || ''),
      sku: liveAcceptsPair ? rich?.sku || null : null,
      status: p.status,
      slug: p.slug,
      link: p.link ?? null,
      price: liveAcceptsPair ? (rich?.price ?? null) : null,
      regularPrice: liveAcceptsPair ? (rich?.regular_price ?? null) : null,
      stockStatus: liveAcceptsPair ? (rich?.stock_status ?? null) : null,
      stockQuantity: liveAcceptsPair ? (rich?.stock_quantity ?? null) : null,
      categoryIds,
      categories,
      imageUrls: media?.source_url ? [media.source_url] : [],
      image: media?.source_url ?? null,
      imageMime: media?.mime_type ?? null,
      featuredMedia: p.featured_media ?? null,
      modified: p.modified ?? null,
      raw: p,
    };
  });

  /* ---- curated: staging WooCommerce REST ---- */
  const curatedProducts = hasPair
    ? await getJson(`${STAGING_BACKEND}/wp-json/wc/v3/products?per_page=100&status=any`, {
        auth: true,
        pair,
      })
    : { url: `${STAGING_BACKEND}/wp-json/wc/v3/products`, status: 0, json: null };
  const curatedCats = hasPair
    ? await getJson(`${STAGING_BACKEND}/wp-json/wc/v3/products/categories?per_page=100`, {
        auth: true,
        pair,
      })
    : { url: `${STAGING_BACKEND}/wp-json/wc/v3/products/categories`, status: 0, json: null };

  const curatedList = Array.isArray(curatedProducts.json) ? curatedProducts.json : [];
  const curatedRows = curatedList.map((p) => ({
    source: 'curated',
    id: p.id,
    name: p.name,
    sku: p.sku || null,
    status: p.status,
    slug: p.slug,
    link: p.permalink ?? null,
    price: p.price ?? null,
    regularPrice: p.regular_price ?? null,
    stockStatus: p.stock_status ?? null,
    stockQuantity: p.stock_quantity ?? null,
    categoryIds: (p.categories || []).map((c) => c.id),
    categories: (p.categories || []).map((c) => c.name),
    imageUrls: (p.images || []).map((i) => i.src),
    image: (p.images || [])[0]?.src ?? null,
    featuredMedia: p.images?.[0]?.id ?? null,
    modified: p.date_modified ?? null,
    raw: p,
  }));

  /* ---- served: what the staging storefront actually serves ---- */
  const servedCatalog = await getJson(`${STAGING_SITE}/api/catalog`);
  const servedList = Array.isArray(servedCatalog.json?.products) ? servedCatalog.json.products : [];
  const servedRows = servedList.map((p) => ({
    source: 'served',
    id: p.id,
    name: p.name,
    sku: p.sku || null,
    status: 'publish',
    slug: p.slug,
    link: `${STAGING_SITE}/products/${p.slug}`,
    price: typeof p.priceMin === 'number' ? String(p.priceMin) : null,
    regularPrice: null,
    stockStatus: p.stockStatus ?? null,
    stockQuantity: typeof p.stockQuantity === 'number' ? p.stockQuantity : null,
    categoryIds: [],
    categories: p.category ? [p.category] : [],
    imageUrls: Array.isArray(p.images) ? p.images : p.image ? [p.image] : [],
    image: p.image ?? null,
    featuredMedia: null,
    modified: p.updatedAt ?? null,
    raw: p,
  }));

  /* ---- pre-production: the Worker, gated and authenticated ---- */
  let preProduction = null;
  if (includePreProduction) {
    const unauth = await getJson(`${workerOrigin}/api/catalog`);
    const auth = previewToken
      ? await getJson(`${workerOrigin}/api/catalog`, { authorization: `Bearer ${previewToken}` })
      : null;
    const authList = Array.isArray(auth?.json?.products) ? auth.json.products : [];
    preProduction = {
      origin: workerOrigin,
      unauth,
      auth,
      gateActive: unauth.status === 401,
      rows: authList.map((p) => ({
        source: 'preProduction',
        id: p.id,
        name: p.name,
        sku: p.sku || null,
        status: 'publish',
        slug: p.slug,
        link: `${workerOrigin}/products/${p.slug}`,
        price: typeof p.priceMin === 'number' ? String(p.priceMin) : null,
        regularPrice: null,
        stockStatus: p.stockStatus ?? null,
        stockQuantity: typeof p.stockQuantity === 'number' ? p.stockQuantity : null,
        categoryIds: [],
        categories: p.category ? [p.category] : [],
        imageUrls: Array.isArray(p.images) ? p.images : p.image ? [p.image] : [],
        image: p.image ?? null,
        featuredMedia: null,
        modified: p.updatedAt ?? null,
        raw: p,
      })),
      degraded: auth?.json?.degraded ?? unauth.json?.degraded ?? null,
      warnings: Array.isArray(auth?.json?.warnings) ? auth.json.warnings : [],
    };
  }

  return {
    pair,
    hasPair,
    previewToken,
    live: {
      origin: APEX_ORIGIN,
      page: livePage,
      mediaRead: liveMedia,
      categoriesRead: liveCats,
      rich: liveRich,
      acceptsPair: liveAcceptsPair,
      categories: Array.isArray(liveCats.json) ? liveCats.json : [],
      categoryNamesUnmapped: liveCatUnmapped,
      mediaIdsCount: liveMediaIds.length,
      mediaResolvedCount: liveMediaById.size,
      rows: liveRows,
      /**
       * Which fields this source can actually answer for.
       *
       * This is the module's central fact about the live apex: without a pair it
       * answers for names, ids, statuses, categories and images, and it answers
       * **nothing** about SKU, price or stock. Every comparison downstream consults
       * these flags before it calls two values different.
       */
      readable: {
        name: livePage.status === 200,
        sku: liveAcceptsPair,
        price: liveAcceptsPair,
        stock: liveAcceptsPair,
        categories: liveCats.status === 200,
        images: liveMedia.status === 200 && liveMediaById.size > 0,
        modified: livePage.status === 200,
      },
    },
    curated: {
      origin: STAGING_BACKEND,
      products: curatedProducts,
      categoriesRead: curatedCats,
      categories: Array.isArray(curatedCats.json) ? curatedCats.json : [],
      rows: curatedRows,
      readable: {
        name: curatedProducts.status === 200,
        sku: curatedProducts.status === 200,
        price: curatedProducts.status === 200,
        stock: curatedProducts.status === 200,
        categories: curatedProducts.status === 200,
        images: curatedProducts.status === 200,
        modified: curatedProducts.status === 200,
      },
    },
    served: {
      origin: STAGING_SITE,
      catalog: servedCatalog,
      rows: servedRows,
      degraded: servedCatalog.json?.degraded ?? null,
      readable: {
        name: servedCatalog.status === 200,
        sku: servedCatalog.status === 200,
        price: servedCatalog.status === 200,
        stock: servedCatalog.status === 200,
        categories: servedCatalog.status === 200,
        images: servedCatalog.status === 200,
        modified: servedCatalog.status === 200,
      },
    },
    preProduction,
  };
}

/**
 * Decode the two entities WordPress actually puts in titles here.
 *
 * `wp/v2` returns `title.rendered` HTML-encoded, so `&amp;` and `&#8211;` appear
 * literally. Decoding them keeps a comparison against a WooCommerce name honest
 * (WooCommerce returns the raw name), and the pair is closed deliberately: a general
 * HTML decoder would turn a product name containing `<` into something surprising.
 */
export function decodeEntities(value) {
  return String(value || '')
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}
