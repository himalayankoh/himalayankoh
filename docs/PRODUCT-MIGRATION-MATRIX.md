# Product migration matrix — production/staging WooCommerce → the new storefront

Read-only reconciliation for the frontend content + product migration phase. Sources: the
published product collection on production (`/wp-json/wp/v2/product`, 13 records) and
staging (11 records), the production product pages themselves (prices and stock, because
the Store API answers HTTP 500), and the production sitemap (14 product URLs).

**Rule applied:** the niche is Himalayan pink salt only. Animal/livestock products are
neither migrated nor exposed, and nothing was deleted, archived or edited anywhere —
production is read-only and every staging change waits for the write credential.

**Nothing here was created yet.** Creating or editing products needs the staging
WooCommerce REST v3 key (`woocommerce_rest_*`, server-side only); the migration list below
is ready to execute the moment it exists.

## 1. Approved pink-salt products (already real WooCommerce products on staging)

Every one of these already exists in staging WooCommerce with the production product ID —
so the storefront reads them from WooCommerce today and the owner can edit them in
Admin → Products without any code change.

| ID | Production title | Staging title | Slug (same in both) | Price seen on production | Stock seen on production | Category | Shelf in the new store | Action |
|---|---|---|---|---|---|---|---|---|
| 2461 | Himalayan Koh Authentic Pure Natural Halal Unprocessed Himalayan Edible Pink Cooking Salt, Fine Grain (0.5mm to 1mm) | Himalayan Koh Edible Pink Salt | `himalayan-koh-edible-salt-grain` | $9.95 (3 lbs) · $17.95 (6 lbs) — variations on `pa_block-weight` | in stock | Uncategorized | Edible Pink Salt (fine) | **Keep.** Already in staging; long keyword-stuffed title kept on production, staging's clean title is the one to sell under |
| 2446 | Himalayan Edible Pink Salt – 16 oz Jar \| Fine Grain | Himalayan Koh Edible Pink Salt Jar | `himalayan-edible-pink-salt` | $9.95 | in stock | Uncategorized | Edible Pink Salt (jar) | **Keep.** Variations on Grain Size (Fine/Coarse) |
| 2321 | Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes – 6 lbs | Himalayan Koh Pink Salt Pouches | `pouches` | $17.95 | in stock | Uncategorized | Edible Pink Salt (pouches) | **Keep.** Variations on Grain Size |
| 2372 | HIMALAYAN ROCK SALT BAG 18 LBS | (same) | `himalayan-rock-salt-bag` | none set | **out of stock** | Bulk Order | Bulk & Wholesale | **Keep, hidden from the storefront while out of stock** — WooCommerce decides visibility, not the code |
| 2367 | HIMALAYAN SALT POUCHES | (same) | `himalayan-salt-pouches` | none set | **out of stock** | Bulk Order | Bulk & Wholesale | **Keep**, same treatment |
| 2295 | HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER WITH DIMMABLE CONTROL | (same) | `himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control` | none set | **out of stock** | Uncategorized | Salt Lamps & Décor | **Keep.** Title needs the owner's decision (all-caps, "ionizer air purifier" claim) |
| 2192 | Himalayan Chef Himalayan Pink Salt Coarse Grain, Jar-1 lbs | (same) | `himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs` | none set | in stock | Uncategorized | Edible Pink Salt (coarse) | **Keep.** Third-party brand product (`Himalayan Chef`) — owner should confirm it stays in a Himalayan Koh storefront |
| 2185 | Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs | (same) | `chef-himalayan-pink-salt` | none set | in stock | Uncategorized | Edible Pink Salt (fine) | **Keep, same brand question** |
| 2352 | SALT LICKS | (same) | `salt-licks` | none set | **out of stock** | Bulk Order | — | **Owner review.** "Salt licks" is used for both edible salt candy and animal licks; no price and no description to tell which this is |

Fields as they actually are in WooCommerce (checked on production, staging agrees):

- **SKU: `N/A` on every product sampled.** No SKUs are configured, so no SKU is invented —
  the storefront shows the SKU line only when WooCommerce reports one.
- **Descriptions** exist for the edible products (the 2461 description is real, useful copy:
  hand-mined, unrefined, no anti-caking agents, 80+ trace minerals, kosher/vegan, resealable
  3/6 lb bags).
- **Images** are real WooCommerce media (`/wp-content/uploads/2025/07/*.webp`).
- **Attributes** are real product attributes (`pa_block-weight`, grain size) driving
  variations.

## 2. Animal / livestock products — not exposed

| ID | Title | Slug | In staging? | Verdict |
|---|---|---|---|---|
| 271 | Bag of Himalayan Pink Salt for Livestock (45 lbs.) | `bag-of-salt-for-livestock-45-lbs` | no | Animal — reject |
| 281 | Himalayan Pink Salt Licks for Horses (staging renamed it "Himalayan Koh Salt Licks for Horses") | `salt-licks-for-horses` | **yes** | Animal — hide from the storefront on staging when the write key exists |
| 286 | Himalayan Pink Salt Block for Deer | `block-of-salt` | **yes** | Animal — same |
| 291 | Himalayan Salt Rock for Cattle 18 Lbs Bag | `rock-of-salt` | no | Animal — reject |

The storefront's public catalogue is already scoped by the niche guard
(`src/lib/catalog/niche.ts`), so these cannot surface even before the staging products are
archived. Archiving them is a WooCommerce write and therefore queued behind the key.

## 3. Duplicates — canonical product chosen

| Pair | Canonical | Reason |
|---|---|---|
| `himalayan-koh-edible-salt-grain` (2461) vs `himalayan-edible-pink-salt` (2446) | 2461 | Bulk sizes with size variations and the fuller description; 2446 stays as the 16 oz jar (different pack size, not a true duplicate) |
| `himalayan-salt-pouches` (2367) vs `pouches` (2321) | 2321 | 2321 has a price, a real title and grain variants; 2367 is out of stock with no price. 2367 should be archived once the write key exists, after confirming it is not a different pack |
| `chef-himalayan-pink-salt` (2185) vs `himalayan-chef-…-coarse-grain-jar-1-lbs` (2192) | both | Different grain, not duplicates |

## 4. Products to create in WooCommerce

**0 to create.** Every approved pink-salt product already exists as a real staging
WooCommerce product with a real product ID, so nothing needs importing and no product is
represented as a static JSON/React object or a Supabase row.

If, after the owner's review, `salt-licks` (2352) turns out to be an animal product, the
pink-salt catalogue shrinks to 8 and the storefront simply reflects that — no code change,
because the catalogue is read from WooCommerce.

## 5. WooCommerce content edits that need the write key

These are data edits, not code, and each one is a WooCommerce write. They are listed
here so they are done in the store rather than papered over in the frontend:

| Product | Edit | Why |
|---|---|---|
| `pouches` (2321) | Rewrite the description | It is the **only** staging description still written for the livestock audience ("Elevate Livestock Well-being with Our Himalayan Pink Salt Pouches … the dietary needs of your livestock" / "your animals"). It is a genuine pink-salt product, so the copy is what needs to change, not the product |
| `himalayan-rock-salt-bag` (2372), `himalayan-salt-pouches` (2367), `salt-licks` (2352) | Set a price, or set the product to price-on-request | All three show no price in WooCommerce. The storefront says "Price unavailable" because that is what the source reports |
| `himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs` (2192), `chef-himalayan-pink-salt` (2185) | Set a price | Variable products with no price on the parent — production shows an empty price block |
| `himalayan-crystal-rock-salt-lamp-…` (2295) | Restock and retitle | Out of stock, and the all-caps title carries a consumer-electronics claim ("ionizer air purifier") the owner should confirm |
| `281`, `286` (and `271`, `291` on production) | Archive on staging | Animal/livestock products. The storefront's niche guard already withholds them, so this is hygiene rather than a fix |

## 6. What the storefront shows today, from WooCommerce

Read from the staging catalogue in a production build: **8 products** on `/products`, each
with its real WooCommerce title, image and slug. `salt-licks` (2352) is withheld by the
niche guard because of its name, so the visible set is the 9 approved products minus that
one. Every price shows as **Price unavailable** and every Add to Cart is disabled, because
the public Store API answers HTTP 500 for the full-catalogue read and WordPress core
reports no price, SKU or stock — the honest state until the REST read key exists. No price,
no SKU and no stock figure is inferred anywhere.

## 7. Editable in Admin → Products?

Yes, by design, and this is the acceptance test for the migration: the admin catalogue
reads WooCommerce (products, categories, stock), so once the write credential exists the
owner can add a product, change a price, stock, SKU, image, description, category or
publish status in Admin → Products with no code change. Today the add/edit path is
deliberately disabled ("WooCommerce write connection required") because the editor modal
still persists to Supabase — that is the single remaining piece of the owner-editability
requirement and it is blocked on the key, not on the storefront.
