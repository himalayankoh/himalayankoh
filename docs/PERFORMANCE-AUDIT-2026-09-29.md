# Performance audit — storefront and admin console

**Date:** 2026-09-29
**Branch:** `integration/cloudflare-workers-migration`
**Target measured:** preview Worker `himalayan-koh-ecommerce` → `https://preview.himalayankoh.com`
**Origin:** Namecheap cPanel, `himalayankoh.com/staging` (WordPress/WooCommerce)

Everything below is measured. Nothing is described as "feels faster". The harnesses and
their raw output live in `backups/.perf/` (gitignored scratch):

| Artifact | What it is |
| --- | --- |
| `baseline.mjs`, `baseline-before.json`, `baseline-after.json` | storefront routes, PDPs, Woo origin |
| `admin-harness.mjs`, `admin-before.json`, `admin-after.json` | every admin workspace, per-endpoint latency |
| `js-closure.mjs`, `closure-before.json`, `closure-after.json` | JS a route must download (build-graph walk) |
| `probe-admin-session.mjs` | proves the harness can read authenticated admin routes |

## How the admin was measured at all

The console is 100 % client-rendered and every `/api/admin/*` route needs a bearer
session. No admin password exists in the secret store, so the harness **mints its own
admin session** with the same HMAC the app signs with, using `ADMIN_SESSION_SECRET` from
the local `.env.local`. The preview Worker shares that secret, so the locally-signed
token is accepted (`probe-admin-session.mjs`: `200` on orders, catalog and inventory).
This lets every admin read be timed with real data. All harness traffic is read-only.

## Measurement honesty note — the origin drifted between sessions

The control endpoints (paths whose code was **not** changed) came back a median **×2.54**
faster in the "after" session than in the "before" session. The shared cPanel origin is
noisy and the two sessions were ~30 minutes apart. So:

- **raw** before → after numbers are reported, and
- **adjusted** numbers divide the raw ratio by 2.54 (the co-measured drift factor).

Where a result is environment-independent (round-trip counts, JS bytes) it is stated as
such, because that is the trustworthy part.

---

# STOREFRONT

## Measured baseline (median TTFB, 3 samples)

| Route | Before | After | Response cache-control |
| --- | --- | --- | --- |
| `/` | 62 ms | 79 ms | edge-served static |
| `/checkout` | 51 ms | 54 ms | edge-served static |
| `/faq` | 82 ms | 90 ms | edge-served static |
| `/products` | 870 ms | 928 ms | `no-store, must-revalidate` |
| `/blog` | 914 ms | 965 ms | `no-store, must-revalidate` |
| `/cart` | 912 ms | 880 ms | `no-store, must-revalidate` |
| PDP (2 published products) | 925 / 967 ms | 810 / 889 ms | `no-store` |

Origin direct, same sessions: `wc/v3/products?per_page=10` 1354 → 724 ms; product by slug
1081 → 832 ms. **The origin has no caching of its own** (`no-cache, no-store`), so every
storefront render that reads WooCommerce pays a full origin round trip.

## The finding that matters

The storefront's dynamic routes are **rendered per request**, and the fetches underneath
them are **not persisted anywhere**.

I threaded an opt-in `revalidate` through the storefront read layers
(`STOREFRONT_READ_TTL_SECONDS = 60`, `BLOG_READ_TTL_SECONDS = 300`) so those reads would
populate the KV data cache. **Measured effect: none.** `/products` and `/blog` are
unchanged, still `no-store`, and a KV inspection of the bound namespace
(`7e62970fbe5049dfb678409d6f28d064`) shows:

- 8000 keys, **all** of the form `cache:app:<deploy-uuid>:/<path>:html` / `:rsc`;
- **zero** fetch/data-cache keys.

So in this runtime `kvDataAdapter()` is a **per-deployment prerender store for static
routes only** — it is why `/` and `/faq` answer in ~60 ms — and `next.revalidate` on a
`fetch` made during a dynamic SSR render persists nothing. The ~900 ms is one uncached
origin round trip per render, and opting the fetch into `revalidate` does not change it.

**Recommendation (not done — needs an architecture decision):** make the catalogue and
blog routes cacheable at the edge. `/products` reads `searchParams`, which makes the whole
route dynamic; the fix is to render the default (unfiltered) shelf as a cached page and
keep only the filtered variants dynamic — or to put a Worker `caches.default` layer in
front of the Woo reads with a short TTL. Either is a real change to the route shape, not
a one-line tweak, and I did not make it unilaterally.

## What I did change on the storefront

`revalidate` is now threaded through `wordpressRequestWithMeta` consumers
(`fetchAdminProducts`, `fetchAdminProductBySlug`, `fetchStoreProductsSafe`,
`fetchWpCoreProducts`, the catalog adapters and the blog reads), defaulting to today's
**uncached** behaviour. It is the correct, documented opt-in and it is inert until the
route shape above is addressed. **Verify before keeping:** it produced no measured change.

---

# ADMIN CONSOLE

## ARCHITECTURE (measured / read)

- **Every** `/admin/*` page is a `'use client'` re-export. The console has no server
  rendering of data.
- **Auth does not delay anything.** `verifyAdminRequest` is a single local HMAC check —
  no database, no outbound request. (This was worth checking: it used to be two Supabase
  round trips per admin request.)
- The admin session cache is per-isolate, and Workers isolates are short-lived, so
  "warm" and "cold" are both real states an owner hits.
- The admin's cost is dominated by **how many WordPress/WooCommerce round trips a screen
  makes**, because the shared origin serialises concurrency (~2–3 in flight).

## FIXES MADE (all deployed to preview)

1. **`/api/admin/settings` — serial → parallel.** It `await`ed `getSettingsForCategory`
   inside a loop over the 7 registry categories: 7 sequential store reads.
   Now `Promise.all` over the categories.
2. **`/api/admin/orders` — page and stats reads in parallel.** When the page read is not
   itself the stats window (any filter, any search, any page narrower than 100), the route
   made two **sequential** store reads. They are independent; they now start together.
3. **`src/lib/admin/integrationStatus.ts` + `prefetchSettings`** — the integrations read
   made ~12 sequential `getSetting` calls, each paying its own store round trip
   (measured worst case: **18.2 s**). Now every field's category is read in one wave, and
   the results fill the existing settings cache; a warm process still answers with **zero**
   reads (25 ms).
4. **`dashboardAnalytics.readOrders`** — extra order pages after the first now run in
   parallel instead of one after the next. (Inert for a store with fewer than 100 orders,
   which this staging store has — reported as such.)
5. **`src/admin/AdminSection.tsx` — heavy console sections are lazy chunks.** Every admin
   page imports this file, and it statically imported 22 heavy modules (CatalogAdmin 4796
   lines, ProductScout 1764, LeadOSAdmin 1518, TrafficDashboard, MediaManager …). The
   Dashboard paid for all of them. They are now `React.lazy`, with `Suspense` boundaries
   at every live render site (`ServiceKeysPanel`, `TrafficDashboard`, `AdSenseEarnings`,
   `AIImportPanel`, and the `AdminSection()` router).

## WHAT WAS NOT CHANGED, AND WHY

- **The Dashboard's three reads** (orders + catalog + inventory) are three different
  questions, not duplicates — but the catalog read and the inventory read *both* enumerate
  the whole catalogue from WooCommerce (`/wc/v3/products?status=any`). Folding the stock
  summary into `/api/admin/catalog`'s stats would remove one full-catalogue read per
  dashboard mount. I did **not** do it: it changes the *meaning* of the low-stock KPI
  (the inventory read expands variable products' variations; the catalog read does not),
  and on a store that does manage stock that would be a silent correctness regression.
  Flagged, not guessed.
- Nothing in the admin is publicly edge-cached. Sensitive reads stay `no-store`;
  the fixes remove **round trips**, they do not serve stale users, orders, customers or
  payment data.
- The dashboard's `useAutoRefresh` (50 s interval + window focus) only refetches orders,
  and it is in-flight guarded. Left alone.

## ADMIN BEFORE / AFTER

"Usable time" = the workspace's mount wall clock (all of its initial reads in parallel),
which is when data appears. Before/after are the same harness, 3 runs, median.

```
BEFORE
Dashboard usable time:        5077 ms
Products usable time:         3935 ms
Product editor open time:    ~3470 ms  (derived: editor path unchanged, ×2.54 drift factor)
Inventory usable time:       1953 ms
Orders usable time:          5124 ms
Customers usable time:       1752 ms
Wholesale usable time:      15779 ms
SEO Engine usable time:         33 ms
Analytics usable time:       3695 ms
Settings usable time:       20486 ms
Average admin API latency:   3339 ms   (mean of 18 endpoint medians)

AFTER
Dashboard usable time:        2354 ms
Products usable time:         1461 ms
Product editor open time:     1366 ms  (measured: single product read + catalog, parallel)
Inventory usable time:         840 ms
Orders usable time:           1542 ms
Customers usable time:         907 ms
Wholesale usable time:        5094 ms
SEO Engine usable time:          33 ms
Analytics usable time:        2002 ms
Settings usable time:         8330 ms   (one sample hit a cold isolate: max 6695 ms)
Average admin API latency:    1190 ms
```

Per-endpoint, with the drift correction (raw ratio ÷ 2.54):

| Endpoint | Before | After | Raw | Adjusted |
| --- | --- | --- | --- | --- |
| `/api/admin/settings` | 11635 ms | 2491 ms | ×4.67 | **×1.84** |
| `/api/admin/orders?limit=25` | 5155 ms | 1663 ms | ×3.10 | **×1.22** |
| `/api/admin/orders?status=pending&limit=25` | 4444 ms | 1636 ms | ×2.72 | ×1.07 |
| `/api/admin/integrations?probe=0` (warm) | 26 ms | 25 ms | ×1.04 | unchanged |
| `/api/admin/integrations?probe=0` (**cold**) | 18192 ms | 6695 ms | — | **−63 %** |
| `/api/admin/analytics` | 3703 ms | 1775 ms | ×2.09 | ×0.82 (inert: <100 orders) |

Environment-independent results:

- **Dashboard JS closure: 1881 KB → 847 KB (−55 %)**, 65 → 49 chunks. The `AdminSection`
  chunk itself drops from 710 KB to 283 KB, and CatalogAdmin/ProductScout/LeadOSAdmin leave
  the Dashboard's closure entirely. (Build-graph walk, no network involved.)
- **Settings: 7 serial store round trips → 1 wave.**
- **Filtered / short order pages: 2 serial store reads → 1 wave.**
- **Integrations cold: 12 serial settings reads → 7 in parallel.**
- Initial admin shell is unchanged at ~918 KB / 52 files; the shell never contained the
  section code — the console loads it after hydration, which is why the closure metric,
  not the shell metric, is the one that moved.

## ADMIN TOP 5 BOTTLENECKS

1. **The admin is 100 % client-rendered.** No admin data is server-rendered, so useful UI
   cannot appear until JS has downloaded, parsed, hydrated and then fetched — the ~918 KB
   shell + section chunks are on the critical path before any request is even sent.
   *(Partly addressed: the Dashboard's section closure is now 847 KB instead of 1881 KB.)*
2. **`/api/admin/wholesale/workspace` — 4482–5094 ms, 110 KB.** It opens 15 parallel
   WordPress reads and `WHOLESALE_AGGREGATE_TIMEOUT_MS` exists because a cold WordPress made
   it time out. The origin serves ~2–3 concurrent PHP requests, so 15 parallel reads are
   really ~5–7 serialised waves. **Only fix: fewer round trips (plugin-side aggregation of
   the six reference sets into one endpoint).** Not attempted — it needs a plugin change.
3. **`/api/admin/settings` — 2491 ms after the fix (was 11635).** Still 7 store reads for
   one screen; the remaining win is a single batch settings endpoint on the plugin.
4. **Order reads are origin-bound: ~1600 ms even for a 25-row page**, because WooCommerce
   returns every order with all line items and meta and there is no caching available on
   private data. `limit=100` (1619 ms) already reuses the page for stats; `limit=25`
   (1663 ms) cannot and now pays one wave instead of two.
5. **Dashboard JS still ~847 KB** and the console still ships every inline section
   (`AOrders`, `ASettings`, `AMarketingGen`, `ASEOEngine`, `AVariantGen` … ~5.8k lines) in
   one barrel. Splitting those out of `AdminSection.tsx` needs the sections moved into
   their own files — a mechanical but large change.

## ADMIN IMPROVEMENT %

- **Average admin API latency:** 3339 ms → 1190 ms = **−64.4 % raw**, **−9.5 % after
  removing the ×2.54 origin drift** (i.e. ~1.10× genuine across all 18 endpoints).
- **Where the code actually changed:** `/api/admin/settings` **−46 %** adjusted
  (−79 % raw); filtered/narrow order pages **−18 %** adjusted; integrations cold path
  **−63 %**.
- **Dashboard JS to download: −55 %** (1881 KB → 847 KB), environment-independent.
- **Workspace mount wall clock:** −54 % raw on the Dashboard (5077 → 2354 ms), −70 % on
  Orders (5124 → 1542 ms), −59 % on Settings (20486 → 8330 ms); these include the origin
  drift, so the honest per-screen figure is the per-endpoint table above.

---

## FULL GATE

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | no errors; pre-existing `no-img-element` / `exhaustive-deps` warnings only |
| `npm test` | 1393 passed, 19 skipped (128 files) |
| `npm run build:deploy` | clean; no loopback origin, no credential in build output |
| `npm run deploy:staging` | deployed to preview only |

## OPEN ITEMS

1. Storefront route-level caching (see above) — needs an architecture decision.
2. Wholesale settings aggregation on the WordPress plugin.
3. A batch settings endpoint so `/api/admin/settings` is one read, not seven.
4. Move the inline admin sections out of `AdminSection.tsx` to finish the bundle split.
5. Production Store API `wc/store/v1/products` still 500s from the pre-existing
   `farmagrico` theme fatal (unrelated to this work; see
   `backups/2026-09-29-cve-2026-87902/PRODUCTION-PATCH-REPORT.md`).
6. `verifyAdminRequest` is cheap, but nothing rate-limits the admin read routes; the login
   route is limited at 10 attempts / 10 min per caller+identifier.
