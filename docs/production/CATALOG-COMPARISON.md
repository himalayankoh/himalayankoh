# Catalogue comparison — live WordPress vs the storefront’s catalogue

Generated 2026-10-08T20:35:54.939Z by `scripts/compare-catalogues.mjs` (read-only; every request is a GET).

**This is a comparison, not a migration.** Nothing was copied, created, updated or
deleted, and nothing in it may be acted on automatically. It exists to make the
cutover decision about the catalogue an informed one, and to be re-runnable after the
live credentials are in place.

## Sources, and how each was read

| Source | Endpoint | Auth | Result |
| --- | --- | --- | --- |
| Live catalogue (ids, titles, slugs, status, categories, media) | `GET https://himalayankoh.com/wp-json/wp/v2/product?per_page=100` | **none — public** | HTTP 200, 13 products |
| Live catalogue (featured image URLs) | `GET https://himalayankoh.com/wp-json/wp/v2/media?include=…` | **none — public** | HTTP 200, 12 of 12 media record(s) resolved |
| Live catalogue (price, SKU, stock) | `GET https://himalayankoh.com/wp-json/wc/v3/products` | configured WooCommerce pair | **HTTP 401 — the apex does not accept the configured pair, so price, SKU and stock are NOT readable and are shown as unknown below** |
| Staging catalogue (full field set) | `GET https://himalayankoh.com/staging/wp-json/wc/v3/products?status=any` | configured pair | HTTP 200, 7 products |
| Storefront (what a shopper is served today) | `GET https://preview.himalayankoh.com/api/catalog` | none | HTTP 200, 6 products, degraded: false |
| Pre-cutover production Worker | `GET https://himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev/api/catalog` | none | HTTP 401, 0 products, degraded: undefined |

The live catalogue is read through WP REST because the `product` post type is
registered `show_in_rest` on that installation. **Everything in that column is
readable by any visitor to the live site** — it is not privileged information. The rich
fields (price, SKU, stock) come only from WooCommerce REST, which needs a key pair the
apex does not yet accept, so they are reported as unknown rather than inferred from the
public pages.

## Totals

| | Live apex | Staging | Preview storefront | Production Worker |
| --- | --- | --- | --- | --- |
| Products returned | 13 | 7 | 6 | 0 |
| Published | 13 | 6 | — | — |
| Draft | 0 | 1 | — | — |
| Categories | 3 | 7 | — | — |
| Products with an image | 13 of 13 | 7 of 7 | — | — |

## Live apex — the 13 products as published today

| id | title | status | categories | image | SKU / price / stock | modified |
| --- | --- | --- | --- | --- | --- | --- |
| 271 | Bag of Himalayan Pink Salt for Livestock (45 lbs.) | publish | animal feed | yes (media 1756) | _not readable (no live key)_ | 2026-04-13 |
| 281 | Himalayan Pink Salt Licks for Horses | publish | animal feed | yes (media 1712) | _not readable (no live key)_ | 2026-04-13 |
| 286 | Himalayan Pink Salt Block for Deer | publish | animal feed | yes (media 2043) | _not readable (no live key)_ | 2022-08-28 |
| 291 | Himalayan Salt Rock for Cattle 18 Lbs Bag | publish | animal feed | yes (media 1802) | _not readable (no live key)_ | 2024-05-16 |
| 2185 | Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs | publish | Uncategorized | yes (media 2186) | _not readable (no live key)_ | 2023-04-28 |
| 2192 | Himalayan Chef Himalayan Pink Salt Coarse Grain, Jar-1 lbs | publish | Uncategorized | yes (media 2194) | _not readable (no live key)_ | 2023-04-28 |
| 2295 | HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER WITH DIMMABLE CONTRO | publish | Uncategorized | yes (media 2304) | _not readable (no live key)_ | 2023-07-24 |
| 2321 | Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes – 6 lbs | publish | Uncategorized | yes (media 2331) | _not readable (no live key)_ | 2023-09-02 |
| 2352 | SALT LICKS | publish | Bulk Order | yes (media 2105) | _not readable (no live key)_ | 2024-03-29 |
| 2367 | HIMALAYAN SALT POUCHES | publish | Bulk Order | yes (media 2331) | _not readable (no live key)_ | 2024-03-29 |
| 2372 | HIMALAYAN ROCK SALT BAG 18 LBS | publish | Bulk Order | yes (media 1716) | _not readable (no live key)_ | 2024-05-16 |
| 2446 | Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain | publish | Uncategorized | yes (media 2447) | _not readable (no live key)_ | 2024-08-14 |
| 2461 | Himalayan Koh  Authentic Pure Natural Halal Unprocessed Himalayan Edible P | publish | Uncategorized | yes (media 2462) | _not readable (no live key)_ | 2025-07-04 |

### The live apex’s featured images, as URLs

The product record only carries an attachment id; these are the URLs the media endpoint
resolved for those ids, and they are what the storefront’s `/wp-content/*` passthrough
would have to serve after the cutover.

- **271** Bag of Himalayan Pink Salt for Livestock (45 l — `https://himalayankoh.com/wp-content/uploads/2020/10/1.jpeg` _(image/jpeg)_
- **281** Himalayan Pink Salt Licks for Horses — `https://himalayankoh.com/wp-content/uploads/2021/03/horse-lick-himalayan-salt5.jpg` _(image/jpeg)_
- **286** Himalayan Pink Salt Block for Deer — `https://himalayankoh.com/wp-content/uploads/2017/10/WhatsApp-Image-2022-02-05-at-2.48.02-PM.jpeg` _(image/jpeg)_
- **291** Himalayan Salt Rock for Cattle 18 Lbs Bag — `https://himalayankoh.com/wp-content/uploads/2016/06/WhatsApp-Image-2021-07-28-at-4.39.51-AM.jpeg` _(image/jpeg)_
- **2185** Himalayan Chef Himalayan Pink Salt Fine Grain, — `https://himalayankoh.com/wp-content/uploads/2023/04/Himalayan-Chef-Himalayan-Pink-Salt-Fine-Grain.jpg` _(image/jpeg)_
- **2192** Himalayan Chef Himalayan Pink Salt Coarse Grai — `https://himalayankoh.com/wp-content/uploads/2023/04/Himalayan-Chef-Himalayan-Pink-Salt-Coarse-Grain-Jar-1-lbs.jpg` _(image/jpeg)_
- **2295** HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR P — `https://himalayankoh.com/wp-content/uploads/2023/07/Tear-Drop.jpg` _(image/jpeg)_
- **2321** Himalayan Rock Salt Pouches in Fine and Coarse — `https://himalayankoh.com/wp-content/uploads/2023/08/S6.jpg` _(image/jpeg)_
- **2352** SALT LICKS — `https://himalayankoh.com/wp-content/uploads/2022/04/lick-4.jpg` _(image/jpeg)_
- **2367** HIMALAYAN SALT POUCHES — `https://himalayankoh.com/wp-content/uploads/2023/08/S6.jpg` _(image/jpeg)_
- **2372** HIMALAYAN ROCK SALT BAG 18 LBS — `https://himalayankoh.com/wp-content/uploads/2021/03/himalayan-salt-lump-cattle4.jpg` _(image/jpeg)_
- **2446** Himalayan Edible Pink Salt – 16 oz Jar | Fine  — `https://himalayankoh.com/wp-content/uploads/2024/08/WhatsApp-Image-2024-08-02-at-11.31.07-PM.jpeg` _(image/jpeg)_
- **2461** Himalayan Koh  Authentic Pure Natural Halal Un — `https://himalayankoh.com/wp-content/uploads/2025/07/6-lbs-pouche.webp` _(image/webp)_

Categories on the live apex: `58` animal feed (3) · `105` Bulk Order (0) · `75` Uncategorized (3)

## Staging — the curated catalogue the storefront serves

| id | SKU | name | status | price | stock | images | categories |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2752 | HK-LB-30LBS | Himalayan Koh 30 lb Red Rock Salt Lick for Cattle | publish | 49.95 | instock (10) | 2 | Salt Blocks |
| 2728 | — | Himalayan Salt Rock for Cattle 18 Lbs Bag - Himalayan Koh | draft | 49.95 | instock (10) | 7 | Bulk and Rock Salt |
| 2721 | HK-LFH-2lbs | Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh | publish | 19.95 | instock (7) | 6 | Salt Licks |
| 2716 | HK-LFC-45lbs | Bag of Himalayan Pink Salt for Livestock (45 lbs.) - Himal | publish | 49.95 | instock (10) | 2 | Live Stock |
| 2710 | HK-ESF-6lbs | Himalayan Pink Salt for Livestock - 6 lbs Fine or Coarse G | publish | 19.95 | instock (10) | 4 | Live Stock |
| 2704 | HK-ESF-3lbs | Himalayan Koh Pure Natural Himalayan Pink Salt for Livesto | publish | 19.95 | instock (10) | 4 | Live Stock |
| 2653 | HK-ESF-16oz | Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain | publish | 9.95 | instock (4) | 3 | Edible Pink Salt |

Categories on staging: `129` Bulk and Rock Salt (0) · `105` Bulk Order (0) · `121` Edible Pink Salt (1) · `124` Granular Salt Pouches (0) · `75` Live Stock (3) · `122` Salt Blocks (1) · `123` Salt Licks (1)

## Products the storefront serves that the live apex does not hold

**5 of 6 published storefront products have no counterpart on the live
installation by id — but a likely counterpart by name.** These need a human decision: the
name match is a suggestion, not an identity, and the pairs below are the whole point of
reading the two catalogues together.

- **Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh** (`HK-LFH-2lbs`, id 2721, 19.95)
  - live id 281 — “Himalayan Pink Salt Licks for Horses” (similarity 0.80; shares: pink, salt, licks, horses)
  - live id 2352 — “SALT LICKS” (similarity 0.40; shares: salt, licks)
  - live id 271 — “Bag of Himalayan Pink Salt for Livestock (45 lbs.)” (similarity 0.38; shares: pink, salt, lbs)
- **Bag of Himalayan Pink Salt for Livestock (45 lbs.) - Himalayan Koh** (`HK-LFC-45lbs`, id 2716, 49.95)
  - live id 271 — “Bag of Himalayan Pink Salt for Livestock (45 lbs.)” (similarity 1.00; shares: bag, pink, salt, livestock, 45, lbs)
  - live id 2372 — “HIMALAYAN ROCK SALT BAG 18 LBS” (similarity 0.38; shares: bag, salt, lbs)
- **Himalayan Pink Salt for Livestock - 6 lbs Fine or Coarse Grain Pouches** (`HK-ESF-6lbs`, id 2710, 19.95)
  - live id 2321 — “Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes –” (similarity 0.60; shares: salt, lbs, fine, coarse, grain, pouches)
  - live id 2192 — “Himalayan Chef Himalayan Pink Salt Coarse Grain, Jar-1 lbs” (similarity 0.50; shares: pink, salt, lbs, coarse, grain)
  - live id 2185 — “Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs” (similarity 0.50; shares: pink, salt, lbs, fine, grain)
- **Himalayan Koh Pure Natural Himalayan Pink Salt for Livestock – Fine Grain (0.5–1mm), Unprocessed &amp; Halal** (`HK-ESF-3lbs`, id 2704, 19.95)
  - live id 2461 — “Himalayan Koh  Authentic Pure Natural Halal Unprocessed Hima” (similarity 0.64; shares: pink, salt, fine, grain, 1mm, unprocessed, halal)
  - live id 2185 — “Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs” (similarity 0.36; shares: pink, salt, fine, grain)
- **Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain** (`HK-ESF-16oz`, id 2653, 9.95)
  - live id 2446 — “Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain” (similarity 1.00; shares: edible, pink, salt, 16, oz, jar, fine, grain)
  - live id 2185 — “Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs” (similarity 0.50; shares: pink, salt, jar, fine, grain)
  - live id 2461 — “Himalayan Koh  Authentic Pure Natural Halal Unprocessed Hima” (similarity 0.38; shares: edible, pink, salt, fine, grain)

**1 has no counterpart at all** — not by id, and not by any name
overlap worth reporting:

- **Himalayan Koh 30 lb Red Rock Salt Lick for Cattle** (`HK-LB-30LBS`, id 2752, 49.95, instock)

## Live apex products with no counterpart in the curated catalogue

**3 of 13** live products match nothing in the curated
catalogue by name. Some are clearly retired lines (a salt lamp, food jars); others are the
older edition of a line that was re-created on staging. This list is the destructive
question of the cutover — every one of these is what a shopper searching the live domain
finds today, and the default assumption must be that they stay published until the owner
says otherwise.

- live id 2367 — “HIMALAYAN SALT POUCHES” (`/product/himalayan-salt-pouches/`)
- live id 2295 — “HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER WITH DIMMABLE CO” (`/product/himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control/`)
- live id 286 — “Himalayan Pink Salt Block for Deer” (`/product/block-of-salt/`)

## Reconciliation plan

Ordered so that every step is reversible and none of them is automatic. **Nothing here
creates, copies, overwrites or deletes a product**, and steps 1–3 change nothing at all.

1. **Back up the live database and files, and verify the restore.** This is the precondition
   for everything after it, and it is the one item still blocked (see
   `docs/PRODUCTION-REMEDIATION.md` §R). No product work begins before it is verified —
   the catalogue is the part of WordPress that a mistake here would damage irreversibly.
2. **Create a live WooCommerce REST key pair on the apex installation** (WooCommerce →
   Settings → Advanced → REST API), read-only for the first pass. This turns every
   `_not readable_` cell above into a fact — price, SKU and stock for all 13 — and re-running
   this script then produces the complete comparison instead of the public half of it.
3. **Re-run `npm run compare:catalogues` and decide the mapping.** The pairs above are
   suggestions; the decision that matters is whether each curated product *replaces* a live
   one or is *additional* to it. That decision is the owner’s, and it needs no system change.
4. **Reconcile the categories before the products, and do not import term ids.** Both
   installations have a category with **id `75`**, and it means different things on each:
   `Uncategorized` on the live apex, `Live Stock` on staging. `105` (`Bulk Order`) exists on
   both. Any copy that carries term ids across will therefore file curated livestock products
   under `Uncategorized` while looking like it succeeded. Map by **name**, create the missing
   terms, and verify the assignment read-back.
5. **Do not import product ids.** The two id spaces do not overlap (`271`–`2461` live,
   `2653`–`2752` staging), so an import by id cannot overwrite by accident — which is the good
   news — but it also means a re-run creates duplicates rather than updating. Key any import on
   **SKU**, assign a SKU to every live product that lacks one, and treat a missing SKU as a
   stop rather than a match.
6. **Bring the curated products across as drafts first.** Create, then inspect price, stock,
   images and categories against the staging values in the table above, and only then publish.
   A draft is invisible to shoppers and to the sitemap, so this is the step that costs nothing
   to get wrong.
7. **Leave the live products published until the owner retires them, one at a time.** The live
   catalogue is what the live domain sells today, and the products above are also indexed in
   its sitemap and linked from its pages. Removing them is a decision with SEO consequences,
   not cleanup, and the retired URLs should redirect to their replacements rather than 404.
8. **Verify after each change**, in this order: the live `/api/catalog` from the production
   Worker (products, prices, stock), one product page per shelf, the images through the
   `/wp-content/*` passthrough, then the sitemap. Re-run this script — the diff shrinking is
   the evidence that reconciliation is complete.

## What this comparison cannot establish

- **Whether a suggested pair is the same product.** Names are the only shared key available,
  and the two catalogues name the same items differently (“Bag of Himalayan Pink Salt for
  Livestock (45 lbs.)” against “Himalayan Rock Salt for Livestock (45 lb)”). The similarity
  score is a reading aid, not an identity.
- **Price, SKU and stock on the live apex.** Not readable in this run — WooCommerce REST returned HTTP 401 for the configured pair, and the public pages are not a substitute for the record.
- **Variations and their children.** A variable product’s variations are separate records with
  their own SKUs, prices and stock, and neither source here expands them.
- **Anything unpublished.** Only `publish` and (via WooCommerce REST) `draft` are visible;
  trashed, private and pending products are invisible to both paths.
- **Customer, order or inventory history.** This compares catalogue *definitions* only. It says
  nothing about orders already placed against the live products, which must be preserved.

