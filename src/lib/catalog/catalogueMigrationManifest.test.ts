/**
 * The rules the catalogue migration manifest decides with.
 *
 * These tests cover `scripts/lib/catalogueDiff.mjs` — the pure half of
 * `scripts/plan-catalogue-migration.mjs` — and they exist because of one asymmetry: a
 * diff engine's "no differences found" looks exactly like "I could not read the field".
 * The migration plan is standing on this manifest to decide what happens to thirteen
 * live products, so the properties that must hold are the ones tested here:
 *
 *   1. a field one side cannot answer for is reported as *not comparable*, never as a
 *      difference and never as agreement;
 *   2. products are matched on SKU and never on database id, and two products that both
 *      lack a SKU never match each other;
 *   3. a write flag is refused rather than ignored;
 *   4. the two spellings of "in stock" are the same stock.
 *
 * Where a test would otherwise depend on the live catalogue, it uses a fixture. The two
 * exceptions are deliberate and marked: the stop-word identity test cites the real
 * "Himalayan Chef" line, and the end-to-end case mirrors the measured live shape (13
 * published, no SKU readable) so the manifest's most important reporting behaviour is
 * pinned to a fixture that looks like production.
 */
import { describe, expect, it } from 'vitest';
import {
  REQUESTED_CLASSES,
  buildMigrationManifest as buildManifest,
  comparePair,
  findCategoryIdCollisions,
  findDuplicateSkus,
  findWriteFlag,
  matchBySku,
  nameSimilarity,
  normalizePrice,
  normalizeSku,
  normalizeStockStatus,
  renderManifestMarkdown,
  rowsWithoutSku,
  significantTokens,
  suggestCandidates,
} from '../../../scripts/lib/catalogueDiff.mjs';

/**
 * The manifest, as this file reads it.
 *
 * `catalogueDiff.mjs` is JavaScript the TypeScript compiler does not check, so two of
 * its arrays — the ones built by `push` rather than by `map` — infer as `never[]`, and a
 * test that read them would be asserting against `never`. Declaring the shape here makes
 * the assertions type-checked against the fields they actually touch, and `build()`
 * applies it once so no call site has to cast.
 */
interface ManifestView {
  schemaVersion: number;
  dryRun: boolean;
  writesMade: boolean;
  writesAllowed: boolean;
  keying: { skuMatchingPossible: boolean; byDatabaseId: boolean; blockers: string[] };
  summary: Record<string, number | boolean>;
  coverage: Record<string, Record<string, number>>;
  possibleMatchesRequiringOwnerApproval: Array<{
    curated: { id: number; sku: string | null; name: string };
    candidates: Array<{ live: { id: number; name: string }; score: number; sharedWords: string[] }>;
    decision: string;
  }>;
  exactSkuMatches: Array<{ sku: string; live: { id: number }; curated: { id: number } }>;
  missingProductionProducts: Array<{ source: string; note: string }>;
  productsRequiringCreation: Array<{ name: string; reason: string }>;
  duplicateSkus: Array<{ sku: string; products: Array<{ id: number }> }>;
  conflictingProducts: Array<{
    kind: string;
    liveId?: number;
    curatedProducts?: Array<{ id: number }>;
    effect: string;
  }>;
  categoryIdCollisions: Array<{ id: number; leftName: string; rightName: string; agreement: string }>;
  notComparable: Array<{ field: string; reason: string; pair: string }>;
  differences: Record<string, Array<{ field: string; detail?: string; delta?: number }>>;
}

/** One catalogue row, as `catalogueSources.mjs` shapes it. */
interface RawRow {
  source: string;
  id: number;
  name: string;
  sku: string | null;
  status: string;
  slug: string;
  link: string | null;
  price: string | null;
  regularPrice: string | null;
  stockStatus: string | null;
  stockQuantity: number | null;
  categoryIds: number[];
  categories: string[];
  imageUrls: string[];
  image: string | null;
  featuredMedia: number | null;
  modified: string | null;
  raw: unknown;
}

/** A read result, as `readCatalogueSources()` shapes it. */
interface RawSources {
  pair: { key: string; secret: string };
  hasPair: boolean;
  previewToken: string;
  live: {
    origin: string;
    page: { url: string; status: number; json: unknown };
    mediaRead: { url: string; status: number; json: unknown };
    categoriesRead: { url: string; status: number; json: unknown };
    rich: { url: string; status: number; json: unknown };
    acceptsPair: boolean;
    categories: Array<{ id: number; name: string }>;
    categoryNamesUnmapped: unknown[];
    mediaIdsCount: number;
    mediaResolvedCount: number;
    rows: RawRow[];
    readable: Record<string, boolean>;
  };
  curated: {
    origin: string;
    products: { url: string; status: number; json: unknown };
    categoriesRead: { url: string; status: number; json: unknown };
    categories: Array<{ id: number; name: string }>;
    rows: RawRow[];
    readable: Record<string, boolean>;
  };
  served: {
    origin: string;
    catalog: { url: string; status: number; json: unknown };
    rows: RawRow[];
    degraded: boolean;
    readable: Record<string, boolean>;
  };
  preProduction: null;
}

/**
 * The manifest builder, typed for these assertions.
 *
 * The `as never` is the JavaScript boundary: the module takes an untyped object, so the
 * fixtures below are cast into it rather than the other way round — which is what keeps
 * the fixtures checked against `RawSources` and the assertions checked against
 * `ManifestView`.
 */
const buildMigrationManifest = (sources: RawSources, options?: { generatedAt?: string }): ManifestView =>
  buildManifest(sources as never, options) as unknown as ManifestView;

/** A product row in the shape `scripts/lib/catalogueSources.mjs` produces. */
function row(overrides: Record<string, unknown> = {}): RawRow {
  return {
    source: 'curated',
    id: 1,
    name: 'Product',
    sku: null,
    status: 'publish',
    slug: 'product',
    link: null,
    price: null,
    regularPrice: null,
    stockStatus: null,
    stockQuantity: null,
    categoryIds: [],
    categories: [],
    imageUrls: [],
    image: null,
    featuredMedia: null,
    modified: null,
    raw: {},
    ...overrides,
  } as unknown as RawRow;
}

/** A read result in the shape `readCatalogueSources()` produces, with every flag settable. */
function sources({
  liveRows = [] as unknown[],
  curatedRows = [] as unknown[],
  servedRows = [] as unknown[],
  live = {},
  curated = {},
} = {}) {
  const readable = (overrides: Record<string, boolean>) => ({
    name: true,
    sku: true,
    price: true,
    stock: true,
    categories: true,
    images: true,
    modified: true,
    ...overrides,
  });
  return {
    pair: { key: '', secret: '' },
    hasPair: true,
    previewToken: '',
    live: {
      origin: 'https://himalayankoh.com',
      page: { url: 'https://himalayankoh.com/wp-json/wp/v2/product', status: 200, json: liveRows },
      mediaRead: { url: '', status: 200, json: [] },
      categoriesRead: { url: '', status: 200, json: [] },
      rich: { url: '', status: 200, json: [] },
      acceptsPair: true,
      categories: [],
      categoryNamesUnmapped: [],
      mediaIdsCount: 0,
      mediaResolvedCount: 0,
      rows: liveRows,
      readable: readable(live),
    },
    curated: {
      origin: 'https://himalayankoh.com/staging',
      products: { url: '', status: 200, json: curatedRows },
      categoriesRead: { url: '', status: 200, json: [] },
      categories: [],
      rows: curatedRows,
      readable: readable(curated),
    },
    served: {
      origin: 'https://preview.himalayankoh.com',
      catalog: { url: '', status: 200, json: { products: servedRows } },
      rows: servedRows,
      degraded: false,
      readable: readable({}),
    },
    preProduction: null,
  } as unknown as RawSources;
}

describe('normalizeSku', () => {
  it('folds the presentation differences that are not differences', () => {
    expect(normalizeSku('hk-lfc-45lbs')).toBe('HK-LFC-45LBS');
    expect(normalizeSku('  HK-LFC-45LBS  ')).toBe('HK-LFC-45LBS');
    expect(normalizeSku('hk_lfc_45lbs')).toBe('HK-LFC-45LBS');
    expect(normalizeSku('hk--lfc---45lbs')).toBe('HK-LFC-45LBS');
  });

  it('returns null for absent or blank SKUs so two unkeyed products never compare equal', () => {
    expect(normalizeSku(null)).toBeNull();
    expect(normalizeSku(undefined)).toBeNull();
    expect(normalizeSku('')).toBeNull();
    expect(normalizeSku('   ')).toBeNull();
    // Two products with no SKU both normalise to null, and `matchBySku` treats a null
    // key as un-matchable — so they can never be paired with each other by accident.
    expect(normalizeSku(null)).toBe(normalizeSku(''));
  });
});

describe('normalizePrice', () => {
  it('reads a price out of either source spelling', () => {
    expect(normalizePrice('49.95')).toBe(49.95);
    expect(normalizePrice('$49.95')).toBe(49.95);
    expect(normalizePrice(49.95)).toBe(49.95);
  });

  it('refuses to invent a number', () => {
    expect(normalizePrice(null)).toBeNull();
    expect(normalizePrice('')).toBeNull();
    expect(normalizePrice('price on request')).toBeNull();
  });
});

describe('normalizeStockStatus', () => {
  it('treats the two endpoints’ spellings of one status as one status', () => {
    expect(normalizeStockStatus('instock')).toBe(normalizeStockStatus('in_stock'));
    expect(normalizeStockStatus('outofstock')).toBe(normalizeStockStatus('out_of_stock'));
    expect(normalizeStockStatus('onbackorder')).toBe(normalizeStockStatus('on_backorder'));
    expect(normalizeStockStatus('instock')).not.toBe(normalizeStockStatus('outofstock'));
  });

  it('is null, not a value, when there is no status', () => {
    expect(normalizeStockStatus(null)).toBeNull();
    expect(normalizeStockStatus('')).toBeNull();
  });
});

describe('write flags', () => {
  it('refuses every flag that would mean a change', () => {
    for (const flag of ['--apply', '--write', '--commit', '--import', '--update', '--create', '--publish', '--delete', '--sync', '--push']) {
      expect(findWriteFlag([flag])).toBe(flag);
    }
  });

  it('catches a write flag written with a value or in different case', () => {
    // The whole token is returned so the refusal message can quote what was typed.
    expect(findWriteFlag(['--apply=true'])).toBe('--apply=true');
    expect(findWriteFlag(['--Apply'])).toBe('--Apply');
    expect(findWriteFlag(['--out', 'manifest.json', '--import'])).toBe('--import');
  });

  it('leaves the read-only flags alone', () => {
    expect(findWriteFlag(['--out', 'x.json', '--md', 'x.md', '--quiet'])).toBeNull();
    expect(findWriteFlag([])).toBeNull();
  });
});

describe('duplicate SKUs', () => {
  it('finds a SKU used twice and names both products', () => {
    const duplicates = findDuplicateSkus([
      row({ id: 10, sku: 'HK-A', name: 'First' }),
      row({ id: 11, sku: 'hk-a', name: 'Second' }),
      row({ id: 12, sku: 'HK-B', name: 'Third' }),
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].sku).toBe('HK-A');
    expect(duplicates[0].count).toBe(2);
    expect(duplicates[0].products.map((p: { id: number }) => p.id)).toEqual([10, 11]);
  });

  it('does not call two products without SKUs a duplicate — that is a coverage gap', () => {
    const rows = [row({ id: 10, sku: null }), row({ id: 11, sku: '' })];
    expect(findDuplicateSkus(rows)).toEqual([]);
    expect(rowsWithoutSku(rows).map((r: { id: number }) => r.id)).toEqual([10, 11]);
  });
});

describe('matchBySku', () => {
  it('pairs on the SKU and never on the id', () => {
    // The two installations are separate WordPress sites, so the same product has
    // different ids on each side: id 271 and id 2716 are the same bag of salt.
    const { pairs, leftOnly, rightOnly, leftWithoutSku } = matchBySku(
      [row({ source: 'live', id: 271, sku: 'HK-LFC-45LBS' }), row({ source: 'live', id: 2372, sku: null })],
      [row({ source: 'curated', id: 2716, sku: 'hk-lfc-45lbs' }), row({ source: 'curated', id: 9999, sku: 'HK-NEW' })],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].left.id).toBe(271);
    expect(pairs[0].right.id).toBe(2716);
    expect(pairs[0].ambiguous).toBe(false);
    expect(leftOnly).toEqual([]);
    expect(rightOnly.map((r: { id: number }) => r.id)).toEqual([9999]);
    // The live product with no SKU is reported as unkeyed, NOT as unmatched: it has not
    // been found to lack a counterpart, it has never been askable.
    expect(leftWithoutSku.map((r: { id: number }) => r.id)).toEqual([2372]);
  });

  it('marks a pairing ambiguous when the SKU is held twice on one side', () => {
    const { pairs } = matchBySku(
      [row({ source: 'live', id: 1, sku: 'HK-A' }), row({ source: 'live', id: 2, sku: 'HK-A' })],
      [row({ source: 'curated', id: 3, sku: 'HK-A' })],
    );
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.ambiguous)).toBe(true);
  });

  it('matches nothing at all when the live side exposes no SKU', () => {
    const { pairs, rightOnly } = matchBySku(
      [row({ source: 'live', id: 271, sku: null })],
      [row({ source: 'curated', id: 2716, sku: 'HK-LFC-45LBS' })],
    );
    expect(pairs).toEqual([]);
    expect(rightOnly).toHaveLength(1);
  });
});

describe('name comparison', () => {
  it('ignores the words every product in both catalogues shares', () => {
    expect([...significantTokens('Himalayan Koh Pure Natural Pink Salt')]).toEqual(['pink', 'salt']);
    expect(nameSimilarity('Himalayan Koh Pink Salt', 'Himalayan Koh Pink Salt')).toBe(1);
  });

  it('keeps a brand word that distinguishes two product lines', () => {
    // The live catalogue sells a "Himalayan Chef" line that is genuinely different from
    // the "Himalayan Koh" one. Treating `chef` as noise would merge the lines.
    expect(significantTokens('Himalayan Chef Pink Salt').has('chef')).toBe(true);
    expect(nameSimilarity('Himalayan Koh Pink Salt Fine', 'Himalayan Chef Pink Salt Fine')).toBeLessThan(1);
  });

  it('suggests candidates above the threshold, best first, with the words that differ', () => {
    const candidates = suggestCandidates(
      row({ name: 'Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh' }),
      [
        row({ id: 281, name: 'Himalayan Pink Salt Licks for Horses' }),
        row({ id: 2295, name: 'Salt lamp ionizer air purifier' }),
        row({ id: 2352, name: 'SALT LICKS' }),
      ],
    );
    expect(candidates[0].candidate.id).toBe(281);
    expect(candidates[0].score).toBeGreaterThan(0.7);
    expect(candidates[0].shared).toContain('licks');
    expect(candidates.map((c: { candidate: { id: number } }) => c.candidate.id)).not.toContain(2295);
  });
});

describe('comparePair', () => {
  const readable = { sku: true, price: true, stock: true, categories: true, images: true, modified: true, name: true };

  it('reports an unreadable field as not comparable, never as a difference', () => {
    // This is the live apex's actual situation: it can answer for names and categories
    // and nothing else.
    const result = comparePair(
      row({ source: 'live', id: 271, name: 'Bag of Himalayan Pink Salt', price: null, stockStatus: null }),
      row({ source: 'curated', id: 2716, name: 'Bag of Himalayan Pink Salt', price: '49.95', stockStatus: 'instock' }),
      { leftReadable: { ...readable, price: false, stock: false }, rightReadable: readable, pair: 'live↔curated' },
    );
    expect(result.differences).toEqual([]);
    expect(result.notComparable.map((e) => e.field)).toEqual(['price', 'stock']);
    expect(result.notComparable.every((e) => e.pair === 'live↔curated')).toBe(true);
  });

  it('reports a real price difference with its direction and delta', () => {
    const result = comparePair(
      row({ source: 'live', id: 271, price: '39.95' }),
      row({ source: 'curated', id: 2716, price: '49.95' }),
      { leftReadable: readable, rightReadable: readable, pair: 'live↔curated' },
    );
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].field).toBe('price');
    expect(result.differences[0].delta).toBe(10);
  });

  it('does not report the same stock under two different spellings', () => {
    const result = comparePair(
      row({ source: 'curated', id: 2752, price: '49.95', stockStatus: 'instock', stockQuantity: 10 }),
      row({ source: 'served', id: 2752, price: '49.95', stockStatus: 'in_stock', stockQuantity: 10 }),
      { leftReadable: readable, rightReadable: readable, pair: 'curated↔served' },
    );
    expect(result.differences).toEqual([]);
    expect(result.notComparable).toEqual([]);
  });

  it('reports a real stock difference, and an unknown quantity separately', () => {
    const changed = comparePair(
      row({ source: 'curated', id: 1, price: '19.95', stockStatus: 'instock', stockQuantity: 10 }),
      row({ source: 'served', id: 1, price: '19.95', stockStatus: 'outofstock', stockQuantity: 0 }),
      { leftReadable: readable, rightReadable: readable, pair: 'curated↔served' },
    );
    expect(changed.differences.map((d) => d.field)).toEqual(['stock']);
    expect(changed.differences[0].detail).toContain('quantity 10 → 0');

    const unknown = comparePair(
      row({ source: 'curated', id: 1, price: '19.95', stockStatus: 'instock', stockQuantity: null }),
      row({ source: 'served', id: 1, price: '19.95', stockStatus: 'instock', stockQuantity: 10 }),
      { leftReadable: readable, rightReadable: readable, pair: 'curated↔served' },
    );
    expect(unknown.differences).toEqual([]);
    expect(unknown.notComparable.map((e) => e.field)).toEqual(['stock.quantity']);
  });

  it('compares categories by name, not by term id', () => {
    const result = comparePair(
      row({ source: 'live', id: 1, categories: ['animal feed'] }),
      row({ source: 'curated', id: 2, categories: ['Live Stock'] }),
      { leftReadable: readable, rightReadable: readable, pair: 'live↔curated' },
    );
    expect(result.differences[0].field).toBe('categories');
    expect(result.differences[0].detail).toContain('only on live: animal feed');
    expect(result.differences[0].detail).toContain('only on curated: live stock');
  });

  it('only calls an image difference real when the two sides share an asset host', () => {
    const sameHost = comparePair(
      row({ source: 'live', id: 1, imageUrls: ['https://himalayankoh.com/wp-content/uploads/a.jpg'] }),
      row({ source: 'curated', id: 2, imageUrls: ['https://himalayankoh.com/staging/wp-content/uploads/b.jpg'] }),
      { leftReadable: readable, rightReadable: readable, pair: 'live↔curated' },
    );
    expect(sameHost.differences[0].detail).toContain('same asset host');

    const otherHost = comparePair(
      row({ source: 'curated', id: 1, imageUrls: ['https://himalayankoh.com/staging/wp-content/uploads/a.jpg', 'https://himalayankoh.com/staging/wp-content/uploads/b.jpg'] }),
      row({ source: 'served', id: 1, imageUrls: ['/images/products/a.webp'] }),
      { leftReadable: readable, rightReadable: readable, pair: 'curated↔served' },
    );
    expect(otherHost.differences[0].detail).toContain('different hosts');

    // Equal counts across different hosts establish nothing about the image content, and
    // saying nothing would read as "the images match".
    const equalCountOtherHost = comparePair(
      row({
        source: 'curated',
        id: 1,
        price: '19.95',
        stockStatus: 'instock',
        stockQuantity: 10,
        imageUrls: ['https://himalayankoh.com/staging/wp-content/uploads/a.jpg'],
      }),
      row({
        source: 'served',
        id: 1,
        price: '19.95',
        stockStatus: 'instock',
        stockQuantity: 10,
        imageUrls: ['/images/products/a.webp'],
      }),
      { leftReadable: readable, rightReadable: readable, pair: 'curated↔served' },
    );
    expect(equalCountOtherHost.differences).toEqual([]);
    expect(equalCountOtherHost.notComparable.map((e) => e.field)).toEqual(['images.content']);
  });
});

describe('category term id collisions', () => {
  it('flags a shared id that means different things on the two installations', () => {
    // Measured: id 75 is `Uncategorized` live and `Live Stock` on staging.
    const collisions = findCategoryIdCollisions(
      [{ id: 75, name: 'Uncategorized' }, { id: 105, name: 'Bulk Order' }],
      [{ id: 75, name: 'Live Stock' }, { id: 105, name: 'Bulk Order' }],
    );
    expect(collisions).toHaveLength(2);
    expect(collisions[0]).toMatchObject({ id: 75, agreement: 'DIFFERENT meaning — never copy this id' });
    expect(collisions[1].agreement).toBe('same meaning');
  });
});

describe('buildMigrationManifest', () => {
  /**
   * A fixture that looks like the measured live shape: thirteen published live
   * products, seven curated, six served, and a live side that cannot answer for SKU,
   * price or stock.
   */
  function liveShaped() {
    const liveRows = Array.from({ length: 13 }, (_, index) =>
      row({
        source: 'live',
        id: 200 + index,
        name: `Live product ${index}`,
        sku: null,
        price: null,
        stockStatus: null,
      }),
    );
    liveRows[0] = row({
      source: 'live',
      id: 271,
      name: 'Bag of Himalayan Pink Salt for Livestock (45 lbs.)',
      sku: null,
      price: null,
      stockStatus: null,
      categories: ['animal feed'],
      imageUrls: ['https://himalayankoh.com/wp-content/uploads/2020/10/1.jpeg'],
      link: 'https://himalayankoh.com/?p=271',
    });
    const curatedRows = Array.from({ length: 7 }, (_, index) =>
      row({
        source: 'curated',
        id: 2700 + index,
        name: `Curated product ${index}`,
        sku: `HK-${index}`,
        price: '19.95',
        stockStatus: 'instock',
        stockQuantity: 10,
      }),
    );
    curatedRows[0] = row({
      source: 'curated',
      id: 2716,
      name: 'Bag of Himalayan Pink Salt for Livestock (45 lbs.) - Himalayan Koh',
      sku: 'HK-LFC-45lbs',
      price: '49.95',
      stockStatus: 'instock',
      stockQuantity: 10,
      categories: ['Live Stock'],
    });
    return sources({
      liveRows,
      curatedRows,
      servedRows: curatedRows.slice(0, 6),
      live: { sku: false, price: false, stock: false },
    });
  }

  it('states plainly that keyed matching is impossible and produces no false matches', () => {
    const manifest = buildMigrationManifest(liveShaped(), { generatedAt: '2026-10-08T00:00:00.000Z' });
    expect(manifest.keying.skuMatchingPossible).toBe(false);
    expect(manifest.keying.byDatabaseId).toBe(false);
    expect(manifest.keying.blockers.length).toBeGreaterThan(0);
    expect(manifest.summary.exactSkuMatches).toBe(0);
    // The same bag of salt (live 271 ↔ curated 2716) has a similarity of 1.0 minus the
    // brand suffix, so it must appear as a suggestion needing approval, not as a match.
    const suggested = manifest.possibleMatchesRequiringOwnerApproval.find(
      (entry) => entry.curated.id === 2716,
    );
    expect(suggested).toBeDefined();
    expect(suggested!.candidates[0].live.id).toBe(271);
    expect(suggested!.decision).toBe('owner approval required');
  });

  it('never writes, and says so in the artefact itself', () => {
    const manifest = buildMigrationManifest(liveShaped());
    expect(manifest.dryRun).toBe(true);
    expect(manifest.writesMade).toBe(false);
    expect(manifest.writesAllowed).toBe(false);
    expect(manifest.schemaVersion).toBe(1);
  });

  it('separates live products with no counterpart from curated products needing creation', () => {
    const manifest = buildMigrationManifest(liveShaped());
    // Twelve live products share no significant word with any curated name.
    expect(manifest.summary.missingProductionProducts).toBe(12);
    expect(manifest.missingProductionProducts[0].source).toBe('live');
    expect(manifest.missingProductionProducts.every((entry) => entry.note.length > 0)).toBe(true);
    // Only the bag of salt has a live counterpart worth suggesting (the numbered
    // fixture names share one word too few to clear the threshold), so the other six
    // curated products need creating, and none of them is silently treated as matched.
    expect(manifest.summary.possibleMatchesRequiringOwnerApproval).toBe(1);
    expect(manifest.summary.productsRequiringCreation).toBe(6);
  });

  it('carries price and stock as not comparable rather than as agreement', () => {
    const manifest = buildMigrationManifest(liveShaped());
    expect(manifest.differences.price).toEqual([]);
    expect(manifest.notComparable.length).toBeGreaterThan(0);
    expect(manifest.notComparable.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 0)).toBe(true);
  });

  it('finds the shared term id that means two different things', () => {
    const withCollision = sources({
      liveRows: [row({ source: 'live', id: 1, categories: ['Uncategorized'], categoryIds: [75] })],
      curatedRows: [row({ source: 'curated', id: 2, categories: ['Live Stock'], categoryIds: [75] })],
    });
    withCollision.live.categories = [{ id: 75, name: 'Uncategorized' }];
    withCollision.curated.categories = [{ id: 75, name: 'Live Stock' }];
    const manifest = buildMigrationManifest(withCollision);
    expect(manifest.categoryIdCollisions).toEqual([
      { id: 75, leftName: 'Uncategorized', rightName: 'Live Stock', agreement: 'DIFFERENT meaning — never copy this id' },
    ]);
  });

  it('finds an ambiguous one-to-many suggestion rather than collapsing it', () => {
    const fixture = sources({
      liveRows: [row({ source: 'live', id: 271, name: 'Himalayan Pink Salt Licks for Horses' })],
      curatedRows: [
        row({ source: 'curated', id: 2721, name: 'Himalayan Pink Salt Licks for Horses 2 lbs' }),
        row({ source: 'curated', id: 2722, name: 'Himalayan Pink Salt Licks for Horses 4 lbs' }),
      ],
    });
    const manifest = buildMigrationManifest(fixture);
    const conflict = manifest.conflictingProducts.find(
      (entry) => entry.kind === 'several curated products suggest the same live product',
    );
    expect(conflict).toBeDefined();
    expect(conflict!.liveId).toBe(271);
    expect(conflict!.curatedProducts).toHaveLength(2);
  });

  it('reports a duplicate SKU as a conflict, not as a match', () => {
    const fixture = sources({
      liveRows: [row({ source: 'live', id: 1, sku: null, name: 'A' })],
      curatedRows: [
        row({ source: 'curated', id: 2, sku: 'HK-DUP', name: 'A' }),
        row({ source: 'curated', id: 3, sku: 'hk-dup', name: 'B' }),
      ],
    });
    const manifest = buildMigrationManifest(fixture);
    expect(manifest.duplicateSkus).toHaveLength(1);
    expect(manifest.duplicateSkus[0].sku).toBe('HK-DUP');
    expect(manifest.conflictingProducts.some((entry) => entry.kind === 'duplicate SKU')).toBe(true);
  });

  it('flags the same SKU naming two different products', () => {
    const fixture = sources({
      liveRows: [row({ source: 'live', id: 1, sku: 'HK-X', name: 'Red Rock Salt Lick for Cattle 30 lbs' })],
      curatedRows: [row({ source: 'curated', id: 2, sku: 'HK-X', name: 'Edible Pink Salt Jar 16 oz' })],
    });
    const manifest = buildMigrationManifest(fixture);
    expect(manifest.exactSkuMatches).toHaveLength(1);
    const conflict = manifest.conflictingProducts.find(
      (entry) => entry.kind === 'the same SKU names two different products',
    );
    expect(conflict).toBeDefined();
    expect(conflict!.effect).toContain('never import over this without a decision');
  });
});

describe('renderManifestMarkdown', () => {
  it('shows every class the migration plan asks for', () => {
    const manifest = buildMigrationManifest(
      sources({
        liveRows: [row({ source: 'live', id: 1, name: 'Live thing' })],
        curatedRows: [row({ source: 'curated', id: 2, name: 'Curated thing', sku: 'HK-1' })],
      }),
    );
    const markdown = renderManifestMarkdown(manifest, { jsonPath: 'docs/production/x.json' });
    for (const label of Object.keys(REQUESTED_CLASSES)) {
      expect(markdown).toContain(label);
    }
    expect(markdown).toContain('Read-only dry run');
    expect(markdown).toContain('## Review checklist');
    expect(markdown).toContain('docs/production/x.json');
  });

  it('never renders a credential or a variable name that holds one', () => {
    const manifest = buildMigrationManifest(
      sources({ curatedRows: [row({ source: 'curated', id: 1, sku: 'HK-1' })] }),
    );
    const markdown = renderManifestMarkdown(manifest);
    for (const forbidden of ['ck_', 'cs_', 'sk_live_', 'Bearer ', 'PREVIEW_ACCESS_TOKEN']) {
      expect(markdown).not.toContain(forbidden);
    }
  });
});
