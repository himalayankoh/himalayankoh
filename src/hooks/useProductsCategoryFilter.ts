import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CATEGORY_QUERY_PARAM,
  categoryKeyFromFilterLabel,
  filterLabelFromKey,
  normalizeCategoryQueryValue,
  parseCategoryFromSearchParams,
  resolveCategoryFilterKey,
} from '../lib/categoryContent';

const ALL_LABEL = 'All';

/**
 * URL is the source of truth: /products?category=edible-pink-salt
 *
 * A `?category=` value that is not a live shelf resolves to All and the parameter
 * is dropped, so an old link — from the livestock shelves the store used to have,
 * or a typo — lands on the whole catalogue instead of an empty grid. Browser
 * back/forward restores filters.
 *
 * The address bar is only read from the render *after mount*. Before that the
 * router reports an empty query string on purpose (its `getServerSnapshot`),
 * which is also what the server had, so the hydration render has to decide from
 * `initialCategoryKey` alone. Reading `window.location` a render early made the
 * hub page hydrate as the whole catalogue — React error #418 on every load of
 * `/products?category=<shelf>`; see `resolveCategoryFilterKey` for the whole
 * account.
 */
export function useProductsCategoryFilter(initialCategoryKey?: string | null) {
  const [searchParams, setSearchParams] = useSearchParams();

  /** False on the server and on the hydration render; true from the render after mount. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const categoryKey = useMemo(
    () =>
      resolveCategoryFilterKey({
        hydrated,
        browserHasQuery: typeof window !== 'undefined' && Boolean(window.location.search),
        fromSearchParams: parseCategoryFromSearchParams(searchParams),
        initialCategoryKey,
      }),
    [hydrated, searchParams, initialCategoryKey]
  );

  const activeFilter = useMemo(
    () => (categoryKey ? filterLabelFromKey(categoryKey) : ALL_LABEL),
    [categoryKey]
  );

  /** Strip invalid ?category= values so broken links fall back to All. */
  useEffect(() => {
    const raw = searchParams.get(CATEGORY_QUERY_PARAM);
    if (!raw) return;

    const resolved = normalizeCategoryQueryValue(raw);
    if (!resolved) {
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
  }, [searchParams, setSearchParams]);

  const setActiveFilter = useCallback(
    (label: string) => {
      const key = label === ALL_LABEL ? null : categoryKeyFromFilterLabel(label);

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!key) {
            next.delete(CATEGORY_QUERY_PARAM);
          } else {
            next.set(CATEGORY_QUERY_PARAM, key);
          }
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  return {
    activeFilter,
    categoryKey,
    setActiveFilter,
    isAll: activeFilter === ALL_LABEL,
  };
}
