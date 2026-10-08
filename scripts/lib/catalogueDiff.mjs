/**
 * The migration's classification rules, as pure functions.
 *
 *   import { buildMigrationManifest, findWriteFlag } from './lib/catalogueDiff.mjs';
 *   const manifest = buildMigrationManifest(sources, { generatedAt: new Date().toISOString() });
 *
 * ## Why this is separate from the script that runs it
 *
 * `scripts/plan-catalogue-migration.mjs` does I/O: it reads four catalogues, writes two
 * artefacts and prints a summary. Everything that *decides* something lives here, with
 * no imports and no side effects, so the rules that matter — what counts as an exact
 * match, when two values may be called different, what a duplicate SKU is — are
 * testable without a network, and are tested in
 * `src/lib/catalog/catalogueMigrationManifest.test.ts`.
 *
 * That matters more than usual here, because these rules are the part of the migration
 * a human will trust without re-deriving. A diff engine whose "no differences found" is
 * indistinguishable from "I could not read the field" is worse than no diff engine, and
 * the only way to keep the two apart is to make 'not comparable' a first-class output
 * rather than an empty list.
 *
 * ## The three rules this file exists to enforce
 *
 * 1. **Never match on database id.** The two installations are separate WordPress
 *    sites whose id spaces do not overlap (`271` live and `2752` staging are different
 *    products, not the same product), so id equality proves nothing and id proximity
 *    proves less. The key is the SKU.
 * 2. **Never decide a match.** With no SKU on the live side, the best available signal
 *    is name overlap, which is a *suggestion* for a human. Suggested pairs are emitted
 *    with their score, their shared words and their differing words, and are explicitly
 *    labelled as requiring owner approval — never promoted to a match.
 * 3. **Never call an unread field empty.** A field the source cannot answer for is
 *    reported as `notComparable` with the reason, not as a difference and not as equal.
 *
 * ## The diff classes, and the direction of each
 *
 * | Class | Means |
 * | --- | --- |
 * | `exactSkuMatches` | the same SKU on both sides — the only automatic match |
 * | `possibleMatchesRequiringOwnerApproval` | suggested by name overlap; a human decides |
 * | `missingProductionProducts` | **live-side** products with no counterpart in the curated catalogue — what the cutover would silently drop |
 * | `productsRequiringCreation` | **curated-side** products with no live counterpart at all — these must be created before/at cutover |
 * | `duplicateSkus` | the same SKU twice within one source — a key that cannot be trusted |
 * | `conflictingProducts` | a SKU or a suggested pair whose two records disagree about identity |
 * | `differences` | `price`, `stock`, `images`, `categories` — per pair, only where both sides can answer |
 */

/** The classes whose names the report and the JSON both use, in report order. */
export const DIFF_CLASSES = [
  'exactSkuMatches',
  'possibleMatchesRequiringOwnerApproval',
  'missingProductionProducts',
  'productsRequiringCreation',
  'duplicateSkus',
  'conflictingProducts',
];

/**
 * The eight classes the migration plan names, mapped to where this module emits them.
 *
 * Kept as data so the report, the JSON and the tests agree on the vocabulary, and so a
 * class cannot be quietly dropped from the manifest without this table changing.
 */
export const REQUESTED_CLASSES = {
  'Exact matches': 'exactSkuMatches',
  'Possible matches requiring owner approval': 'possibleMatchesRequiringOwnerApproval',
  'Missing production products': 'missingProductionProducts',
  'Price differences': 'differences.price',
  'Stock differences': 'differences.stock',
  'Image differences': 'differences.images',
  'Category differences': 'differences.categories',
  'Products requiring creation': 'productsRequiringCreation',
};

/**
 * Flags that would turn this dry run into a write.
 *
 * The script has **no write path at all** — there is nothing to enable — so passing
 * one of these is refused with a non-zero exit and an explanation, rather than being
 * silently ignored. "Silently ignored" is the dangerous behaviour: an operator who
 * types `--apply` and sees an unchanged summary has no way to know whether the tool
 * did nothing on purpose.
 */
const WRITE_FLAGS = [
  '--apply', '--write', '--commit', '--import', '--update', '--create', '--publish',
  '--delete', '--trash', '--sync', '--push', '--overwrite', '--restore',
];

/** The first write-intent flag in an argv, or `null`. */
export function findWriteFlag(argv) {
  return argv.find((arg) => WRITE_FLAGS.includes(String(arg).split('=')[0].toLowerCase())) ?? null;
}

/* ------------------------------------------------------------------ */
/* Keys                                                               */
/* ------------------------------------------------------------------ */

/**
 * A SKU reduced to its comparable form, or `null` when there is nothing to compare.
 *
 * Case, surrounding whitespace and separator width are presentation; `hk-lfc-45lbs`
 * and `HK-LFC-45LBS` are the same key and must not be reported as two. A blank string
 * is `null` rather than `''` so that "this product has no SKU" is one value everywhere
 * — and so that two products *without* SKUs never compare equal, which is the bug
 * that would otherwise silently merge every unkeyed product into one match.
 */
export function normalizeSku(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  return normalized === '' ? null : normalized;
}

/** A price as a number, or `null` when it is absent or not numeric. */
export function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

/* ------------------------------------------------------------------ */
/* Duplicates and conflicts                                           */
/* ------------------------------------------------------------------ */

/**
 * SKUs used more than once inside one source.
 *
 * A duplicated SKU breaks the only key the migration has, so it is reported before
 * anything is matched: an import keyed on a duplicate would update one of the two
 * products arbitrarily. Rows with no SKU are excluded — "no SKU" is a coverage problem
 * (`rowsWithoutSku`), not a duplicate.
 */
export function findDuplicateSkus(rows) {
  const bySku = new Map();
  for (const row of rows) {
    const sku = normalizeSku(row.sku);
    if (sku === null) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(row);
  }
  return [...bySku.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([sku, group]) => ({
      sku,
      count: group.length,
      products: group.map((row) => ({
        source: row.source,
        id: row.id,
        name: row.name,
        status: row.status,
        price: row.price,
        stockStatus: row.stockStatus,
      })),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Products that carry no SKU at all — the reason a key cannot be relied on yet. */
export function rowsWithoutSku(rows) {
  return rows
    .filter((row) => normalizeSku(row.sku) === null)
    .map((row) => ({ source: row.source, id: row.id, name: row.name, status: row.status }));
}

/**
 * Pair two sources by SKU.
 *
 * Only rows that have a SKU can pair, and rows that have none are returned separately as
 * `leftWithoutSku` / `rightWithoutSku` rather than being folded into `leftOnly` /
 * `rightOnly`. The distinction is the whole point: a product with no SKU has **not** been
 * found to lack a counterpart, it has simply not been *askable* — and a caller that
 * merged the two lists would report the live catalogue as unmatched on a day when the
 * only thing missing was the key. On the day the live apex cannot answer for SKU at all,
 * `pairs` is empty, `rightOnly` is the entire curated catalogue, and
 * `leftWithoutSku` is the entire live catalogue: a fact about readability, not about the
 * catalogue.
 */
export function matchBySku(leftRows, rightRows) {
  const leftBySku = new Map();
  const rightBySku = new Map();
  for (const row of leftRows) {
    const sku = normalizeSku(row.sku);
    if (sku !== null) leftBySku.set(sku, [...(leftBySku.get(sku) ?? []), row]);
  }
  for (const row of rightRows) {
    const sku = normalizeSku(row.sku);
    if (sku !== null) rightBySku.set(sku, [...(rightBySku.get(sku) ?? []), row]);
  }

  const pairs = [];
  const leftOnly = [];
  const rightOnly = [];
  const leftWithoutSku = leftRows.filter((row) => normalizeSku(row.sku) === null);
  const rightWithoutSku = rightRows.filter((row) => normalizeSku(row.sku) === null);

  for (const [sku, leftGroup] of leftBySku) {
    const rightGroup = rightBySku.get(sku);
    if (!rightGroup) {
      leftOnly.push(...leftGroup);
      continue;
    }
    // A SKU held by more than one row on either side cannot pair unambiguously; the
    // duplicate report names the rows and these pairs are emitted as ambiguous so the
    // count never implies a clean one-to-one mapping.
    if (leftGroup.length > 1 || rightGroup.length > 1) {
      for (const left of leftGroup) {
        for (const right of rightGroup) {
          pairs.push({ sku, left, right, ambiguous: true });
        }
      }
      continue;
    }
    pairs.push({ sku, left: leftGroup[0], right: rightGroup[0], ambiguous: false });
  }

  for (const [sku, rightGroup] of rightBySku) {
    if (!leftBySku.has(sku)) rightOnly.push(...rightGroup);
  }

  return { pairs, leftOnly, rightOnly, leftWithoutSku, rightWithoutSku };
}

/**
 * Name-similarity candidates for one row, best first.
 *
 * `threshold` is deliberately low (0.34). A false suggestion costs a human two seconds
 * and a rejection; a missed suggestion costs a duplicated product after the import,
 * which is the expensive error. The score, the shared words and the differing words are
 * all emitted so the human is deciding, not trusting a number.
 */
export function suggestCandidates(row, candidates, { threshold = 0.34, limit = 3 } = {}) {
  const rowTokens = significantTokens(row.name);
  return candidates
    .map((candidate) => {
      const candidateTokens = significantTokens(candidate.name);
      const shared = [...rowTokens].filter((word) => candidateTokens.has(word)).sort();
      const differing = [...candidateTokens].filter((word) => !rowTokens.has(word)).sort();
      return { candidate, score: nameSimilarity(row.name, candidate.name), shared, differing };
    })
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Name comparison — the one definition of "the same words"           */
/* ------------------------------------------------------------------ */

/**
 * Words two product names can share without sharing an identity.
 *
 * This list is deliberately short and deliberately conservative, and it lives here
 * rather than being re-typed wherever a score is needed: the two tools that rank pairs
 * must rank them identically, or a pair will look like a match in one report and not in
 * the other, which is worse than either report alone.
 *
 * What is *excluded* from the stop list matters as much as what is in it. `chef`,
 * `halal` and `unprocessed` are NOT stop words: the live catalogue contains a
 * "Himalayan **Chef**" line that is genuinely distinct from the "Himalayan Koh" one, so
 * treating the brand word as noise would flatten a real difference between two product
 * lines into a high score. `himalayan` and `koh` *are* stop words, because they appear
 * on almost every row in both catalogues and therefore carry no discrimination at all.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'for', 'of', 'with', 'in', 'to', 'or',
  'natural', 'pure', 'authentic', 'himalayan', 'koh',
]);

/** Significant lowercase tokens of a product name. */
export function significantTokens(name) {
  return new Set(
    String(name || '')
      .toLowerCase()
      .replace(/&#8211;|&amp;/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

/** Jaccard overlap of significant tokens: 0 (nothing shared) to 1 (same words). */
export function nameSimilarity(a, b) {
  const left = significantTokens(a);
  const right = significantTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/* ------------------------------------------------------------------ */
/* Field comparison                                                   */
/* ------------------------------------------------------------------ */

/**
 * A stock status reduced to its comparable form.
 *
 * The two endpoints spell the same status differently: WooCommerce REST v3 returns
 * `instock` / `outofstock` / `onbackorder`, and the storefront's `/api/catalog`
 * normalises them to `in_stock` / `out_of_stock` / `on_backorder`. Comparing raw
 * strings therefore reports "status instock → in_stock" for **every** product, which is
 * a naming difference between two of this project's own endpoints and not a fact about
 * stock — six false differences that would train a reviewer to skim the section that
 * exists to be read carefully. Fold case, underscores and spacing, and leave the word.
 */
export function normalizeStockStatus(value) {
  if (value === null || value === undefined) return null;
  const folded = String(value).toLowerCase().replace(/[^a-z]/g, '');
  return folded === '' ? null : folded;
}

/** Case-insensitive category names, de-duplicated. */
function categorySet(names) {
  return new Set((names || []).map((name) => String(name).trim().toLowerCase()).filter(Boolean));
}

/**
 * Compare one pair field by field, respecting what each source can answer for.
 *
 * The return value separates the two things a diff must never conflate: `differences`
 * (both sides spoke and they disagree) and `notComparable` (one side could not speak,
 * with the reason). `pair` labels which two catalogues were compared, because a price
 * difference between the live apex and the curated catalogue means something very
 * different from the same difference between the curated catalogue and what the
 * storefront serves.
 */
export function comparePair(left, right, { leftReadable, rightReadable, pair }) {
  const differences = [];
  const notComparable = [];

  const cannot = (field, detail) =>
    notComparable.push({ pair, field, leftId: left.id, rightId: right.id, leftName: left.name, rightName: right.name, reason: detail });

  /* price */
  if (!leftReadable.price || !rightReadable.price) {
    cannot(
      'price',
      !leftReadable.price ? `${left.source} cannot report price` : `${right.source} cannot report price`,
    );
  } else {
    const leftPrice = normalizePrice(left.price);
    const rightPrice = normalizePrice(right.price);
    if (leftPrice === null || rightPrice === null) {
      cannot('price', 'price is absent on at least one side');
    } else if (Math.abs(leftPrice - rightPrice) >= 0.01) {
      differences.push({
        pair,
        field: 'price',
        leftId: left.id,
        rightId: right.id,
        leftName: left.name,
        rightName: right.name,
        left: left.price,
        right: right.price,
        delta: Number((rightPrice - leftPrice).toFixed(2)),
      });
    }
  }

  /* stock */
  if (!leftReadable.stock || !rightReadable.stock) {
    cannot(
      'stock',
      !leftReadable.stock ? `${left.source} cannot report stock` : `${right.source} cannot report stock`,
    );
  } else {
    const leftStatus = normalizeStockStatus(left.stockStatus);
    const rightStatus = normalizeStockStatus(right.stockStatus);
    const pieces = [];
    if (leftStatus !== null && rightStatus !== null && leftStatus !== rightStatus) {
      pieces.push(`status ${left.stockStatus} → ${right.stockStatus}`);
    }
    const bothQuantities =
      typeof left.stockQuantity === 'number' && typeof right.stockQuantity === 'number';
    if (bothQuantities && left.stockQuantity !== right.stockQuantity) {
      pieces.push(`quantity ${left.stockQuantity} → ${right.stockQuantity}`);
    }
    if (pieces.length > 0) {
      differences.push({
        pair,
        field: 'stock',
        leftId: left.id,
        rightId: right.id,
        leftName: left.name,
        rightName: right.name,
        left: `${left.stockStatus ?? '?'}${typeof left.stockQuantity === 'number' ? ` (${left.stockQuantity})` : ''}`,
        right: `${right.stockStatus ?? '?'}${typeof right.stockQuantity === 'number' ? ` (${right.stockQuantity})` : ''}`,
        detail: pieces.join('; '),
      });
    } else if (!bothQuantities) {
      // Statuses agree (or one is absent) and the quantities cannot be compared: that
      // is an unreadable field, not an agreement. Reported per field so a reviewer can
      // see how much of the stock picture is actually known.
      cannot(
        'stock.quantity',
        bothQuantities
          ? 'unreachable'
          : `quantity is not reported on ${left.stockQuantity === null ? left.source : right.source}`,
      );
    }
  }

  /* images */
  if (!leftReadable.images || !rightReadable.images) {
    cannot(
      'images',
      !leftReadable.images ? `${left.source} images were not readable` : `${right.source} images were not readable`,
    );
  } else {
    const leftCount = left.imageUrls?.length ?? 0;
    const rightCount = right.imageUrls?.length ?? 0;
    const leftFirst = left.imageUrls?.[0] ?? null;
    const rightFirst = right.imageUrls?.[0] ?? null;
    const differentHost = hostOf(leftFirst) !== hostOf(rightFirst);
    const differs =
      (leftCount > 0) !== (rightCount > 0) ||
      leftCount !== rightCount ||
      (!differentHost && leftFirst !== rightFirst);
    if (differs) {
      differences.push({
        pair,
        field: 'images',
        leftId: left.id,
        rightId: right.id,
        leftName: left.name,
        rightName: right.name,
        left: `${leftCount} image(s)${leftFirst ? `, first ${leftFirst}` : ''}`,
        right: `${rightCount} image(s)${rightFirst ? `, first ${rightFirst}` : ''}`,
        detail: differentHost
          ? 'the two catalogues serve assets from different hosts, so the URLs are not comparable — only presence and count are'
          : 'same asset host, so the differing first image is a real difference',
      });
    } else if (differentHost && leftCount > 0) {
      // Presence and count agree, but the assets themselves come from different hosts,
      // so nothing about the image *content* has been established. Silence here would
      // read as "the images match", which is the one thing this comparison cannot say.
      cannot(
        'images.content',
        `${left.source} serves its images from ${hostOf(leftFirst) ?? 'a different host'} and ${right.source} from ${hostOf(rightFirst) ?? 'another'}, so image content is not comparable — only presence and count are`,
      );
    }
  }

  /* categories */
  if (!leftReadable.categories || !rightReadable.categories) {
    cannot(
      'categories',
      !leftReadable.categories ? `${left.source} categories were not readable` : `${right.source} categories were not readable`,
    );
  } else {
    const leftSet = categorySet(left.categories);
    const rightSet = categorySet(right.categories);
    const onlyLeft = [...leftSet].filter((name) => !rightSet.has(name)).sort();
    const onlyRight = [...rightSet].filter((name) => !leftSet.has(name)).sort();
    if (onlyLeft.length > 0 || onlyRight.length > 0) {
      differences.push({
        pair,
        field: 'categories',
        leftId: left.id,
        rightId: right.id,
        leftName: left.name,
        rightName: right.name,
        left: [...leftSet].sort().join(', ') || '(none)',
        right: [...rightSet].sort().join(', ') || '(none)',
        detail: `only on ${left.source}: ${onlyLeft.join(', ') || 'none'}; only on ${right.source}: ${onlyRight.join(', ') || 'none'}`,
      });
    }
  }

  return { differences, notComparable };
}

/** The hostname of a URL, or `null` — used to decide whether two image URLs are comparable at all. */
export function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * The same numeric category id used for different categories in the two installations.
 *
 * Measured: id `75` is `Uncategorized` on the live apex and `Live Stock` on staging,
 * and `105` is `Bulk Order` on both. Any copy that carries term ids across therefore
 * files curated livestock products under `Uncategorized` while looking like it worked —
 * which is why the migration plan maps categories by **name** and this function exists
 * to keep the trap visible in every run.
 */
export function findCategoryIdCollisions(leftCategories, rightCategories) {
  const rightById = new Map((rightCategories || []).map((c) => [c.id, c]));
  const collisions = [];
  for (const left of leftCategories || []) {
    const right = rightById.get(left.id);
    if (!right) continue;
    const same = String(left.name).trim().toLowerCase() === String(right.name).trim().toLowerCase();
    collisions.push({
      id: left.id,
      leftName: left.name,
      rightName: right.name,
      agreement: same ? 'same meaning' : 'DIFFERENT meaning — never copy this id',
    });
  }
  return collisions.sort((a, b) => a.id - b.id);
}

/* ------------------------------------------------------------------ */
/* The manifest                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the whole manifest from already-read sources.
 *
 * @param {object} sources the return value of `readCatalogueSources()`
 * @param {object} [options]
 * @param {string} [options.generatedAt]
 */
export function buildMigrationManifest(sources, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const liveRows = sources.live.rows;
  const curatedRows = sources.curated.rows;
  const servedRows = sources.served.rows;

  const livePublished = liveRows.filter((row) => row.status === 'publish');

  /* --- keying, and whether keyed matching is possible at all --- */
  const skuMatchingPossible = sources.live.readable.sku && sources.curated.readable.sku;
  const keyingBlockers = [];
  if (!sources.live.readable.sku) {
    keyingBlockers.push(
      `${sources.live.origin} does not accept the configured WooCommerce key pair (HTTP ${sources.live.rich.status}), so the live catalogue exposes no SKU. Until it does, the live↔curated mapping cannot be decided on SKUs and every pair below is a suggestion for a human.`,
    );
  }
  if (!sources.curated.readable.sku) {
    keyingBlockers.push(
      `${sources.curated.origin} could not be read for SKUs (HTTP ${sources.curated.products.status}), so there is nothing to match against.`,
    );
  }

  /* --- the only automatic match available: SKU on both sides --- */
  const skuMatch = matchBySku(livePublished, curatedRows);
  const exactSkuMatches = skuMatch.pairs
    .filter((entry) => !entry.ambiguous)
    .map((entry) => ({ sku: entry.sku, live: entry.left, curated: entry.right }));
  const ambiguousSkuPairs = skuMatch.pairs
    .filter((entry) => entry.ambiguous)
    .map((entry) => ({
      sku: entry.sku,
      live: entry.left,
      curated: entry.right,
      reason: 'the SKU is held by more than one product on at least one side, so this pairing is not one-to-one',
    }));

  /* --- duplicates, per source, before anything is matched on them --- */
  const duplicateSkus = [
    ...findDuplicateSkus(livePublished).map((entry) => ({ source: 'live', ...entry })),
    ...findDuplicateSkus(curatedRows).map((entry) => ({ source: 'curated', ...entry })),
    ...findDuplicateSkus(servedRows).map((entry) => ({ source: 'served', ...entry })),
  ];

  /* --- curated-side products: suggested pairs, and the ones with no counterpart --- */
  const matchedCuratedIds = new Set(exactSkuMatches.map((entry) => entry.curated.id));
  const possibleMatchesRequiringOwnerApproval = [];
  const productsRequiringCreation = [];

  for (const row of curatedRows) {
    if (matchedCuratedIds.has(row.id)) continue;
    const candidates = suggestCandidates(row, livePublished);
    if (candidates.length === 0) {
      productsRequiringCreation.push({
        source: 'curated',
        id: row.id,
        sku: row.sku,
        name: row.name,
        status: row.status,
        price: row.price,
        stock: `${row.stockStatus ?? '?'}${typeof row.stockQuantity === 'number' ? ` (${row.stockQuantity})` : ''}`,
        categories: row.categories,
        images: row.imageUrls.length,
        reason: 'no live product shares any significant word with this name',
      });
      continue;
    }
    possibleMatchesRequiringOwnerApproval.push({
      curated: {
        id: row.id,
        sku: row.sku,
        name: row.name,
        status: row.status,
        price: row.price,
        stock: `${row.stockStatus ?? '?'}${typeof row.stockQuantity === 'number' ? ` (${row.stockQuantity})` : ''}`,
        categories: row.categories,
        images: row.imageUrls.length,
      },
      candidates: candidates.map((entry) => ({
        live: {
          id: entry.candidate.id,
          name: entry.candidate.name,
          sku: entry.candidate.sku,
          status: entry.candidate.status,
          categories: entry.candidate.categories,
          link: entry.candidate.link,
        },
        score: Number(entry.score.toFixed(3)),
        sharedWords: entry.shared,
        liveWordsNotInCurated: entry.differing,
      })),
      decision: 'owner approval required',
      decidedBy: 'name similarity only — no SKU was available on the live side',
    });
  }

  /* --- live-side products with no counterpart in the curated catalogue --- */
  const matchedLiveIds = new Set(exactSkuMatches.map((entry) => entry.live.id));
  const suggestedLiveIds = new Set(
    possibleMatchesRequiringOwnerApproval.flatMap((entry) => entry.candidates.map((c) => c.live.id)),
  );
  const missingProductionProducts = livePublished
    .filter((row) => !matchedLiveIds.has(row.id) && !suggestedLiveIds.has(row.id))
    .map((row) => ({
      source: 'live',
      id: row.id,
      name: row.name,
      status: row.status,
      sku: row.sku,
      categories: row.categories,
      image: row.image,
      modified: row.modified,
      liveUrl: row.link,
      note: 'published on the live domain today and indexed by its sitemap; the cutover would drop it unless it is created or deliberately retired',
    }));

  /* --- one live product claimed by several curated products --- */
  const claimsByLiveId = new Map();
  for (const entry of possibleMatchesRequiringOwnerApproval) {
    const best = entry.candidates[0];
    if (!best) continue;
    claimsByLiveId.set(best.live.id, [...(claimsByLiveId.get(best.live.id) ?? []), entry.curated]);
  }
  const conflictingProducts = [];
  for (const [liveId, curatedProducts] of claimsByLiveId) {
    if (curatedProducts.length < 2) continue;
    const live = livePublished.find((row) => row.id === liveId);
    conflictingProducts.push({
      kind: 'several curated products suggest the same live product',
      liveId,
      liveName: live?.name ?? null,
      curatedProducts: curatedProducts.map((c) => ({ id: c.id, sku: c.sku, name: c.name })),
      effect:
        'only one of these can be the live product; the others are a re-created line or a duplicate, and importing all of them against this live product would collapse them into one',
    });
  }
  for (const entry of duplicateSkus) {
    conflictingProducts.push({
      kind: 'duplicate SKU',
      source: entry.source,
      sku: entry.sku,
      products: entry.products,
      effect: 'an import keyed on this SKU would update one of these products arbitrarily',
    });
  }
  for (const entry of ambiguousSkuPairs) {
    conflictingProducts.push({
      kind: 'ambiguous SKU pairing',
      sku: entry.sku,
      liveId: entry.live.id,
      curatedId: entry.curated.id,
      effect: entry.reason,
    });
  }
  for (const entry of exactSkuMatches) {
    const score = suggestCandidates(entry.curated, [entry.live])[0]?.score ?? 0;
    if (score >= 0.34) continue;
    conflictingProducts.push({
      kind: 'the same SKU names two different products',
      sku: entry.sku,
      liveId: entry.live.id,
      liveName: entry.live.name,
      curatedId: entry.curated.id,
      curatedName: entry.curated.name,
      nameOverlap: Number(score.toFixed(3)),
      effect: 'either one record was renamed or the SKU was reused for a different product — never import over this without a decision',
    });
  }

  /* --- field-level differences, separately per pair of catalogues --- */
  const differences = { price: [], stock: [], images: [], categories: [] };
  const notComparable = [];

  const liveComparisons = [];
  for (const entry of exactSkuMatches) liveComparisons.push([entry.live, entry.curated]);
  for (const entry of possibleMatchesRequiringOwnerApproval) {
    const best = entry.candidates[0];
    const curated = curatedRows.find((row) => row.id === entry.curated.id);
    const live = livePublished.find((row) => row.id === best.live.id);
    if (curated && live) liveComparisons.push([live, curated]);
  }
  for (const [left, right] of liveComparisons) {
    const result = comparePair(left, right, {
      leftReadable: sources.live.readable,
      rightReadable: sources.curated.readable,
      pair: 'live↔curated',
    });
    for (const key of Object.keys(differences)) {
      differences[key].push(...result.differences.filter((entry) => entry.field === key));
    }
    notComparable.push(...result.notComparable);
  }

  const curatedById = new Map(curatedRows.map((row) => [row.id, row]));
  const servedById = new Map(servedRows.map((row) => [row.id, row]));
  for (const [id, curated] of curatedById) {
    const served = servedById.get(id);
    if (!served) continue;
    const result = comparePair(curated, served, {
      leftReadable: sources.curated.readable,
      rightReadable: sources.served.readable,
      pair: 'curated↔served',
    });
    for (const key of Object.keys(differences)) {
      differences[key].push(...result.differences.filter((entry) => entry.field === key));
    }
    notComparable.push(...result.notComparable);
  }

  /* --- the catalogue the storefront serves that staging does not hold --- */
  const servedNotInCurated = servedRows.filter((row) => !curatedById.has(row.id));
  const curatedPublishedNotServed = curatedRows.filter(
    (row) => row.status === 'publish' && !servedById.has(row.id),
  );

  return {
    schemaVersion: 1,
    generatedAt,
    dryRun: true,
    writesMade: false,
    writesAllowed: false,
    keying: {
      strategy: 'sku',
      byDatabaseId: false,
      liveSkuReadable: sources.live.readable.sku,
      curatedSkuReadable: sources.curated.readable.sku,
      skuMatchingPossible,
      blockers: keyingBlockers,
      note: 'Products are never matched by database id: the two installations are separate WordPress sites whose id spaces do not overlap.',
    },
    sources: [
      {
        key: 'live',
        label: 'live apex WordPress catalogue (what the domain sells today)',
        url: sources.live.page.url,
        auth: 'none — public WP REST',
        status: sources.live.page.status,
        count: sources.live.rows.length,
        readable: sources.live.readable,
      },
      {
        key: 'live-rich',
        label: 'live apex WooCommerce fields (price, SKU, stock)',
        url: sources.live.rich.url ?? `${sources.live.origin}/wp-json/wc/v3/products`,
        auth: 'configured WooCommerce pair',
        status: sources.live.rich.status,
        count: Array.isArray(sources.live.rich.json) ? sources.live.rich.json.length : 0,
        readable: { price: sources.live.readable.price, sku: sources.live.readable.sku, stock: sources.live.readable.stock },
      },
      {
        key: 'live-media',
        label: 'live apex featured image URLs',
        url: sources.live.mediaRead.url,
        auth: 'none — public',
        status: sources.live.mediaRead.status,
        count: sources.live.rows.filter((row) => row.image).length,
        readable: { images: sources.live.readable.images },
      },
      {
        key: 'curated',
        label: 'staging WooCommerce catalogue (the curated source of truth)',
        url: sources.curated.products.url,
        auth: 'configured pair',
        status: sources.curated.products.status,
        count: sources.curated.rows.length,
        readable: sources.curated.readable,
      },
      {
        key: 'served',
        label: 'staging storefront catalogue (what a shopper is served today)',
        url: sources.served.catalog.url,
        auth: 'none',
        status: sources.served.catalog.status,
        count: sources.served.rows.length,
        degraded: sources.served.degraded,
        readable: sources.served.readable,
      },
      ...(sources.preProduction
        ? [
            {
              key: 'preProduction',
              label: 'pre-cutover production Worker',
              url: `${sources.preProduction.origin}/api/catalog`,
              auth: 'none for the gate check, preview token for the read',
              status: sources.preProduction.unauth.status,
              authenticatedStatus: sources.preProduction.auth?.status ?? null,
              count: sources.preProduction.rows.length,
              degraded: sources.preProduction.degraded,
            },
          ]
        : []),
    ],
    coverage: {
      live: {
        total: liveRows.length,
        published: livePublished.length,
        draft: liveRows.filter((row) => row.status === 'draft').length,
        withoutSku: rowsWithoutSku(livePublished).length,
      },
      curated: {
        total: curatedRows.length,
        published: curatedRows.filter((row) => row.status === 'publish').length,
        draft: curatedRows.filter((row) => row.status === 'draft').length,
        withoutSku: rowsWithoutSku(curatedRows).length,
      },
      served: {
        total: servedRows.length,
        published: servedRows.length,
        withoutSku: rowsWithoutSku(servedRows).length,
      },
    },
    exactSkuMatches,
    possibleMatchesRequiringOwnerApproval,
    missingProductionProducts,
    productsRequiringCreation,
    duplicateSkus,
    conflictingProducts,
    differences,
    notComparable,
    categoryIdCollisions: findCategoryIdCollisions(
      sources.live.categories,
      sources.curated.categories,
    ),
    servedNotInCurated,
    curatedPublishedNotServed,
    rowsWithoutSku: {
      live: rowsWithoutSku(livePublished),
      curated: rowsWithoutSku(curatedRows),
      served: rowsWithoutSku(servedRows),
    },
    summary: {
      livePublished: livePublished.length,
      curatedTotal: curatedRows.length,
      servedTotal: servedRows.length,
      exactSkuMatches: exactSkuMatches.length,
      possibleMatchesRequiringOwnerApproval: possibleMatchesRequiringOwnerApproval.length,
      missingProductionProducts: missingProductionProducts.length,
      productsRequiringCreation: productsRequiringCreation.length,
      duplicateSkus: duplicateSkus.length,
      conflictingProducts: conflictingProducts.length,
      priceDifferences: differences.price.length,
      stockDifferences: differences.stock.length,
      imageDifferences: differences.images.length,
      categoryDifferences: differences.categories.length,
      notComparable: notComparable.length,
      skuMatchingPossible,
    },
    reviewChecklist: [
      'Confirm the backup and its verified restore first — docs/production/BACKUP-RESTORE-VERIFICATION.md, checked with `npm run check:backup`. Nothing below may begin before that is PASS.',
      'Prove that wp.himalayankoh.com reaches the WordPress installation while its Site URL and Home URL stay on the apex (docs/production/WORDPRESS-HOSTING-PREP.md), because this manifest reads the live catalogue over the same installation.',
      'Create a WooCommerce REST key pair on the live apex installation (read-only is enough), then re-run this manifest: the SKU, price and stock columns stop being "not readable" and the exact matches become decidable.',
      'Assign a SKU to every live product that lacks one, and to any curated product that lacks one, before any import is designed.',
      'Decide each suggested pair: is the curated product a replacement for the live product, or an addition?',
      'Map categories by name and never by term id (see categoryIdCollisions).',
      'Decide, product by product, what happens to each live product with no counterpart — keep published, retire with a redirect, or leave alone.',
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

const rowLine = (row) =>
  `\`${row.sku ?? 'no SKU'}\` · id ${row.id} · ${row.status} · ${row.price ?? 'price not readable'} · ${row.categories?.join(', ') || 'no category'}`;

/**
 * The human-reviewable half of the manifest.
 *
 * Written to be read by the owner before anything is imported, so it leads with what
 * the run could and could not establish, and every list says where its entries came
 * from. It contains no credential and no value the live site does not already publish.
 */
export function renderManifestMarkdown(manifest, { jsonPath } = {}) {
  const L = [];
  const s = manifest.summary;

  L.push('# Catalogue migration manifest (dry run)');
  L.push('');
  L.push(`Generated ${manifest.generatedAt} by \`scripts/plan-catalogue-migration.mjs\`.`);
  L.push('');
  L.push('**Read-only dry run. Nothing was created, updated, published or deleted, and this');
  L.push('tool has no write mode.** It reads four catalogues with GET requests, classifies what');
  L.push('it finds, and stops. Any future write needs a separate, explicit owner approval —');
  L.push('see `docs/production/FINAL-GPT6-HANDOFF.md` for the current gate.');

  if (jsonPath) L.push(`\nMachine-readable form: \`${jsonPath}\``);
  L.push('');
  L.push('## What this run could establish');
  L.push('');
  L.push('| | Value |');
  L.push('| --- | --- |');
  L.push(`| Keyed matching on SKU possible? | **${manifest.keying.skuMatchingPossible ? 'yes' : 'no'}** |`);
  L.push(`| Live apex SKU readable? | ${manifest.keying.liveSkuReadable ? 'yes' : 'no'} |`);
  L.push(`| Curated catalogue SKU readable? | ${manifest.keying.curatedSkuReadable ? 'yes' : 'no'} |`);
  L.push(`| Exact SKU matches | ${s.exactSkuMatches} |`);
  L.push(`| Possible matches needing owner approval | ${s.possibleMatchesRequiringOwnerApproval} |`);
  L.push(`| Missing production products (live, absent from the curated catalogue) | ${s.missingProductionProducts} |`);
  L.push(`| Products requiring creation (curated, absent from live) | ${s.productsRequiringCreation} |`);
  L.push(`| Duplicate SKUs | ${s.duplicateSkus} |`);
  L.push(`| Conflicting products | ${s.conflictingProducts} |`);
  L.push(`| Price differences | ${s.priceDifferences} |`);
  L.push(`| Stock differences | ${s.stockDifferences} |`);
  L.push(`| Image differences | ${s.imageDifferences} |`);
  L.push(`| Category differences | ${s.categoryDifferences} |`);
  L.push(`| Comparisons not possible (unreadable field) | ${s.notComparable} |`);
  L.push('');

  if (manifest.keying.blockers.length > 0) {
    L.push('### Why keyed matching is blocked');
    L.push('');
    for (const blocker of manifest.keying.blockers) L.push(`- ${blocker}`);
    L.push('');
  }

  L.push('## Sources, and what each could answer');
  L.push('');
  L.push('| Source | URL | Auth | HTTP | Rows | Readable fields |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const source of manifest.sources) {
    const readable =
      Object.entries(source.readable || {})
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(', ') || 'none';
    L.push(
      `| ${source.label} | \`${source.url}\` | ${source.auth} | ${source.status}${source.authenticatedStatus !== undefined && source.authenticatedStatus !== null ? ` (authed ${source.authenticatedStatus})` : ''} | ${source.count} | ${readable} |`,
    );
  }
  L.push('');
  L.push('## Coverage');
  L.push('');
  L.push('| | Total | Published | Draft | Without a SKU |');
  L.push('| --- | --- | --- | --- | --- |');
  L.push(`| Live apex | ${manifest.coverage.live.total} | ${manifest.coverage.live.published} | ${manifest.coverage.live.draft} | ${manifest.coverage.live.withoutSku} |`);
  L.push(`| Curated (staging) | ${manifest.coverage.curated.total} | ${manifest.coverage.curated.published} | ${manifest.coverage.curated.draft} | ${manifest.coverage.curated.withoutSku} |`);
  L.push(`| Served (storefront) | ${manifest.coverage.served.total} | ${manifest.coverage.served.published} | — | ${manifest.coverage.served.withoutSku} |`);
  L.push('');

  L.push('## 1. Exact matches (same SKU on both sides)');
  L.push('');
  if (manifest.exactSkuMatches.length === 0) {
    L.push(manifest.keying.skuMatchingPossible
      ? '_None._'
      : '_None possible: the live apex does not expose SKUs, so no pair could be decided automatically. See the blocker above._');
  } else {
    for (const match of manifest.exactSkuMatches) {
      L.push(`- \`${match.sku}\` — live ${match.live.id} “${match.live.name}” ↔ curated ${match.curated.id} “${match.curated.name}”`);
    }
  }
  L.push('');

  L.push('## 2. Possible matches requiring owner approval');
  L.push('');
  if (manifest.possibleMatchesRequiringOwnerApproval.length === 0) {
    L.push('_None._');
  } else {
    L.push('Each of these is a **suggestion by name overlap**, never a decision. Reject any pair');
    L.push('whose shared words are incidental.');
    L.push('');
    for (const entry of manifest.possibleMatchesRequiringOwnerApproval) {
      L.push(`- **${entry.curated.name}** (${rowLine(entry.curated)})`);
      for (const candidate of entry.candidates) {
        L.push(
          `  - live id ${candidate.live.id} — “${candidate.live.name}” (score ${candidate.score}; shares ${candidate.sharedWords.join(', ') || 'nothing'}; live-only words ${candidate.liveWordsNotInCurated.join(', ') || 'none'})`,
        );
      }
      L.push(`  - decision: **${entry.decision}** (${entry.decidedBy})`);
    }
  }
  L.push('');

  L.push('## 3. Missing production products (published live, nothing curated corresponds)');
  L.push('');
  if (manifest.missingProductionProducts.length === 0) {
    L.push('_None._');
  } else {
    L.push('These are live today, are in the live sitemap, and would disappear if the catalogue');
    L.push('were replaced. **The default is that they stay published** until the owner says');
    L.push('otherwise; retiring one is a decision with SEO consequences, not cleanup.');
    L.push('');
    for (const row of manifest.missingProductionProducts) {
      L.push(`- live id ${row.id} — “${row.name}” (${row.categories.join(', ') || 'no category'}, modified ${String(row.modified || '').slice(0, 10)}) — ${row.liveUrl ?? ''}`);
    }
  }
  L.push('');

  L.push('## 4. Products requiring creation (curated, no live counterpart at all)');
  L.push('');
  if (manifest.productsRequiringCreation.length === 0) {
    L.push('_None._');
  } else {
    for (const row of manifest.productsRequiringCreation) {
      L.push(`- **${row.name}** (${rowLine(row)}) — ${row.reason}`);
    }
  }
  L.push('');

  L.push('## 5. Duplicate SKUs');
  L.push('');
  if (manifest.duplicateSkus.length === 0) {
    L.push('_None found._');
  } else {
    L.push('A SKU that appears twice breaks the only key this migration has: an import would');
    L.push('update one of the two products arbitrarily.');
    L.push('');
    for (const entry of manifest.duplicateSkus) {
      L.push(`- \`${entry.sku}\` appears ${entry.count}× in **${entry.source}**: ${entry.products.map((p) => `id ${p.id} “${p.name}”`).join(' · ')}`);
    }
  }
  L.push('');

  L.push('## 6. Conflicting products');
  L.push('');
  if (manifest.conflictingProducts.length === 0) {
    L.push('_None found._');
  } else {
    for (const entry of manifest.conflictingProducts) {
      L.push(`- **${entry.kind}**`);
      L.push(`  - ${JSON.stringify(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'kind' && key !== 'effect')))}`);
      L.push(`  - effect: ${entry.effect}`);
    }
  }
  L.push('');

  L.push('## 7. Field differences');
  L.push('');
  for (const [field, entries] of Object.entries(manifest.differences)) {
    L.push(`### ${field}`);
    L.push('');
    if (entries.length === 0) {
      L.push('_None found._');
      L.push('');
      continue;
    }
    L.push('| pair | left | right | value |');
    L.push('| --- | --- | --- | --- |');
    for (const entry of entries) {
      L.push(
        `| ${entry.pair} | ${entry.leftId} “${String(entry.leftName).slice(0, 40)}” | ${entry.rightId} “${String(entry.rightName).slice(0, 40)}” | ${String(entry.left)} → ${String(entry.right)}${entry.detail ? ` — ${entry.detail}` : ''}${entry.delta !== undefined ? ` (delta ${entry.delta})` : ''} |`,
      );
    }
    L.push('');
  }

  L.push('## 8. Comparisons that could not be made');
  L.push('');
  if (manifest.notComparable.length === 0) {
    L.push('_Every field this run needed was readable._');
  } else {
    L.push('A field one side cannot answer for is **not** evidence that the two sides agree.');
    L.push('');
    const byField = new Map();
    for (const entry of manifest.notComparable) {
      const key = `${entry.field} — ${entry.reason}`;
      byField.set(key, (byField.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...byField.entries()].sort()) L.push(`- ${count} pair(s): ${key}`);
  }
  L.push('');

  L.push('## 9. Category term ids that collide across the two installations');
  L.push('');
  if (manifest.categoryIdCollisions.length === 0) {
    L.push('_No shared term id found._');
  } else {
    for (const entry of manifest.categoryIdCollisions) {
      L.push(`- id \`${entry.id}\`: live “${entry.leftName}” vs curated “${entry.rightName}” — **${entry.agreement}**`);
    }
  }
  L.push('');

  L.push('## 10. What the storefront serves that staging does not hold (and vice versa)');
  L.push('');
  L.push(`- Served but not in the curated catalogue: **${manifest.servedNotInCurated.length}**${manifest.servedNotInCurated.length ? ` — ${manifest.servedNotInCurated.map((row) => `id ${row.id} “${row.name}”`).join(' · ')}` : ''}`);
  L.push(`- Published in the curated catalogue but not served: **${manifest.curatedPublishedNotServed.length}**${manifest.curatedPublishedNotServed.length ? ` — ${manifest.curatedPublishedNotServed.map((row) => `id ${row.id} “${row.name}”`).join(' · ')}` : ''}`);
  L.push('');

  L.push('## Review checklist');
  L.push('');
  for (const item of manifest.reviewChecklist) L.push(`- [ ] ${item}`);
  L.push('');
  L.push('## What this manifest cannot establish');
  L.push('');
  L.push('- **Whether a suggested pair is the same product.** With no live SKU, name overlap is the only shared signal.');
  L.push('- **Live price, SKU and stock** while the apex rejects the configured key pair.');
  L.push('- **Variations and their children.** A variable product\'s variations are separate records with their own SKUs, prices and stock; neither source expands them here.');
  L.push('- **Anything unpublished** beyond what each endpoint returns: trashed, private and pending products are invisible to both paths.');
  L.push('- **Orders and customers.** This compares catalogue definitions only, and says nothing about the orders already placed against the live products, which must be preserved.');
  L.push('');

  return `${L.join('\n')}\n`;
}
