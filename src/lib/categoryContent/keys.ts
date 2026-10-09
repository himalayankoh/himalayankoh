import {
  NICHE_SECTIONS,
  isUnfiledWooCategory,
  nicheSection,
  nicheSectionKeyFor,
  nicheSectionKeyForWooCategory,
  type NicheCheckInput,
  type NicheSectionKey,
} from '../catalog/nicheSections';
import { storedShelfKeyForProduct } from './storedFiling';

/**
 * The shop's public taxonomy: which shelves exist, what they are called, and
 * which URL each one lives at.
 *
 * The shelves themselves are owned by `lib/catalog/niche.ts` — that module
 * decides what the store sells and how it is shelved. This module is only the
 * routing adapter on top of it: labels, `?category=` values, title → path
 * lookups for cards and the footer, and the matching predicate the product grid
 * uses. Keeping the taxonomy in one place is what stops the rail, the filter
 * pills, the hub pages, the sitemap and the PDP from each listing a different
 * set of shelves.
 *
 * ## The pills are built from the catalogue, not from a code list
 *
 * The filter pills used to come from `NICHE_SECTIONS` alone, which meant the
 * owner could not add a category without a code change — a new category in
 * WooCommerce was invisible until someone edited a list here and redeployed.
 * They are now derived from the products the page is actually showing
 * (`productsCategoryTabs`): a product's own WooCommerce category decides its
 * filter (`productCategoryFilterKey`), so a category the owner creates in
 * WooCommerce becomes a working pill the moment a product carries it, and a
 * category with no products never appears. `NICHE_SECTIONS` still owns the
 * shelves the shop *means* to have — a category the owner names after one keeps
 * that shelf's key, its hub copy and its existing links.
 *
 * `live-stock` serves the owner's current Live Stock filing; retired category
 * slugs remain unsupported. Known hubs keep their filter when empty so a direct
 * cooking-category link cannot silently display animal products under All.
 */

/** Display label for "no shelf selected". */
export const ALL_LABEL = 'All';

/** A shelf the taxonomy's hub content is written for. */
export type CategoryContentKey = NicheSectionKey;

/**
 * A `?category=` value: a shelf key, or the slug of a WooCommerce category the
 * catalogue carries. Deliberately open — the pills are built from the products,
 * so a value that is well-formed but not one of the shelves has to be addressable
 * the moment a product carries it.
 */
export type CategoryFilterKey = string;

export interface CategoryFilterTab {
  label: string;
  /** `null` is the All tab. */
  key: CategoryFilterKey | null;
}

/**
 * The shelves the shop means to have, All first, in curation order.
 *
 * This is the *known* taxonomy — the labels the hub copy is written for and the keys
 * old links and the sitemap use. It is no longer the pill row itself: the pills
 * are `productsCategoryTabs(products)`, so a category with no products is not
 * offered and a category the owner adds is offered without a code change. Kept
 * exported because shelf order, the footer's link lookup and the category-hub
 * registry are all keyed off it.
 */
export const CATEGORY_FILTER_TABS: readonly CategoryFilterTab[] = [
  { label: ALL_LABEL, key: null },
  ...NICHE_SECTIONS.filter((section) => section.visibleInStorefront)
    .map((section) => ({ label: section.label, key: section.key })),
];

const KEY_BY_LABEL = new Map<string, CategoryContentKey>(
  NICHE_SECTIONS.filter((section) => section.visibleInStorefront)
    .map((section) => [section.label, section.key])
);

export function categoryKeyFromFilterLabel(label: string): CategoryContentKey | null {
  return KEY_BY_LABEL.get(label) ?? null;
}

/** The shelf's display label — the single source for pills, breadcrumbs and titles. */
export function filterLabelFromKey(key: CategoryContentKey): string {
  return nicheSection(key).label;
}

/**
 * The shelf a product belongs on, from its name and category.
 *
 * `null` means "no shelf claims it", which the grid treats as All and the
 * sitemap treats as "not a hub landing page". It never means "somewhere".
 */
export function productShelfKey(product: NicheCheckInput): CategoryContentKey | null {
  return nicheSectionKeyFor(product);
}

/** A URL-safe slug for a WooCommerce category name ("Gift Sets & Samplers" → "gift-sets-and-samplers"). */
export function categorySlugFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Reads a slug back into a title-ish label, for a category with no content registry entry. */
export function prettyCategoryLabelFromKey(key: string): string {
  return key
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** True when a value is a well-formed `?category=` value (a shelf key or a category slug). */
export function isCategoryFilterValue(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/**
 * The filter a product belongs to, from the owner's own filing in WooCommerce.
 *
 * The owner files a product into a category in WooCommerce and expects the shop's
 * filter row to carry it, so the filing decides the filter:
 *
 * 1. a category the taxonomy already serves (`nicheSectionKeyForWooCategory`)
 *    keeps its shelf key, so the hub page, its copy and its old links stay put;
 * 2. any other named category becomes its own filter, keyed by the slug of the
 *    category name — this is what lets a brand-new category appear without a code
 *    change;
 * 3. a product with no category — including one still sitting in WooCommerce's
 *    default `Uncategorized` bucket, which is a way of saying "not filed" rather
 *    than a category the owner chose — falls to the shelf recorded for that *record*
 *    (`storedFiling.ts`), and only then to the shelf its name implies; so an
 *    uncategorised record is still reachable rather than only under "All", no pill
 *    ever offers a bucket as if it were a shelf, and a record whose title reads as
 *    the wrong shelf is filed by its identity instead of by its words.
 *
 * The owner's filing outranks the name heuristic here on purpose: the filter row
 * is the shop's categories, and a shopper picking one expects the products the
 * owner put there.
 */
export function productCategoryFilterKey(product: NicheCheckInput): CategoryFilterKey | null {
  const filed = (product.category ?? '').trim();
  // The default bucket is not a filing, so it never becomes a filter of its own:
  // a product the owner has not filed falls through to the recorded filing below
  // rather than to a pill reading `Uncategorized`. See `isUnfiledWooCategory`.
  if (!isUnfiledWooCategory(filed)) {
    const shelved = nicheSectionKeyForWooCategory(filed, product);
    if (shelved) return shelved;
    const slug = categorySlugFromLabel(filed);
    if (slug) return slug;
  }
  // The store said nothing, so the shelf is decided by the record itself before the
  // name rule gets a guess at it: `storedFiling.ts` files the launch records WooCommerce
  // never filed, by id. That is what keeps the livestock pouches off the edible shelf —
  // their title reads as edible salt, and only the record's own identity answers it.
  return storedShelfKeyForProduct(product) ?? productShelfKey(product);
}

/** The label a filter shows: the shelf's own label, or the category name the owner wrote. */
export function categoryFilterLabelForProduct(
  product: NicheCheckInput,
  key: CategoryFilterKey
): string {
  if (isCategoryContentKey(key)) return filterLabelFromKey(key);
  return (product.category ?? '').trim() || prettyCategoryLabelFromKey(key);
}

/**
 * The category pills, built from the products themselves.
 *
 * "All" first, then one pill per category the catalogue actually carries: shelves
 * the taxonomy knows in their curation order, then any newer WooCommerce category
 * alphabetically. A category with no products never appears — there is no empty
 * filter — and a category the owner adds in WooCommerce appears the moment a
 * product carries it, with no code change.
 */
export function productsCategoryTabs(
  products: ReadonlyArray<NicheCheckInput>
): CategoryFilterTab[] {
  const labelByKey = new Map<CategoryFilterKey, string>();
  for (const product of products) {
    const key = productCategoryFilterKey(product);
    if (!key || labelByKey.has(key)) continue;
    labelByKey.set(key, categoryFilterLabelForProduct(product, key));
  }

  const shelfOrder = new Map<string, number>(
    NICHE_SECTIONS.map((section, index) => [section.key, index])
  );
  const keys = [...labelByKey.keys()].sort((a, b) => {
    const ai = shelfOrder.get(a) ?? Number.POSITIVE_INFINITY;
    const bi = shelfOrder.get(b) ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return (labelByKey.get(a) ?? '').localeCompare(labelByKey.get(b) ?? '');
  });

  return [
    { label: ALL_LABEL, key: null },
    ...keys.map((key) => ({ label: labelByKey.get(key) ?? prettyCategoryLabelFromKey(key), key })),
  ];
}

/**
 * Whether a product shows under the selected filter.
 *
 * A single judgement serves the pills, the grid and any count: the product is
 * matched by the same placement function that decides which filter it would be
 * filed under, so a product can never appear under one pill and be counted under
 * another.
 */
export function productMatchesCategoryFilter(
  product: NicheCheckInput,
  categoryKey: CategoryFilterKey | null,
  activeFilter?: string
): boolean {
  if (!categoryKey || activeFilter === ALL_LABEL) return true;
  return productCategoryFilterKey(product) === categoryKey;
}

export const CATEGORY_QUERY_PARAM = 'category';

const VALID_KEYS = new Set<string>(NICHE_SECTIONS.map((section) => section.key));

export function isCategoryContentKey(value: string): value is CategoryContentKey {
  return VALID_KEYS.has(value);
}

/** Narrows a URL value to a key the hub registry has content for, or `null`. */
export function toCategoryContentKey(value: string | null | undefined): CategoryContentKey | null {
  if (!value) return null;
  return isCategoryContentKey(value) ? value : null;
}

/**
 * Resolves a `?category=` value's *well-formedness*.
 *
 * Returns `null` for All and for anything that is not a URL-safe slug alike. It no
 * longer decides whether the value names a live shelf — the pills are built from
 * the catalogue now, so this cannot know what the shop carries. Whether anything
 * is behind the key is `resolveAvailableCategoryKey`'s question, answered against
 * the products the page is showing.
 */
export function normalizeCategoryQueryValue(
  raw: string | null | undefined
): CategoryFilterKey | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return isCategoryFilterValue(normalized) ? normalized : null;
}

/**
 * A `?category=` value resolved against the catalogue the page is showing.
 *
 * `normalizeCategoryQueryValue` says whether the value is well-formed; this says
 * whether it names a known hub or a category carried by the products. Known hubs
 * retain their filter when empty (and are noindexed/excluded from the sitemap);
 * otherwise a cooking link could display cattle products by falling back to All.
 * Unknown and retired values still resolve to All.
 */
export function resolveAvailableCategoryKey(
  raw: string | null | undefined,
  products: ReadonlyArray<NicheCheckInput>
): CategoryFilterKey | null {
  const key = normalizeCategoryQueryValue(raw);
  if (!key) return null;
  if (isCategoryContentKey(key)) return key;
  if (!products.some((product) => productCategoryFilterKey(product) === key)) return null;
  return key;
}

export function parseCategoryFromSearchParams(
  params: URLSearchParams
): CategoryFilterKey | null {
  return normalizeCategoryQueryValue(params.get(CATEGORY_QUERY_PARAM));
}

/**
 * Which shelf a render is showing, from the two places a shelf can be named.
 *
 * The shelf route (`app/(main)/products/shelf/[key]`) knows the key it was
 * rendered for and hands it in as `initialCategoryKey`. The browser's own query
 * string is the other source, because a query-only navigation (`?category=a` →
 * `?category=b`) is applied to `history` in place rather than through the router
 * (see `lib/router-compat`), so the route's prop can be one navigation behind the
 * address bar.
 *
 * `hydrated` is what stops those two disagreeing at the one moment React cannot
 * forgive: **the hydration render must produce the tree the server sent.** The
 * router's query string is empty on the server *and* on the hydration render —
 * deliberately, the shim's `getServerSnapshot` returns `''` there — so code that
 * read it before mount and treated "no query string" as "no shelf" hydrated the
 * hub as the whole catalogue. Measured on the deployed preview (2026-09-30):
 * `/products?category=edible-pink-salt` logged React error #418 ("hydration
 * failed") on every load, in a clean profile, while `/products`, `?search=` and an
 * unrecognised `?category=` were clean. So before the client is rendering on its
 * own the answer comes from `fromSearchParams` + `initialCategoryKey` only — the
 * exact inputs the server had — and the address bar becomes an input from the
 * render after mount.
 */
export interface CategoryFilterKeyInput {
  /** True from the render after mount; false on the server and on the hydration render. */
  hydrated: boolean;
  /** Whether the browser's address bar carries a query string at all. */
  browserHasQuery: boolean;
  /**
   * The browser's pathname, or `''` on the server.
   *
   * Needed only once the client owns the render: it is what tells a client-side
   * navigation to a query-less `/products` (All) apart from a direct visit to the
   * shelf *path* (`/products/shelf/<key>`), which still names its shelf. The
   * middleware never rewrites the address bar, so a shopper on a category is
   * always on `/products?category=<key>` — `/products/shelf/...` is only ever the
   * internal target of the rewrite or an explicitly requested path.
   */
  browserPath?: string;
  /** The shelf the router's query string names, already normalized. */
  fromSearchParams: CategoryFilterKey | null;
  /** The key the route was rendered for — the shelf route's own key, or null. */
  initialCategoryKey?: string | null;
}

/** True when a pathname is the shelf *path* the middleware rewrites to. */
export function isShelfRoutePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path === '/products/shelf' || path.startsWith('/products/shelf/');
}

export function resolveCategoryFilterKey({
  hydrated,
  browserHasQuery,
  browserPath,
  fromSearchParams,
  initialCategoryKey,
}: CategoryFilterKeyInput): CategoryFilterKey | null {
  // Once the client owns the render the address bar is the source of truth: a
  // query string naming no live shelf is All, and the effect in
  // `useProductsCategoryFilter` drops that value from the URL.
  if (hydrated && browserHasQuery) return fromSearchParams;

  // No query string in the address bar, and the client is rendering on its own.
  // Only a direct visit to the shelf path names a shelf here; on `/products` an
  // absent `?category=` is All. Falling back to `initialCategoryKey` regardless
  // was a real bug: a shopper who arrived on a category URL and then chose "All"
  // stayed on the category, because the key the route was *first* rendered for
  // outlived the query string that requested it.
  if (hydrated) {
    return isShelfRoutePath(browserPath) ? normalizeCategoryQueryValue(initialCategoryKey) : null;
  }

  if (fromSearchParams !== null) return fromSearchParams;
  if (initialCategoryKey) return normalizeCategoryQueryValue(initialCategoryKey);
  return null;
}

export function buildProductsCategoryPath(key: CategoryFilterKey | null): string {
  if (!key) return '/products';
  return `/products?${CATEGORY_QUERY_PARAM}=${encodeURIComponent(key)}`;
}

export function buildProductsCategorySearch(key: CategoryFilterKey | null): string {
  if (!key) return '';
  return `?${CATEGORY_QUERY_PARAM}=${encodeURIComponent(key)}`;
}

/**
 * Cards, the footer and the homepage name a shelf by its display title.
 *
 * A title that maps to nothing returns `/products` — the catalogue — because
 * sending a shopper to a filter that renders empty is worse than sending them to
 * everything.
 */
export const CATEGORY_LINK_BY_TITLE: Record<string, CategoryContentKey> = Object.fromEntries(
  NICHE_SECTIONS.filter((section) => section.visibleInStorefront)
    .map((section) => [section.label, section.key])
);

export function productsPathForCategoryTitle(title: string): string {
  return buildProductsCategoryPath(CATEGORY_LINK_BY_TITLE[title] ?? null);
}
