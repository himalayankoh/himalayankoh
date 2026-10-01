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
import {
  resolveAvailableCategoryKey,
  resolveCategoryFilterKey,
  type CategoryFilterKeyInput,
} from './keys';

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

  it('keeps the route key when the client is on the shelf path itself', () => {
    // A direct visit to the rewrite target (/products/shelf/<key>) has no query
    // string in the address bar but still names its shelf.
    expect(
      resolveCategoryFilterKey({
        hydrated: true,
        browserHasQuery: false,
        browserPath: `/products/shelf/${SHELF}`,
        fromSearchParams: null,
        initialCategoryKey: SHELF,
      })
    ).toBe(SHELF);
  });

  it('reads a query-less /products as All even when the route was rendered for a shelf', () => {
    // The shopper arrived on a category URL (the shelf route rendered it and is
    // still the current route), then chose "All". The query string that requested
    // the shelf is gone, so the shelf must be too — the route prop alone must not
    // keep it selected. Landing on /products and still seeing the category hub is
    // a real bug this pins: the query-only navigation the pills use rewrites the
    // address bar in place, so this is exactly the read that follows it.
    const routeRenderedForShelf = {
      hydrated: true,
      browserHasQuery: false,
      browserPath: '/products',
      fromSearchParams: null,
      initialCategoryKey: SHELF,
    } as const;

    expect(resolveCategoryFilterKey(routeRenderedForShelf)).toBeNull();

    // …and the opposite move, All → category, is the query-bearing branch and is
    // unaffected by the rule above.
    expect(
      resolveCategoryFilterKey({
        hydrated: true,
        browserHasQuery: true,
        browserPath: '/products',
        fromSearchParams: SHELF,
        initialCategoryKey: null,
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

  it('keeps a well-formed route key and leaves existence to the catalogue', () => {
    // The pills are built from the catalogue now, so a route key is no longer
    // checked against a fixed shelf list here: any well-formed slug passes through.
    // Whether anything is behind it is `resolveAvailableCategoryKey`'s question,
    // asked against the products the page is showing.
    expect(
      resolveCategoryFilterKey({
        hydrated: false,
        browserHasQuery: false,
        fromSearchParams: null,
        initialCategoryKey: RETIRED,
      })
    ).toBe(RETIRED);

    const catalogue = [
      { name: 'Himalayan Edible Pink Salt – 16 oz Jar', category: 'Edible Pink Salt' },
    ];
    expect(resolveAvailableCategoryKey(RETIRED, catalogue)).toBeNull();
    expect(resolveAvailableCategoryKey('edible-pink-salt', catalogue)).toBe('edible-pink-salt');
  });
});
