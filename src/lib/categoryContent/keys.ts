import {
  NICHE_SECTIONS,
  nicheSection,
  nicheSectionKeyFor,
  type NicheCheckInput,
  type NicheSectionKey,
} from '../catalog/nicheSections';

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
 * The livestock shelves that used to live here are gone rather than renamed: the
 * store does not sell feed-trade products, so those hubs, their copy and their
 * filter pills were retired together with the SKUs. `licks-blocks` is not one of
 * them returning — it is the shelf for the Salt Licks range the owner authorises
 * in the price list, which is why it exists in `NICHE_SECTIONS` and is admitted by
 * SKU rather than by the term guard. A link that still carries a retired value is
 * not special-cased anywhere — `normalizeCategoryQueryValue` treats every value
 * that is not a live shelf key as All, so a retired shelf and a misspelled one
 * behave identically and neither can render an empty hub.
 */

/** Display label for "no shelf selected". */
export const ALL_LABEL = 'All';

export type CategoryContentKey = NicheSectionKey;

export interface CategoryFilterTab {
  label: string;
  /** `null` is the All tab. */
  key: CategoryContentKey | null;
}

/** The filter pills, All first, then the shelves in the order niche.ts lists them. */
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

/**
 * Whether a product shows under the selected filter.
 *
 * A single judgement serves the pills, the grid and the hub counts: the product
 * is matched by the same placement function that decides which shelf it would be
 * filed under, so a product can never appear under one pill and be counted under
 * another.
 */
export function productMatchesCategoryFilter(
  product: NicheCheckInput,
  categoryKey: CategoryContentKey | null,
  activeFilter: string
): boolean {
  if (activeFilter === ALL_LABEL || !categoryKey) return true;
  return productShelfKey(product) === categoryKey;
}

export const CATEGORY_QUERY_PARAM = 'category';

const VALID_KEYS = new Set<string>(NICHE_SECTIONS.map((section) => section.key));

export function isCategoryContentKey(value: string): value is CategoryContentKey {
  return VALID_KEYS.has(value);
}

/**
 * Resolves a `?category=` value.
 *
 * Returns `null` for All and for anything that is not a live shelf key alike —
 * `useProductsCategoryFilter` strips the parameter in that case, which is the
 * honest outcome: the shopper sees the whole catalogue rather than an empty grid
 * under a shelf that does not exist. A retired shelf key, a typo and an invented
 * one therefore need no list of their own.
 */
export function normalizeCategoryQueryValue(raw: string | null | undefined): CategoryContentKey | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return isCategoryContentKey(normalized) ? normalized : null;
}

export function parseCategoryFromSearchParams(params: URLSearchParams): CategoryContentKey | null {
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
  /** The shelf the router's query string names, already normalized. */
  fromSearchParams: CategoryContentKey | null;
  /** The key the route was rendered for — the shelf route's own key, or null. */
  initialCategoryKey?: string | null;
}

export function resolveCategoryFilterKey({
  hydrated,
  browserHasQuery,
  fromSearchParams,
  initialCategoryKey,
}: CategoryFilterKeyInput): CategoryContentKey | null {
  // Once the client owns the render the address bar is the source of truth: a
  // query string naming no live shelf is All, and the effect in
  // `useProductsCategoryFilter` drops that value from the URL.
  if (hydrated && browserHasQuery) return fromSearchParams;

  if (fromSearchParams !== null) return fromSearchParams;
  if (initialCategoryKey) return normalizeCategoryQueryValue(initialCategoryKey);
  return null;
}

export function buildProductsCategoryPath(key: CategoryContentKey | null): string {
  if (!key) return '/products';
  return `/products?${CATEGORY_QUERY_PARAM}=${encodeURIComponent(key)}`;
}

export function buildProductsCategorySearch(key: CategoryContentKey | null): string {
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
