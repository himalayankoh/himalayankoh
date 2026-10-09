import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { NICHE_SECTIONS } from '../catalog/nicheSections';
import {
  ALL_LABEL,
  CATEGORY_FILTER_TABS,
  CATEGORY_QUERY_PARAM,
  buildProductsCategoryPath,
  categoryFilterLabelForProduct,
  categoryKeyFromFilterLabel,
  filterLabelFromKey,
  normalizeCategoryQueryValue,
  parseCategoryFromSearchParams,
  productCategoryFilterKey,
  productMatchesCategoryFilter,
  productsCategoryTabs,
  resolveAvailableCategoryKey,
} from './index';
import { queryOnlyDestination } from '../router/locationMatch';

/**
 * The products page's category control, pinned.
 *
 * Every one of these cases was either broken on the deployed staging build or is
 * one edit away from breaking silently:
 *
 *  - clicking a shelf did nothing at all, because the click was a same-pathname
 *    query change and the router shim left those to Next's router, which did not
 *    complete them (see `lib/router-compat.test.ts` for that rule);
 *  - the footer linked `Salt Lamps & Décor`, a shelf the catalogue no longer has —
 *    a link that looks like a filter and quietly resets to All.
 *
 * The suite also covers the data side, so "the filter works" means the grid shows
 * the right products and not merely that the URL changed.
 */

const shelves = NICHE_SECTIONS
  .filter((section) => section.visibleInStorefront)
  .map((section) => ({ key: section.key, label: section.label }));

/** A product-shaped value for the placement rule, taken from what Woo reports. */
function product(name: string, categoryNames: string[] = []) {
  return {
    id: name,
    name,
    category: categoryNames[0] ?? '',
    categories: categoryNames,
    sku: '',
    description: '',
  } as unknown as Parameters<typeof productMatchesCategoryFilter>[0];
}

describe('the shelf list', () => {
  it('offers All first and then every live shelf once', () => {
    expect(CATEGORY_FILTER_TABS[0]).toEqual({ label: ALL_LABEL, key: null });
    const keys = CATEGORY_FILTER_TABS.map((tab) => tab.key).filter(Boolean);
    expect(keys).toEqual(shelves.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has a label for every key and a key for every label', () => {
    for (const shelf of shelves) {
      expect(filterLabelFromKey(shelf.key)).toBe(shelf.label);
      expect(categoryKeyFromFilterLabel(shelf.label)).toBe(shelf.key);
    }
    expect(filterLabelFromKey('bulk')).toBe('Bulk and Rock Salt');
    expect(categoryKeyFromFilterLabel('Bulk and Rock Salt')).toBe('bulk');
    expect(categoryKeyFromFilterLabel('Not A Shelf')).toBeNull();
  });

  it('builds the URL that the router shim knows to apply in place', () => {
    // The two halves have to agree: the pill writes `?category=<key>`, and the shim
    // only acts on a link whose pathname matches the current page.
    for (const shelf of shelves) {
      const path = buildProductsCategoryPath(shelf.key);
      expect(path).toBe(`/products?${CATEGORY_QUERY_PARAM}=${shelf.key}`);
      expect(queryOnlyDestination(path, '/products')).toBe(path);
    }
    expect(buildProductsCategoryPath(null)).toBe('/products');
    expect(queryOnlyDestination('/products', '/products?category=bulk')).toBe('/products');
  });
});

/**
 * Real product titles from the staging store, and the shelf each one belongs on.
 *
 * Written from the live catalogue rather than invented, because the fixture has to
 * fail when the placement rule changes underneath it: these are the titles the
 * storefront actually renders, so a shelf that stops matching them becomes an empty
 * grid that no test would otherwise notice.
 */
const CATALOGUE: Array<{ title: string; shelf: string }> = [
  { title: 'Himalayan Pink Edible Salt Fine Grain — 16 oz Jar', shelf: 'edible-pink-salt' },
  { title: 'Himalayan Pink Edible Salt Coarse Grain — 16 oz Jar', shelf: 'edible-pink-salt' },
  { title: 'Himalayan Pink Edible Salt Fine Grain Pouch — 6 lbs', shelf: 'edible-pink-salt' },
  { title: 'Himalayan Salt Fine Grain — 3 lbs', shelf: 'edible-pink-salt' },
  { title: 'Himalayan Salt Lick — 30 lbs', shelf: 'licks-blocks' },
  { title: 'Himalayan Salt Lick — 1 to 2 lbs', shelf: 'licks-blocks' },
  { title: 'Himalayan Salt Block — 30 lbs', shelf: 'cooking-serving' },
  { title: 'Himalayan Salt Block — Rectangular 8 x 4 x 1 in', shelf: 'cooking-serving' },
  { title: 'Himalayan Salt Fine Grain — 45 lbs (0.5–1.0 mm)', shelf: 'bulk' },
  { title: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)', shelf: 'bulk' },
];

describe('selecting a shelf', () => {
  const catalogue = CATALOGUE.map((entry) => product(entry.title));

  it('shows every product under All', () => {
    for (const item of catalogue) {
      expect(productMatchesCategoryFilter(item, null, ALL_LABEL)).toBe(true);
    }
  });

  it('shows exactly the products the shelf claims, and no others', () => {
    for (const shelf of shelves) {
      const expected = CATALOGUE.filter((entry) => entry.shelf === shelf.key).map((e) => e.title);
      const visible = catalogue
        .filter((item) => productMatchesCategoryFilter(item, shelf.key, shelf.label))
        .map((item) => (item as { name: string }).name);
      expect(visible.sort()).toEqual(expected.sort());
    }
  });

  it('places every product on the shelf it is filed under, so no product is counted twice', () => {
    const placed = CATALOGUE.map((entry) => product(entry.title));
    const counts = shelves.map(
      (shelf) => placed.filter((item) => productMatchesCategoryFilter(item, shelf.key, shelf.label)).length
    );
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(placed.length);
  });

  it('changes what is visible when the shelf changes — the symptom that was missing', () => {
    // The reported bug was that the grid looked identical whichever shelf was
    // chosen. Distinct signatures per shelf are what makes that impossible.
    const signatures = shelves.map((shelf) =>
      catalogue
        .filter((item) => productMatchesCategoryFilter(item, shelf.key, shelf.label))
        .map((item) => (item as { name: string }).name)
        .sort()
        .join('|')
    );
    const nonEmpty = signatures.filter(Boolean);
    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
  });
});

describe('the URL is the filter', () => {
  it('reads a shelf out of the query string', () => {
    for (const shelf of shelves) {
      const params = new URLSearchParams(`${CATEGORY_QUERY_PARAM}=${shelf.key}`);
      expect(parseCategoryFromSearchParams(params)).toBe(shelf.key);
    }
  });

  it('accepts any well-formed category slug, because the categories come from the catalogue', () => {
    // The pills are built from the products now, so this resolver only judges the
    // *shape* of the value: a slug is a value the shop can address. Whether
    // anything is filed under it is the catalogue's question, below.
    expect(normalizeCategoryQueryValue('gift-sets-and-samplers')).toBe('gift-sets-and-samplers');
    expect(normalizeCategoryQueryValue('licings-blocks')).toBe('licings-blocks');
    expect(normalizeCategoryQueryValue('animal-feed')).toBe('animal-feed');
    expect(normalizeCategoryQueryValue('Not A Slug!')).toBeNull();
    expect(normalizeCategoryQueryValue('')).toBeNull();
    expect(normalizeCategoryQueryValue(null)).toBeNull();
  });

  it('falls back to All for a category no product carries', () => {
    // A retired shelf, a typo, a legacy term, and a category the shop has no
    // product for. None may open a filter or render an empty grid under a heading
    // that claims to be one.
    const catalogue = [
      product('Himalayan Salt Lick — 30 lbs', ['Salt Licks']),
      product('Himalayan Salt Fine Grain — 45 lbs (0.5–1.0 mm)', ['Bulk and Rock Salt']),
    ];
    expect(resolveAvailableCategoryKey('licks-blocks', catalogue)).toBe('licks-blocks');
    expect(resolveAvailableCategoryKey('bulk', catalogue)).toBe('bulk');
    expect(resolveAvailableCategoryKey('licings-blocks', catalogue)).toBeNull();
    expect(resolveAvailableCategoryKey('animal-feed', catalogue)).toBeNull();
    expect(resolveAvailableCategoryKey('himalayan-chef-fine-grain-jar-1-lbs', catalogue)).toBeNull();
    expect(resolveAvailableCategoryKey('', catalogue)).toBeNull();
    expect(resolveAvailableCategoryKey(null, catalogue)).toBeNull();
    expect(parseCategoryFromSearchParams(new URLSearchParams('category=animal-feed'))).toBe(
      'animal-feed'
    );
  });

  it('is case- and whitespace-insensitive, so a hand-typed link still works', () => {
    const key = shelves[0].key;
    expect(normalizeCategoryQueryValue(`  ${key.toUpperCase()}  `)).toBe(key);
  });
});

describe('the pills are built from the catalogue, not a code list', () => {
  it('turns a brand-new WooCommerce category into a working pill with no code change', () => {
    const catalogue = [
      product('Himalayan Pink Salt Gift Trio', ['Gift Sets & Samplers']),
      product('Himalayan Edible Pink Salt – 16 oz Jar', ['Edible Pink Salt']),
    ];
    const tabs = productsCategoryTabs(catalogue);
    expect(tabs[0]).toEqual({ label: ALL_LABEL, key: null });
    expect(tabs.map((tab) => tab.label)).toEqual([
      'All',
      'Edible Pink Salt',
      'Gift Sets & Samplers',
    ]);
    expect(tabs.find((tab) => tab.label === 'Gift Sets & Samplers')?.key).toBe(
      'gift-sets-and-samplers'
    );
  });

  it('filters by the new category and not another', () => {
    const gift = product('Himalayan Pink Salt Gift Trio', ['Gift Sets & Samplers']);
    expect(productMatchesCategoryFilter(gift, 'gift-sets-and-samplers')).toBe(true);
    expect(productMatchesCategoryFilter(gift, 'edible-pink-salt')).toBe(false);
    expect(productMatchesCategoryFilter(gift, null, ALL_LABEL)).toBe(true);
  });

  it('keeps the shelf key for a category the taxonomy already serves', () => {
    // The owner files under the WooCommerce name "Salt Licks"; the shelf key is
    // still `licks-blocks`, so its hub copy and its existing links stay reachable.
    const lick = product('Himalayan Pink Salt Licks for Horses 2 lbs', ['Salt Licks']);
    expect(productCategoryFilterKey(lick)).toBe('licks-blocks');
  });

  it('offers no pill for a category with no products', () => {
    const tabs = productsCategoryTabs([product('Himalayan Salt Lick — 30 lbs', ['Salt Licks'])]);
    expect(tabs.map((tab) => tab.label)).toEqual(['All', 'Salt Licks']);
  });

  it('orders shelves by the taxonomy and newer categories after them', () => {
    const catalogue = [
      product('Himalayan Pink Salt Gift Trio', ['Gift Sets & Samplers']),
      product('Himalayan Salt Fine Grain — 45 lbs (0.5–1.0 mm)', ['Bulk and Rock Salt']),
      product('Himalayan Edible Pink Salt – 16 oz Jar', ['Edible Pink Salt']),
    ];
    expect(productsCategoryTabs(catalogue).map((tab) => tab.label)).toEqual([
      'All',
      'Edible Pink Salt',
      'Bulk and Rock Salt',
      'Gift Sets & Samplers',
    ]);
  });
});

describe('navigation that must never advertise a filter the taxonomy does not have', () => {
  it('gives the footer no shelf key the taxonomy does not have', () => {
    // The footer writes its shelf keys out by hand, and nothing in the type system
    // stops one of them being misspelled into a filter that silently resets the
    // shopper to All. This walks the file's own `buildProductsCategoryPath('…')`
    // calls and checks each against the taxonomy — the same guard shape the admin
    // route suite uses, and the reason a key can no longer drift here unnoticed.
    const footer = readFileSync(fileURLToPath(new URL('../../components/Footer.tsx', import.meta.url)), 'utf8');
    const declared = [...footer.matchAll(/buildProductsCategoryPath\('([^']+)'\)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);

    const live = new Set<string>(shelves.map((s) => s.key));
    expect(declared.filter((key) => !live.has(key))).toEqual([]);
  });

  it('gives the homepage no shelf key the taxonomy does not have', () => {
    // Same guard for the homepage's "Shop by use" row, which names its shelves in
    // literal hrefs rather than through `buildProductsCategoryPath`.
    const home = readFileSync(fileURLToPath(new URL('../../views/HomePage.tsx', import.meta.url)), 'utf8');
    const declared = [...home.matchAll(/category=([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);

    const live = new Set<string>(shelves.map((s) => s.key));
    expect(declared.filter((key) => !live.has(key))).toEqual([]);
  });

  it('keeps the lamps shelf in the taxonomy, so its hub copy is still reachable', () => {
    // Recorded rather than asserted away: `lamps-decor` is a real shelf with real hub
    // content, and it is empty because the owner withheld the lamp/ionizer product
    // line. `CategoryFilterNav` hides a shelf with no matching products — which is why
    // no lamp pill appears on /products — while its URL stays valid for anyone holding
    // an old link. Whether the shelf should leave the taxonomy is the owner's call, so
    // this test pins the current, deliberate shape instead of pretending it is gone.
    expect(normalizeCategoryQueryValue('lamps-decor')).toBe('lamps-decor');
  });
});

/**
 * The live catalogue's own filing, pinned.
 *
 * These are the five records the launch catalogue can sell, with the store's own
 * product ids, titles and category names verbatim (read from the deployed
 * `/api/catalog` on 2026-10-09): `animal feed` for the 45 lb bag for livestock, the
 * licks for horses and the 18 lb rock for cattle, and WooCommerce's default
 * `Uncategorized` bucket for the 16 oz edible jar and the 6 lb livestock pouches.
 *
 * That filing is the whole point of this suite's placement rule, and before the join
 * existed none of it reached a shelf: every one of these products was offered under a
 * pill carrying a raw WooCommerce category name, while `Live Stock` and `Edible Pink
 * Salt` — the two shelves the homepage and the footer link to — rendered empty grids.
 *
 * The two unfiled records are the harder half, and the ids are the whole reason the
 * expectations below are what they are: the pouches' title reads as edible salt, so
 * only the record's own identity files it on the livestock shelf.
 */
describe("the live catalogue's own categories reach the shelf the store means", () => {
  /** One record, as the catalogue read reports it. Ids are the store's own. */
  function live(id: number, name: string, category: string) {
    return {
      id,
      name,
      category,
      categories: [category],
      sku: '',
      description: '',
    } as unknown as Parameters<typeof productMatchesCategoryFilter>[0];
  }

  const liveCatalogue = [
    live(271, 'Bag of Himalayan Pink Salt for Livestock (45 lb)', 'animal feed'),
    live(281, 'Himalayan Pink Salt Licks for Horses', 'animal feed'),
    live(291, 'Himalayan Salt Rock for Cattle 18 lb Bag', 'animal feed'),
    live(2321, 'Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes - 6 lb', 'Uncategorized'),
    live(2446, 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain', 'Uncategorized'),
  ];

  const pouches = liveCatalogue[3];
  const jar = liveCatalogue[4];

  it('files the owner\u2019s animal feed category onto the Live Stock shelf', () => {
    for (const item of liveCatalogue.slice(0, 3)) {
      expect(productCategoryFilterKey(item)).toBe('live-stock');
    }
    expect(resolveAvailableCategoryKey('live-stock', liveCatalogue)).toBe('live-stock');
  });

  it('reads the default bucket as no filing rather than as a shelf of its own', () => {
    // It arrives spelled exactly like a category the owner named, so only an
    // explicit rule keeps it from becoming a pill reading "Uncategorized".
    expect(liveCatalogue.map((item) => productCategoryFilterKey(item))).not.toContain('uncategorized');
    expect(liveCatalogue.map((item) => productCategoryFilterKey(item))).not.toContain('Uncategorized');
    expect(resolveAvailableCategoryKey('uncategorized', liveCatalogue)).toBeNull();
  });

  it('files the unfiled records by the record, not by the words in the title', () => {
    // The pouches are livestock salt whose title says "pouches"; the name rule reads
    // that as edible salt, which is how an animal product reached the edible shelf.
    expect(productCategoryFilterKey(pouches)).toBe('live-stock');
    expect(categoryFilterLabelForProduct(pouches, 'live-stock')).toBe('Live Stock');
    expect(buildProductsCategoryPath('live-stock')).toBe('/products?category=live-stock');

    expect(productCategoryFilterKey(jar)).toBe('edible-pink-salt');
    expect(categoryFilterLabelForProduct(jar, 'edible-pink-salt')).toBe('Edible Pink Salt');
  });

  it('puts each record on exactly one shelf, and never on the other one\u2019s', () => {
    expect(productMatchesCategoryFilter(pouches, 'live-stock')).toBe(true);
    expect(productMatchesCategoryFilter(pouches, 'edible-pink-salt')).toBe(false);
    expect(productMatchesCategoryFilter(jar, 'edible-pink-salt')).toBe(true);
    expect(productMatchesCategoryFilter(jar, 'live-stock')).toBe(false);
  });

  it('offers a filter only where products are filed behind it', () => {
    const tabs = productsCategoryTabs(liveCatalogue);
    expect(tabs.map((tab) => tab.label)).toEqual(['All', 'Edible Pink Salt', 'Live Stock']);

    for (const tab of tabs) {
      const shown = liveCatalogue.filter((item) => productMatchesCategoryFilter(item, tab.key));
      expect(shown.length).toBeGreaterThan(0);
    }
  });

  it('says one category on a product page, and says the shelf it is filed on', () => {
    // The crumb and the eyebrow are the two statements a product page makes about its
    // category; a page that reads `Live Stock` in the crumb and `animal feed` above the
    // title is telling the shopper two different things about one record.
    const detail = readFileSync(
      fileURLToPath(new URL('../../components/ProductDetailView.tsx', import.meta.url)),
      'utf8'
    );
    expect(detail).toMatch(
      /const eyebrowCategory = categoryKey \? categoryShopLabel : reportedCategoryName\(product\.category\)/
    );
  });
});
