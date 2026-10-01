import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { NicheCheckInput } from '../lib/catalog/nicheSections';
import {
  CATEGORY_QUERY_PARAM,
  normalizeCategoryQueryValue,
  parseCategoryFromSearchParams,
  productCategoryFilterKey,
  resolveCategoryFilterKey,
} from '../lib/categoryContent';

/**
 * URL is the source of truth: /products?category=edible-pink-salt
 *
 * The category pills are built from the catalogue (`productsCategoryTabs`), so the
 * set of valid keys is no longer fixed in code: it is whatever categories the
 * products carry. That is why the products are an input here. A `?category=` value
 * that is not well-formed, or that names a category nothing is filed under, is
 * All and the parameter is dropped, so an old link — from the livestock shelves
 * the store used to have, or a typo — lands on the whole catalogue instead of an
 * empty grid. Browser back/forward restores filters.
 *
 * The address bar is only read from the render *after mount*. Before that the
 * router reports an empty query string on purpose (its `getServerSnapshot`),
 * which is also what the server had, so the hydration render has to decide from
 * `initialCategoryKey` alone, plus the same products the server rendered with.
 * Reading `window.location` a render early made the hub page hydrate as the whole
 * catalogue — React error #418 on every load of `/products?category=<shelf>`; see
 * `resolveCategoryFilterKey` for the whole account.
 *
 * A page with no products yet cannot judge a key and leaves it alone; the effect
 * re-resolves once the catalogue arrives. That is what stops a valid category
 * from flickering to All during the first client read.
 */
export function useProductsCategoryFilter(
  initialCategoryKey?: string | null,
  products: ReadonlyArray<NicheCheckInput> = []
) {
  const [searchParams, setSearchParams] = useSearchParams();

  /** False on the server and on the hydration render; true from the render after mount. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const categoryKey = useMemo(() => {
    const resolved = resolveCategoryFilterKey({
      hydrated,
      browserHasQuery: typeof window !== 'undefined' && Boolean(window.location.search),
      browserPath: typeof window !== 'undefined' ? window.location.pathname : '',
      fromSearchParams: parseCategoryFromSearchParams(searchParams),
      initialCategoryKey,
    });
    if (!resolved) return null;
    // With no catalogue read yet there is nothing to check the key against.
    if (products.length === 0) return resolved;
    return products.some((product) => productCategoryFilterKey(product) === resolved)
      ? resolved
      : null;
  }, [hydrated, searchParams, initialCategoryKey, products]);

  /** Strip invalid ?category= values so broken and stale links fall back to All. */
  useEffect(() => {
    const raw = searchParams.get(CATEGORY_QUERY_PARAM);
    if (!raw) return;

    const resolved = normalizeCategoryQueryValue(raw);
    const known =
      resolved !== null &&
      (products.length === 0 ||
        products.some((product) => productCategoryFilterKey(product) === resolved));

    if (!known || resolved === null) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(CATEGORY_QUERY_PARAM);
          return next;
        },
        { replace: true }
      );
      return;
    }

    if (raw !== resolved) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(CATEGORY_QUERY_PARAM, resolved);
          return next;
        },
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams, products]);

  return { categoryKey };
}
