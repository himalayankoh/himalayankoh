// ============================================================================
// Which shelf a render is showing — the hydration contract
//
// The shelf route renders the hub and tells the client which key it rendered for
// (`initialCategoryKey`). The client can also read the address bar — but not
// until it is rendering on its own: the router's query string is empty during the
// hydration render (the shim's `getServerSnapshot` returns ''), which is exactly
// what the server had. Deciding from `window.location` one render early made
// `/products?category=edible-pink-salt` hydrate as the whole catalogue and log
// React error #418 ("hydration failed") on every load of the deployed preview
// (2026-09-30), while `/products`, `?search=` and an unrecognised `?category=`
// were clean.
//
// The invariant these cases pin: **before the client owns the render, the answer
// is never influenced by the browser's URL** — it is the answer the server
// computed, or React throws the server's HTML away and re-renders the page.
// ============================================================================
import { describe, expect, it } from 'vitest';
import { resolveCategoryFilterKey, type CategoryFilterKeyInput } from './keys';

const SHELF = 'edible-pink-salt';
/** A value that is not a live shelf, e.g. one of the retired livestock shelves. */
const RETIRED = 'livestock';

/** What the server computes: there is no `window`, so its URL is never an input. */
const serverAnswer = (rest: Omit<CategoryFilterKeyInput, 'hydrated' | 'browserHasQuery'>) =>
  resolveCategoryFilterKey({ hydrated: false, browserHasQuery: false, ...rest });

describe('resolveCategoryFilterKey', () => {
  it('shows the shelf the route was rendered for on the hydration render', () => {
    // The address bar says ?category=edible-pink-salt, the router reports no
    // query string yet (as it did on the server), and the shelf route's own key
    // is the only thing that can answer. Getting this wrong is the bug.
    expect(
      resolveCategoryFilterKey({
        hydrated: false,
        browserHasQuery: true,
        fromSearchParams: null,
        initialCategoryKey: SHELF,
      })
    ).toBe(SHELF);
  });

  it('never lets the browser URL change the answer before the client owns the render', () => {
    const cases: Array<Omit<CategoryFilterKeyInput, 'hydrated' | 'browserHasQuery'>> = [
      { fromSearchParams: null, initialCategoryKey: SHELF },
      { fromSearchParams: null, initialCategoryKey: RETIRED },
      { fromSearchParams: null, initialCategoryKey: null },
      { fromSearchParams: null, initialCategoryKey: undefined },
    ];

    for (const inputs of cases) {
      for (const browserHasQuery of [true, false]) {
        expect(
          resolveCategoryFilterKey({ hydrated: false, browserHasQuery, ...inputs }),
          `browserHasQuery=${browserHasQuery} must not matter before hydration`
        ).toBe(serverAnswer(inputs));
      }
    }
  });

  it('takes the shelf from the address bar once the client is rendering on its own', () => {
    // A query-only navigation is applied to history in place, so this is the path
    // back/forward and the filter pills rely on.
    expect(
      resolveCategoryFilterKey({
        hydrated: true,
        browserHasQuery: true,
        fromSearchParams: SHELF,
        initialCategoryKey: null,
      })
    ).toBe(SHELF);
  });

  it('reads a query string with no live shelf in it as All, even when the route key is stale', () => {
    // The shopper cleared the filter: the URL no longer names a shelf, so the key
    // the route was rendered for must not keep the hub on screen.
    expect(
      resolveCategoryFilterKey({
        hydrated: true,
        browserHasQuery: true,
        fromSearchParams: null,
        initialCategoryKey: SHELF,
      })
    ).toBeNull();
  });

  it('falls back to the route key when there is no query string to read', () => {
    expect(
      resolveCategoryFilterKey({
        hydrated: true,
        browserHasQuery: false,
        fromSearchParams: null,
        initialCategoryKey: SHELF,
      })
    ).toBe(SHELF);
  });

  it('shows the whole catalogue with neither a shelf in the URL nor a route key', () => {
    expect(
      resolveCategoryFilterKey({
        hydrated: true,
        browserHasQuery: false,
        fromSearchParams: null,
        initialCategoryKey: null,
      })
    ).toBeNull();
  });

  it('treats a route key that is not a live shelf as All', () => {
    expect(
      resolveCategoryFilterKey({
        hydrated: false,
        browserHasQuery: false,
        fromSearchParams: null,
        initialCategoryKey: RETIRED,
      })
    ).toBeNull();
  });
});
