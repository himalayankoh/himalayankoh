# Catalogue migration manifest (dry run)

Generated 2026-10-08T20:55:34.471Z by `scripts/plan-catalogue-migration.mjs`.

**Read-only dry run. Nothing was created, updated, published or deleted, and this
tool has no write mode.** It reads four catalogues with GET requests, classifies what
it finds, and stops. Any future write needs a separate, explicit owner approval —
see `docs/production/FINAL-GPT6-HANDOFF.md` for the current gate.

Machine-readable form: `docs/production/CATALOGUE-MIGRATION-MANIFEST.json`

## What this run could establish

| | Value |
| --- | --- |
| Keyed matching on SKU possible? | **no** |
| Live apex SKU readable? | no |
| Curated catalogue SKU readable? | yes |
| Exact SKU matches | 0 |
| Possible matches needing owner approval | 6 |
| Missing production products (live, absent from the curated catalogue) | 3 |
| Products requiring creation (curated, absent from live) | 1 |
| Duplicate SKUs | 0 |
| Conflicting products | 0 |
| Price differences | 0 |
| Stock differences | 0 |
| Image differences | 9 |
| Category differences | 6 |
| Comparisons not possible (unreadable field) | 12 |

### Why keyed matching is blocked

- https://himalayankoh.com does not accept the configured WooCommerce key pair (HTTP 401), so the live catalogue exposes no SKU. Until it does, the live↔curated mapping cannot be decided on SKUs and every pair below is a suggestion for a human.

## Sources, and what each could answer

| Source | URL | Auth | HTTP | Rows | Readable fields |
| --- | --- | --- | --- | --- | --- |
| live apex WordPress catalogue (what the domain sells today) | `https://himalayankoh.com/wp-json/wp/v2/product?per_page=100` | none — public WP REST | 200 | 13 | name, categories, images, modified |
| live apex WooCommerce fields (price, SKU, stock) | `https://himalayankoh.com/wp-json/wc/v3/products?per_page=100&status=any` | configured WooCommerce pair | 401 | 0 | none |
| live apex featured image URLs | `https://himalayankoh.com/wp-json/wp/v2/media?include=2462,2447,1716,2331,2105,2304,2194,2186,1756,2043,1712,1802&per_page=100` | none — public | 200 | 13 | images |
| staging WooCommerce catalogue (the curated source of truth) | `https://himalayankoh.com/staging/wp-json/wc/v3/products?per_page=100&status=any` | configured pair | 200 | 7 | name, sku, price, stock, categories, images, modified |
| staging storefront catalogue (what a shopper is served today) | `https://preview.himalayankoh.com/api/catalog` | none | 200 | 6 | name, sku, price, stock, categories, images, modified |
| pre-cutover production Worker | `https://himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev/api/catalog` | none for the gate check, preview token for the read | 401 (authed 200) | 0 | none |

## Coverage

| | Total | Published | Draft | Without a SKU |
| --- | --- | --- | --- | --- |
| Live apex | 13 | 13 | 0 | 13 |
| Curated (staging) | 7 | 6 | 1 | 1 |
| Served (storefront) | 6 | 6 | — | 0 |

## 1. Exact matches (same SKU on both sides)

_None possible: the live apex does not expose SKUs, so no pair could be decided automatically. See the blocker above._

## 2. Possible matches requiring owner approval

Each of these is a **suggestion by name overlap**, never a decision. Reject any pair
whose shared words are incidental.

- **Himalayan Salt Rock for Cattle 18 Lbs Bag - Himalayan Koh** (`no SKU` · id 2728 · draft · 49.95 · Bulk and Rock Salt)
  - live id 291 — “Himalayan Salt Rock for Cattle 18 Lbs Bag” (score 1; shares 18, bag, cattle, lbs, rock, salt; live-only words none)
  - live id 2372 — “HIMALAYAN ROCK SALT BAG 18 LBS” (score 0.833; shares 18, bag, lbs, rock, salt; live-only words none)
  - decision: **owner approval required** (name similarity only — no SKU was available on the live side)
- **Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh** (`HK-LFH-2lbs` · id 2721 · publish · 19.95 · Salt Licks)
  - live id 281 — “Himalayan Pink Salt Licks for Horses” (score 0.8; shares horses, licks, pink, salt; live-only words none)
  - live id 2352 — “SALT LICKS” (score 0.4; shares licks, salt; live-only words none)
  - live id 271 — “Bag of Himalayan Pink Salt for Livestock (45 lbs.)” (score 0.375; shares lbs, pink, salt; live-only words 45, bag, livestock)
  - decision: **owner approval required** (name similarity only — no SKU was available on the live side)
- **Bag of Himalayan Pink Salt for Livestock (45 lbs.) - Himalayan Koh** (`HK-LFC-45lbs` · id 2716 · publish · 49.95 · Live Stock)
  - live id 271 — “Bag of Himalayan Pink Salt for Livestock (45 lbs.)” (score 1; shares 45, bag, lbs, livestock, pink, salt; live-only words none)
  - live id 2372 — “HIMALAYAN ROCK SALT BAG 18 LBS” (score 0.375; shares bag, lbs, salt; live-only words 18, rock)
  - decision: **owner approval required** (name similarity only — no SKU was available on the live side)
- **Himalayan Pink Salt for Livestock - 6 lbs Fine or Coarse Grain Pouches** (`HK-ESF-6lbs` · id 2710 · publish · 19.95 · Live Stock)
  - live id 2321 — “Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes – 6 lbs” (score 0.6; shares coarse, fine, grain, lbs, pouches, salt; live-only words rock, sizes)
  - live id 2185 — “Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs” (score 0.5; shares fine, grain, lbs, pink, salt; live-only words chef, jar)
  - live id 2192 — “Himalayan Chef Himalayan Pink Salt Coarse Grain, Jar-1 lbs” (score 0.5; shares coarse, grain, lbs, pink, salt; live-only words chef, jar)
  - decision: **owner approval required** (name similarity only — no SKU was available on the live side)
- **Himalayan Koh Pure Natural Himalayan Pink Salt for Livestock – Fine Grain (0.5–1mm), Unprocessed &amp; Halal** (`HK-ESF-3lbs` · id 2704 · publish · 19.95 · Live Stock)
  - live id 2461 — “Himalayan Koh  Authentic Pure Natural Halal Unprocessed Himalayan Edible Pink Cooking Salt, Fine Grain (0.5mm to 1mm)” (score 0.636; shares 1mm, fine, grain, halal, pink, salt, unprocessed; live-only words 5mm, cooking, edible)
  - live id 2185 — “Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs” (score 0.364; shares fine, grain, pink, salt; live-only words chef, jar, lbs)
  - decision: **owner approval required** (name similarity only — no SKU was available on the live side)
- **Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain** (`HK-ESF-16oz` · id 2653 · publish · 9.95 · Edible Pink Salt)
  - live id 2446 — “Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain” (score 1; shares 16, edible, fine, grain, jar, oz, pink, salt; live-only words none)
  - live id 2185 — “Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs” (score 0.5; shares fine, grain, jar, pink, salt; live-only words chef, lbs)
  - live id 2461 — “Himalayan Koh  Authentic Pure Natural Halal Unprocessed Himalayan Edible Pink Cooking Salt, Fine Grain (0.5mm to 1mm)” (score 0.385; shares edible, fine, grain, pink, salt; live-only words 1mm, 5mm, cooking, halal, unprocessed)
  - decision: **owner approval required** (name similarity only — no SKU was available on the live side)

## 3. Missing production products (published live, nothing curated corresponds)

These are live today, are in the live sitemap, and would disappear if the catalogue
were replaced. **The default is that they stay published** until the owner says
otherwise; retiring one is a decision with SEO consequences, not cleanup.

- live id 2367 — “HIMALAYAN SALT POUCHES” (Bulk Order, modified 2024-03-29) — https://himalayankoh.com/product/himalayan-salt-pouches/
- live id 2295 — “HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER WITH DIMMABLE CONTROL” (Uncategorized, modified 2023-07-24) — https://himalayankoh.com/product/himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control/
- live id 286 — “Himalayan Pink Salt Block for Deer” (animal feed, modified 2022-08-28) — https://himalayankoh.com/product/block-of-salt/

## 4. Products requiring creation (curated, no live counterpart at all)

- **Himalayan Koh 30 lb Red Rock Salt Lick for Cattle** (`HK-LB-30LBS` · id 2752 · publish · 49.95 · Salt Blocks) — no live product shares any significant word with this name

## 5. Duplicate SKUs

_None found._

## 6. Conflicting products

_None found._

## 7. Field differences

### price

_None found._

### stock

_None found._

### images

| pair | left | right | value |
| --- | --- | --- | --- |
| live↔curated | 291 “Himalayan Salt Rock for Cattle 18 Lbs Ba” | 2728 “Himalayan Salt Rock for Cattle 18 Lbs Ba” | 1 image(s), first https://himalayankoh.com/wp-content/uploads/2016/06/WhatsApp-Image-2021-07-28-at-4.39.51-AM.jpeg → 7 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/WhatsApp-Image-2021-07-28-at-4.39.51-AM.jpeg — same asset host, so the differing first image is a real difference |
| live↔curated | 281 “Himalayan Pink Salt Licks for Horses” | 2721 “Himalayan Pink Salt Licks for Horses 2 l” | 1 image(s), first https://himalayankoh.com/wp-content/uploads/2021/03/horse-lick-himalayan-salt5.jpg → 6 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/horse-lick-himalayan-salt5.jpg — same asset host, so the differing first image is a real difference |
| live↔curated | 271 “Bag of Himalayan Pink Salt for Livestock” | 2716 “Bag of Himalayan Pink Salt for Livestock” | 1 image(s), first https://himalayankoh.com/wp-content/uploads/2020/10/1.jpeg → 2 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/10/5475e8cf-56b9-42bc-8882-7a990460b044.jpg — same asset host, so the differing first image is a real difference |
| live↔curated | 2321 “Himalayan Rock Salt Pouches in Fine and ” | 2710 “Himalayan Pink Salt for Livestock - 6 lb” | 1 image(s), first https://himalayankoh.com/wp-content/uploads/2023/08/S6.jpg → 4 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/S4.jpeg — same asset host, so the differing first image is a real difference |
| live↔curated | 2461 “Himalayan Koh  Authentic Pure Natural Ha” | 2704 “Himalayan Koh Pure Natural Himalayan Pin” | 1 image(s), first https://himalayankoh.com/wp-content/uploads/2025/07/6-lbs-pouche.webp → 4 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/6-lbs-pouche-2.webp — same asset host, so the differing first image is a real difference |
| live↔curated | 2446 “Himalayan Edible Pink Salt – 16 oz Jar |” | 2653 “Himalayan Edible Pink Salt – 16 oz Jar |” | 1 image(s), first https://himalayankoh.com/wp-content/uploads/2024/08/WhatsApp-Image-2024-08-02-at-11.31.07-PM.jpeg → 3 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/7017f765-35de-4aee-b150-2022e5ef8a04-1.jpeg — same asset host, so the differing first image is a real difference |
| curated↔served | 2752 “Himalayan Koh 30 lb Red Rock Salt Lick f” | 2752 “Himalayan Koh 30 lb Red Rock Salt Lick f” | 2 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/10/5d377168-56a1-4c09-bc7a-412e46c7ba9e.webp → 6 image(s), first /images/products/himalayan-salt-block-30lbs-hero.webp — the two catalogues serve assets from different hosts, so the URLs are not comparable — only presence and count are |
| curated↔served | 2721 “Himalayan Pink Salt Licks for Horses 2 l” | 2721 “Himalayan Pink Salt Licks for Horses 2 l” | 6 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/horse-lick-himalayan-salt5.jpg → 11 image(s), first /images/products/himalayan-salt-lick-rope-hero.webp — the two catalogues serve assets from different hosts, so the URLs are not comparable — only presence and count are |
| curated↔served | 2710 “Himalayan Pink Salt for Livestock - 6 lb” | 2710 “Himalayan Pink Salt for Livestock - 6 lb” | 4 image(s), first https://himalayankoh.com/staging/wp-content/uploads/2026/09/S4.jpeg → 8 image(s), first /images/products/himalayan-rock-salt-pouch-6lbs-hero.webp — the two catalogues serve assets from different hosts, so the URLs are not comparable — only presence and count are |

### categories

| pair | left | right | value |
| --- | --- | --- | --- |
| live↔curated | 291 “Himalayan Salt Rock for Cattle 18 Lbs Ba” | 2728 “Himalayan Salt Rock for Cattle 18 Lbs Ba” | animal feed → bulk and rock salt — only on live: animal feed; only on curated: bulk and rock salt |
| live↔curated | 281 “Himalayan Pink Salt Licks for Horses” | 2721 “Himalayan Pink Salt Licks for Horses 2 l” | animal feed → salt licks — only on live: animal feed; only on curated: salt licks |
| live↔curated | 271 “Bag of Himalayan Pink Salt for Livestock” | 2716 “Bag of Himalayan Pink Salt for Livestock” | animal feed → live stock — only on live: animal feed; only on curated: live stock |
| live↔curated | 2321 “Himalayan Rock Salt Pouches in Fine and ” | 2710 “Himalayan Pink Salt for Livestock - 6 lb” | uncategorized → live stock — only on live: uncategorized; only on curated: live stock |
| live↔curated | 2461 “Himalayan Koh  Authentic Pure Natural Ha” | 2704 “Himalayan Koh Pure Natural Himalayan Pin” | uncategorized → live stock — only on live: uncategorized; only on curated: live stock |
| live↔curated | 2446 “Himalayan Edible Pink Salt – 16 oz Jar |” | 2653 “Himalayan Edible Pink Salt – 16 oz Jar |” | uncategorized → edible pink salt — only on live: uncategorized; only on curated: edible pink salt |

## 8. Comparisons that could not be made

A field one side cannot answer for is **not** evidence that the two sides agree.

- 6 pair(s): price — live cannot report price
- 6 pair(s): stock — live cannot report stock

## 9. Category term ids that collide across the two installations

- id `75`: live “Uncategorized” vs curated “Live Stock” — **DIFFERENT meaning — never copy this id**
- id `105`: live “Bulk Order” vs curated “Bulk Order” — **same meaning**

## 10. What the storefront serves that staging does not hold (and vice versa)

- Served but not in the curated catalogue: **0**
- Published in the curated catalogue but not served: **0**

## Review checklist

- [ ] Confirm the backup and its verified restore first — docs/production/BACKUP-RESTORE-VERIFICATION.md, checked with `npm run check:backup`. Nothing below may begin before that is PASS.
- [ ] Prove that wp.himalayankoh.com reaches the WordPress installation while its Site URL and Home URL stay on the apex (docs/production/WORDPRESS-HOSTING-PREP.md), because this manifest reads the live catalogue over the same installation.
- [ ] Create a WooCommerce REST key pair on the live apex installation (read-only is enough), then re-run this manifest: the SKU, price and stock columns stop being "not readable" and the exact matches become decidable.
- [ ] Assign a SKU to every live product that lacks one, and to any curated product that lacks one, before any import is designed.
- [ ] Decide each suggested pair: is the curated product a replacement for the live product, or an addition?
- [ ] Map categories by name and never by term id (see categoryIdCollisions).
- [ ] Decide, product by product, what happens to each live product with no counterpart — keep published, retire with a redirect, or leave alone.

## What this manifest cannot establish

- **Whether a suggested pair is the same product.** With no live SKU, name overlap is the only shared signal.
- **Live price, SKU and stock** while the apex rejects the configured key pair.
- **Variations and their children.** A variable product's variations are separate records with their own SKUs, prices and stock; neither source expands them here.
- **Anything unpublished** beyond what each endpoint returns: trashed, private and pending products are invisible to both paths.
- **Orders and customers.** This compares catalogue definitions only, and says nothing about the orders already placed against the live products, which must be preserved.

