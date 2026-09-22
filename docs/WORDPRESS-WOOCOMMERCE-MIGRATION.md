# Supabase → WordPress + WooCommerce migration

Status: **Phases 0–1 complete · Phase 3 product read paths ROUTED through the backend layer · cart and wishlist persistence MOVED off Supabase · real price/stock still BLOCKED on a staging fault**

Latest: the storefront cart is WooCommerce's (`wc/store/v1`) and the wishlist is a
WordPress table — see `STOREFRONT-WORDPRESS-CONTRACT.md`, which also re-measures
exactly what the Store API product fatal still blocks now that the cart is off it.

Target architecture:

```
GitHub Next.js frontend  →  Cloudflare preview / production frontend
                         →  WordPress REST API + WooCommerce APIs
                         →  WordPress / WooCommerce on Namecheap
                         →  existing MySQL database on Namecheap
```

> **Production (`https://himalayankoh.com`) is read-only during this migration.**
> Nothing in this document, the scripts it references, or the adapter layer writes to
> production WordPress, its database, orders, customers, users, payment settings,
> files, DNS or APIs.

---

## 1. Summary of the blocker

Every WooCommerce **Store API product** route on staging returns a WordPress PHP
fatal error. Until that is resolved, **no public endpoint on staging reports
product price, sale price, SKU or stock status**, so the storefront cannot show
real commercial data.

| Endpoint | Result |
| --- | --- |
| `GET /staging/wp-json/wc/store/v1/products` | **HTTP 500 — PHP fatal** |
| `GET /staging/wp-json/wc/store/v1/products/2461` | **HTTP 500 — PHP fatal** |
| `GET /staging/wp-json/wc/store/products` (legacy alias) | **HTTP 500 — PHP fatal** |
| `GET /staging/wp-json/wc/store/v1/products/categories` | 200 OK |
| `GET /staging/wp-json/wc/store/v1/cart` | 200 OK |
| `GET /staging/wp-json/wc/store/v1/products/attributes` | 200 OK |
| `GET /staging/wp-json/wc/store/v1/products/collection-data` | 200 OK |
| `GET /staging/wp-json/wc/store/v1/products/reviews` | 200 OK |
| `GET /staging/wp-json/wp/v2/product` | 200 OK — **but no price/SKU/stock fields** |
| `GET /staging/wp-json/wp/v2/product_cat` | 200 OK |
| `GET /staging/wp-json/wp/v2/media/{id}` | 200 OK |
| `GET /staging/wp-json/wc/v3/products` | **HTTP 401** — no consumer key configured |

Exact error body from the failing route:

```
HTTP/1.1 500 Internal Server Error
Content-Type: text/html; charset=UTF-8
x-powered-by: PHP/7.4.33
server: cloudflare
x-turbo-charged-by: LiteSpeed

<!DOCTYPE html>
<html lang="en-US">
<head><title>WordPress &rsaquo; Error</title></head>
<body id="error-page">
  <div class="wp-die-message"><p>There has been a critical error on this website.</p>
```

Reproduced 5/5 times with cache-busting, so it is a deterministic fault and not
a cache artefact.

**Why this is a server-side problem, not a client bug:** WooCommerce is clearly
loaded and healthy — `cart`, `categories`, `attributes`, `collection-data`,
`reviews` and the whole `wc/v3`, `wc-analytics` and `wc-admin` namespaces all
register and respond. Only the product **response** pipeline fatals.

**Narrowed further by `npm run diagnose:store-products`** (read-only, GET only,
idempotent): the trigger is the per-product response builder, shown as a pair rather
than argued — queries that match no products answer `200 []` while every query that
matches at least one fails, including `_fields=id`. All 10 published products fail,
across `simple` and `variable`, so it is not one bad record; `collection-data` runs
the same query and price aggregation and answers 200, so it is not the query. That
leaves **WooCommerce 7.7.0 on WordPress 6.7.2 (PHP 7.4.33)** as one candidate and **a
filter on product data** as the other, and the error log is what separates them.
The `Content-Type: text/html` in the body above is the rendering for a request that
does not ask for JSON — the same failure returns the REST JSON envelope when `Accept:
application/json`, so a probe's `Accept` header decides which shape gets reported.

### Resolving it (owner action — not done by this migration)

Two options, neither of which this repository can perform safely on its own:

1. **Fastest, no staging code change.** WooCommerce → Settings → Advanced →
   REST API → *Add key* with **Read** permission. Set
   `WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET` in `.env.local`.
   `/wc/v3/products` then returns price, regular/sale price, SKU and
   `stock_status`/`stock_quantity` immediately, and the adapter pivots to it
   automatically — it is already implemented and is tried first.
2. **Fix the fatal at the source.** One request, then
   `grep -n "PHP Fatal" wp-content/debug.log` (needs `WP_DEBUG` + `WP_DEBUG_LOG`) or
   the host's PHP error log — that names the file and line, and it is the only step
   that distinguishes WooCommerce's own code from a plugin filtering product data.
   Then either **update WooCommerce** (a path under `plugins/woocommerce/`; take a
   database backup) or **update the plugin the log names** — rather than bisecting the
   44 active plugins, of which about 11 touch product output at all. This restores the
   public Store API, which is the correct long-term source for a headless storefront.
   `npm run diagnose:store-products` prints this order and re-checks the result;
   re-run it after any change.

Per the migration safety rules, **no fake or placeholder data has been
introduced to work around this.** Price and stock are reported as `unknown`.

---

## 2. Phase 0 — repository audit

`himalayan-koh/` — Next.js 15 App Router, TypeScript, 299 `.ts`/`.tsx` files
under `src`, 33 SQL migrations under `supabase/migrations/`.

There is **no password-based ORM**; all Supabase access funnels through
`src/lib/supabase/` and its 13 API modules, which is what makes an adapter layer
tractable.

### 2.1 Supabase dependency inventory

| # | Concern | Where it lives | Notes |
| --- | --- | --- | --- |
| 1 | **Client** | `src/lib/supabase/client.ts` | Browser client; `isSupabaseConfigured()`, `clearSupabaseSession()` |
| 2 | **Generated types** | `src/lib/supabase/database.types.ts` | Hand-maintained; 16 tables |
| 3 | **Products** | `src/lib/supabase/api/products.ts` | `RETAIL_PRODUCT_COLUMNS` deliberately excludes `cost_price` |
| 4 | **Categories** | same module | `getCategories`, `getCategoryBySlug` |
| 5 | **Inventory** | `products` select joins `inventory(*)` | `quantity > reserved_quantity` drives `inStock` |
| 6 | **Cart** | `src/lib/supabase/api/cart.ts`, `carts` + `cart_items` | |
| 7 | **Checkout** | `src/app/(main)/checkout/*`, `src/lib/stripe/*`, `src/lib/payments/*` | Stripe + Shippo + tax/shipping rules |
| 8 | **Customers** | `src/lib/supabase/api/auth.ts`, `profiles` | |
| 9 | **Orders** | `src/lib/supabase/api/orders.ts`, `orders` + `order_items` | Has Vitest coverage (`orders.test.ts`) |
| 10 | **Wishlist** | `src/lib/supabase/api/wishlist.ts`, `wishlists` | |
| 11 | **Notifications** | `src/lib/supabase/api/notifications.ts`, `notifications` | |
| 12 | **Stripe** | `src/lib/stripe/`, `src/app/api/stripe/*` | `STRIPE_SECRET_KEY`, webhook, `STRIPE_ALLOW_LIVE` guard |
| 13 | **Shippo** | `src/lib/shippo/`, `src/app/api/shippo/*` | Rates, labels, packing splits |
| 14 | **Blog / content** | `src/lib/supabase/api/blog.ts`, `blog_posts` | Plus a bundled fallback in `src/lib/categoryContent/blogArticles.ts` |
| 15 | **Images / storage** | `src/lib/images/`, `public/`, Supabase Storage buckets | `images:fetch` / `images:check` scripts rehost legacy WordPress media |
| 16 | **API routes** | 19 route files under `src/app/api/**` | Stripe, Shippo, orders, contact, newsletter, admin, OpenRouter |
| 17 | **Server actions** | none — the app uses API routes, not `"use server"` actions | Simplifies the swap |
| 18 | **Environment variables** | `src/lib/env.ts` + `.env.example` | Full list in §6 |
| 19 | **Demo / seed data** | `scripts/seed-demo-accounts.mjs`, `reset-demo-data.mjs`, `setup-supabase-backend.mjs` | Demo accounts + orders + wishlists + notifications |
| 20 | **Fallback catalog** | `src/data/products.ts` (1,326 lines) | Bundled demo catalog — **must not** be reachable in production once WooCommerce is live |

**80 files under `src` reference Supabase.** At audit time the read paths that
mattered for the first milestone were concentrated in three modules:
`src/lib/supabase/api/products.ts`, `src/lib/products/resolveProduct.ts` and
`src/lib/seo/server.ts`. All three have since collapsed into the backend layer
(§3): `resolveProduct.ts` is gone, and its single caller
(`src/views/ProductDetailPage.tsx`) now calls `lookupCatalogProduct()` directly.

### 2.2 Notable behaviours the migration must not break

- **`isRealCatalogProduct()`** — products are only storefront-visible when they
  carry a `packing_profile:` tag. Demo/legacy rows stay hidden from shoppers.
  Any WooCommerce mapping needs an equivalent "is this actually sellable" gate,
  or the storefront will start leaking half-configured products.
- **Product-by-slug resolution** (originally `resolveProductBySlug()`, now
  `lookupCatalogProduct()` in the backend layer) — falls back to the bundled
  demo catalog when Supabase has no row, *and* has an `isHiddenActiveProduct()`
  guard so an admin's in-progress product is not silently republished from stale
  demo data.
  A WooCommerce adapter must preserve this distinction or the fallback becomes a
  data-integrity bug.
- **Slug tolerance** — `normalizeProductSlug` / `productSlugFromName` /
  `slugsMatch` reconcile legacy URLs. WooCommerce slugs are short
  (`salt-licks`, `pouches`, `block-of-salt`) and will collide with the longer
  demo slugs, so this logic must be revisited, not deleted.
- **SEO is server-rendered and Supabase-backed** — `src/lib/seo/server.ts` and
  `src/app/sitemap.ts` read `products`, `categories` and `blog_posts` directly
  via `getSeoSupabase()`. These are a separate migration surface from the UI.
- **Route naming** — the brief specifies `/shop`, `/product/[slug]` and
  `/product-category/[slug]`; the app ships `/products`, `/products/[slug]` and
  a query-param category hub (`/products?category=…`). Rule 12 ("keep the
  existing working UI") means the existing routes are authoritative; the brief's
  names are satisfied by redirection if the owner wants the new URLs for SEO.

### 2.3 Staging inventory (read-only, from `wp/v2/product`)

11 published products:

```
2461 himalayan-koh-edible-salt-grain
2446 himalayan-edible-pink-salt
2372 himalayan-rock-salt-bag
2367 himalayan-salt-pouches
2352 salt-licks
2321 pouches
2295 himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control
2192 himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs
2185 chef-himalayan-pink-salt
                                 286 block-of-salt
                                 281 salt-licks-for-horses
```

3 product categories: `animal-feed` (58), `bulk-order` (105), `uncategorized` (75).

> Note a discrepancy worth investigating: the Store API reports `count: 3` for
> `bulk-order`, while `/wp/v2/product_cat` reports `count: 0`. Two different
> counting paths disagree, so category counts should not be trusted in the UI
> until that is explained.

---

### 2.4 Retired: email verification and notifications

Two Supabase-era features had **no live path at all** after the identity move, so
they were removed rather than ported — porting dead code would have built a backend
for a feature nobody could reach.

**Email verification.** Supabase sent the confirmation link; the storefront route
was `/verify-email`. Customer sign-in now goes through the `hk-storefront` plugin
and WordPress owns the account, so there is no confirmation link for this app to
consume, and nothing could ever arrive at that page. The page, its client and the
Supabase flow were deleted, and `/verify-email` is now a legacy redirect. WordPress's
own account tooling covers verification if it is ever wanted; this app has no
replacement endpoint, deliberately.

**Notifications.** `notifications` rows were written only by admin actions and were
read only by admins — a customer never had a `user_id` matching the profile id the
app now signs in with, so the customer-facing bell could not fire. The in-app path
(`src/lib/supabase/api/notifications.ts`, `lib/notifications/adminNotify.ts`) and
the table's reader were removed. The delivered alert for a customer is now the
**order email** (see `lib/email/orderEmails.ts`), which reaches them where they
already look. If an in-app inbox is wanted later it should be built fresh on the
customer session, not restored from the inert path.

Both retirements are recorded in the feature table that `npm run audit:supabase`
prints (`retired`, never `remaining`).

---

## 3. Phase 1 — backend adapter layer (implemented)

`src/lib/backend/` is the seam. Views should import from here rather than from
`lib/supabase` or a WordPress client, so switching backends does not touch UI.

| File | Responsibility |
| --- | --- |
| `config.ts` | `NEXT_PUBLIC_DATA_SOURCE` flag (**defaults to `supabase`**), base URLs, credentials. `resolveDataSource()` / `describeReadiness()` are the pure rules; `backendConfig` / `describeBackendReadiness()` wrap them with the running configuration. |
| `wordpress.ts` | REST client; converts WordPress PHP-fatal HTML pages into `WordPressApiError` instead of a confusing `Unexpected token '<'` |
| `wordpressFatal.mjs` | The **single owner** of PHP-fatal / HTML-body detection, shared by `wordpress.ts` and `scripts/check-wordpress-setup.mjs` (plain ESM because the no-build script imports it directly) |
| `woocommerce.ts` | Store API + REST v3 clients and **pure** raw→`Product` mappers |
| `products.ts` | Catalog adapter with a documented, explicitly *degraded* fallback chain |
| `adminCatalog.ts` | **Admin-facing read model.** The admin list, its filters/facets/stats and the dashboard's product counts all read through here, so `/admin` and the storefront cannot disagree about which products exist |
| `index.ts` | Barrel — only the names the app imports: `isSupabaseDataSource`, `getCatalogProducts`, `getFeaturedCatalogProducts`, `lookupCatalogProduct`, `readAdminCatalogPage`, `readAdminCatalogStats`, plus their types |

### Design commitments

1. **`priceMin` is `number | null`.** `null` means "the backend did not report
   it". It is never defaulted to `0`, never parsed from a demo string.
   (`Product.price` is the display string, and is empty when the price is
   unknown.)
2. **`stockStatus` has an explicit `'unknown'`.** Absent data does not become
   `in_stock`.
3. **Every product carries `missing: string[]`** naming the fields the backend
   failed to supply, so the UI can render "unknown" deliberately.
4. **Degradation is visible.** `CatalogResult.degraded` and `.warnings` record
   the exact backend error that forced a fallback.

### Admin catalog reads — one catalog for both surfaces

The storefront read WooCommerce (11 products) while `/admin` read the old Supabase
rows (7), so the catalog had two owners and the panel edited one while the site
served the other. `adminCatalog.ts` closes that split-brain:

| Surface | Reads through |
| --- | --- |
| `/admin/products` list, filters, category facets, stat cards | `readAdminCatalogPage()`, `readAdminCatalogStats()` |
| `/admin` product and category counts | `readAdminCatalogStats()` |
| Product detail, Supabase source | the row's `record`, opened in the existing editor |
| Product detail, WooCommerce source | the live product page — read-only, because no WooCommerce write path exists yet |

Rules the module holds to:

1. **`null` means "the source did not report it".** Price, SKU, stock, inventory
   count, listing state and weight are null where the active source cannot answer,
   and the UI says so. `statsFromRows()` counts those into `priceUnavailable` /
   `skuUnavailable` / `stockUnknown` rather than showing zeros.
2. **Stats are a union.** The WooCommerce source has no active/inactive or
   low-stock figures, so its variant does not carry them and the view renders that
   source's cards. Nothing falls back to another source's numbers — the dashboard's
   Supabase inventory panels are hidden when WooCommerce is the catalog.
3. **Writes stay on the source that can accept them.** A row carrying `record`
   opens the editor; a row without one offers *View* instead, so a WooCommerce row
   can never be edited into Supabase.
4. **Facets come from the source too.** Category options are
   `AdminCatalogPage.facets`; the model's `Uncategorized` placeholder
   (`UNCATEGORIZED_CATEGORY`) counts as unreported, not as a category.
5. **No fabricated catalog.** The bundled demo products are no longer substituted
   when the configured source is unreachable — the panel shows an empty list and
   why.

### Read order (WooCommerce source)

1. `/wc/v3/products` — complete, needs consumer key/secret. Server-only.
2. `/wc/store/v1/products` — public and complete, but currently fatal on staging.
3. `/wp/v2/product` — always available, **no price or stock**. Using it marks the
   response `degraded: true`.

### What is wired (Phase 3)

Every catalog read in the app now goes through this module — there is no longer
any direct `productsApi` call from a page or view:

| Caller | Uses |
| --- | --- |
| `src/views/ProductDetailPage.tsx` | `lookupCatalogProduct()` — keeps its `[PDP] product resolve` debug log |
| `src/views/ProductsPage.tsx` | `getCatalogProducts()` |
| `src/views/HomePage.tsx` | `getFeaturedCatalogProducts()` |
| `src/lib/seo/server.ts` → `fetchSeoProductModel()` | `lookupCatalogProduct()`, bounded by `seoFetchDeadline()` |
| `src/app/sitemap.ts` | `getCatalogProducts()` |

`Product` (`src/data/products.ts`) is the single view model. It carries an
explicit unknown: `priceMin: number | null`, `sku: string | null`,
`stockStatus: 'unknown'`, plus `missing: string[]` naming what a source could not
supply. Display goes through `src/lib/products/price.ts`, so a source that
cannot report a price renders **"Price unavailable"** and the add-to-cart
control is disabled rather than offering a product for `$0.00`.

`compare_at_price` has exactly one meaning and one owner: it is the top of a
**variant price range** (rendered `"$9.95 - $17.95"`, `priceRange: true`), read
only by `src/lib/products/mapProduct.ts`. The WooCommerce mappers never touch it
and never translate a discount into a range.

### Rolling back

The Supabase path is intact and both `getCatalogProducts()` and
`lookupCatalogProduct()` delegate to `productsApi` when the flag is unset.
Flipping `NEXT_PUBLIC_DATA_SOURCE` back to `supabase` (or removing it) restores
the previous behaviour — verified by diffing the rendered product list, prices
and product-detail structured data before and after the change.

---

## 4. Phase 2/3 status

The Phase 14 milestone requires *real product, real price, real images, correct
stock, working category, working slug, no Supabase product query*. Verified by
exercising both flag values against the live environment:

| Success criterion | flag=supabase | flag=woocommerce |
| --- | --- | --- |
| Real product appears | ✅ unchanged | ✅ 11 real staging products |
| Real images appear | ✅ unchanged | ✅ real `himalayankoh.com/staging` media URLs |
| Product slug works | ✅ unchanged | ✅ `/products/salt-licks` resolves (id 2352) |
| **Real price appears** | ✅ unchanged | ⛔ **BLOCKED — no endpoint reports price; renders "Price unavailable"** |
| **Correct stock appears** | ✅ unchanged | ⛔ **BLOCKED — renders stock as unknown, add-to-cart disabled** |
| Struct data | ✅ unchanged, except the SKU fix below | ✅ no `Offer` node, no SKU |

### The one intentional delta on the Supabase path

Product-detail JSON-LD previously published the product's **internal UUID as its
SKU** (`sku: String(product.id)`), which is a fabricated identifier — and would
have published `"2461"` for a WooCommerce product. It now emits the real SKU.

Measured effect on `/products/himalayan-salt-block-30-lbs`: the Product+Offer
graph shrank by exactly **25 bytes** (2449 → 2424), which is precisely a
36-character UUID replaced by 11-character `HK-LB-30LBS`. Every other JSON-LD
field, the title, the meta description, the rendered headline and the displayed
price are unchanged. This was the only way to satisfy "surface SKU as unknown
rather than inventing it" on the WooCommerce path, where `String(product.id)`
would have emitted a product number as a SKU.

### What is still missing before this is usable

1. **Price and stock.** Blocked by §1. Everything else is ready for them.
2. **A WooCommerce equivalent of the `isRealCatalogProduct()` sellability gate.**
   Supabase products only reach the storefront when they carry a `packing_profile:`
   tag; WooCommerce has no such filter yet, so all 11 published staging products
   (including `pouches`, `block-of-salt`, `uncategorized` items) appear. Publicly
   visible ≠ sellable — this needs an explicit rule before production.
3. **Related products on the WooCommerce path** — currently `[]` (Supabase keeps
   its real related-products query).
4. **Weight**, for Shippo. `Product` has no weight field; `weight` is referenced
   ~120 times outside the backend layer.
5. **Cart/checkout/auth/customers/orders adapters** (Phases 7–8). Untouched.

---

## 5. Staging environment observed

- WordPress with Yoast (`yoast/v1`), Jetpack (`jetpack/v4`), Contact Form 7,
  LiteSpeed Cache, Akismet, WPForms, a gallery plugin (`pgc_simply_gallery`),
  Visual Portfolio, and a `omapp` (OptinMonster) namespace.
- WooCommerce with `wc/v3`, `wc/v2`, `wc/v1`, `wc/store/v1`, `wc-analytics`,
  `wc-admin`, `wc-paypal/v1`, `paypal/v1`, and a Stripe namespace.
- PHP **7.4.33** on LiteSpeed behind Cloudflare. PHP 7.4 is end-of-life; worth
  planning an upgrade independently of this migration.

---

## 6. Environment variables

`.env.example` could not be updated by tooling (it is flagged as a secrets
file), so **add the following block to `.env.example` and `.env.local`
manually**.

```dotenv
# ── WordPress / WooCommerce backend (migration target) ──────────────────────
# Data source for catalog/commerce reads. Unset or 'supabase' keeps the current
# backend. 'woocommerce' reads from WordPress. This is the rollback switch.
NEXT_PUBLIC_DATA_SOURCE=supabase

# STAGING ONLY until the migration is verified. Never point at production
# during the migration.
WORDPRESS_BASE_URL=https://himalayankoh.com/staging
WOOCOMMERCE_BASE_URL=https://himalayankoh.com/staging
NEXT_PUBLIC_WORDPRESS_BASE_URL=https://himalayankoh.com/staging

WORDPRESS_REQUEST_TIMEOUT_MS=12000

# SERVER ONLY — never prefix with NEXT_PUBLIC_. Read permission is enough.
# Required for price/SKU/stock while the Store API product routes are fatal.
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
```

Never commit: WooCommerce secrets, WordPress application passwords, payment
keys, database credentials, cPanel credentials, Cloudflare tokens, or Supabase
service role keys.

---

## 7. Diagnostics

```bash
npm run check:wordpress
```

Read-only. Issues **GET requests only** and reports PASS/WARN/FAIL/FATAL per
endpoint, then states plainly whether price and stock are obtainable and prints
the remediation steps. Exits non-zero when no endpoint can serve commercial
data, so it is safe to wire into CI.

Both flag values can be exercised from one checkout by overriding the four
non-secret variables for a single dev server (never edit `.env.local` for this):

```bash
NEXT_PUBLIC_DATA_SOURCE=woocommerce \
NEXT_PUBLIC_WORDPRESS_BASE_URL=https://himalayankoh.com/staging \
WORDPRESS_BASE_URL=https://himalayankoh.com/staging \
NEXT_PUBLIC_WOOCOMMERCE_BASE_URL=https://himalayankoh.com/staging \
WOOCOMMERCE_BASE_URL=https://himalayankoh.com/staging \
npm run dev -- -p 3021
```

With no override the app runs the `supabase` default. What to expect on each:

| Check | `supabase` | `woocommerce` |
| --- | --- | --- |
| `/admin/products` rows | every Supabase product, active and inactive | the published WooCommerce catalog, 10 per page |
| Price column | the stored price | `Price unavailable` (no public route reports price) |
| Stock column | units, or `Unknown` when untracked | `Unknown` + `Stock unknown` |
| Row action | `Edit` (opens the editor) | `View` (opens the live product page) |
| Stat cards | Total / Active / Inactive / Featured / Low Stock / Out of Stock | Total / Featured / Price Unavailable / SKU Unavailable / Stock Unknown |
| Supabase inventory panels on `/admin` | shown | hidden |

---

## 8. Phase tracker

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Repo audit → this document | ✅ Done |
| 1 | `src/lib/backend/` adapter layer | ✅ Done |
| 2 | WordPress staging connectivity | ⚠️ Content OK · **Store API products fatal** |
| 3 | Products first, behind a flag | ✅ Read paths wired and verified on both flag values — storefront **and admin** (`adminCatalog.ts`); the two surfaces now serve the same catalog · ⛔ price/stock blocked by §1 |
| 4 | WordPress content pages | ⏸ Not started — no code written. The speculative WordPress page/post mapper was removed as unused surface rather than left as untested groundwork. |
| 5 | SEO from WordPress + Yoast | ⏸ Not started |
| 6 | Images from WordPress media | ✅ Real staging images render. No `next.config.ts` change is actually needed: the storefront never uses `next/image` (40 plain `<img>` elements), so absolute staging URLs load directly. `images.remotePatterns` only matters if the app later migrates to `next/image`. |
| 7 | Cart & checkout | ✅ **Cart** to `wc/store/v1`, **wishlist** to the `hk-storefront/v1` plugin, and **orders** to WooCommerce: the checkout reserves the Woo order before the PaymentIntent (its id travels in Stripe metadata), the webhook marks it paid, and Shippo tracking, the emails, customer history and the admin console all read and write that order. `stripe_checkout_sessions` is deleted. See `ORDERS-WOOCOMMERCE-MIGRATION.md` §7 for what is implemented and what is not (the historical import). |
| 8 | Customer accounts / CRM | ⏸ Not started — **production customers untouched** |
| 9 | Supabase removal | ⚠️ Started and measured. Runtime imports **11 modules** (from 33; 24 before this pass), server-side 9, and the two browser modules left are `/admin/categories` and `/admin/category-hubs`. The whole site-content block — **settings, category-hub overrides, first-party events, newsletter, contact submissions, blog admin writes, blog media, product/media uploads, the label worklist and the dashboard analytics** — now reads and writes WordPress/WooCommerce (`hk-storefront/v1`, `wp/v2/posts`, `wp/v2/media`, `wc/v3`); see §10. What is left is the legacy admin catalog (`features/catalog/repository.ts`, `lib/backend/adminCatalog.ts`, `lib/backend/products.ts` Supabase branches), `lib/seo/server.ts`, `lib/hermes/evidenceStore.ts`, `lib/shippo/server/rates.ts`'s packing lookup, and the read-only historical-orders adapter — each named in §10.3. Earlier steps: Runtime imports **24 modules** (from 33), server-side 19. **Blog reads** moved to WordPress (`/wp/v2/posts`); blog *admin writes* and Storage are the remaining half. **Orders** are off Supabase for the new-order lifecycle; only a read-only legacy adapter for pre-migration orders remains. Detail: The cart, wishlist, YouTube, admin auth, LeadOS/CRM, **customer accounts, saved addresses, password reset and traffic events** have left the app. The **storefront no longer ships the Supabase SDK or its config, on any route** — `npm run check:client-supabase` against a production build reports **5 of 73 routes**, down from 31, and every one of the 5 is `/admin/*`, which the owner asked to leave alone (`/products/[slug]` was the last storefront leak: the campaign path reached `lib/marketing` → `services/siteEvents`, which POSTed to Supabase with the anon key; it now posts to `/api/events`). `orders`, `order_items`, `products`, `profiles`, `blog_posts` and the rest are still read and written **server-side**. The `carts`/`cart_items`/`wishlists`/`addresses`/`notifications` tables are now unused but **kept** until the WordPress path has run in production — they hold the only copy of existing data. What is left is server-side and the admin console; orders is the bulk of it, designed in `ORDERS-WOOCOMMERCE-MIGRATION.md`. |
| 10 | Demo-data separation | ⏸ Not started |
| 11 | Cloudflare hosting | ⏸ Not started |
| 12 | Environment configuration | ⚠️ Documented in §6, needs manual file edit |
| 13 | Safety rules | ✅ Observed throughout |
| 14 | First milestone | ⛔ Blocked on §1 |

---

## 10. Site content, settings and telemetry are WordPress's now (this pass)

### 10.1 The WordPress surface, and where each piece lives

One new module talks to it: `src/lib/wordpress/siteContent.ts`. Its endpoints are
registered by the **existing** `hk-storefront` plugin (version 1.3.0, one deploy
step, no third plugin):

| What | WordPress home | Endpoint |
| --- | --- | --- |
| Admin settings the console edits | WordPress options, one option per category | `hk-storefront/v1/settings` |
| Category-hub overrides | WordPress options, one per category key | `hk-storefront/v1/category-hubs` |
| First-party storefront events | new `hk_site_events` table | `hk-storefront/v1/events`, `/events/summary` |
| Newsletter subscribers | new `hk_newsletter_subscribers` table (UNIQUE on email) | `hk-storefront/v1/newsletter` |
| Contact submissions | new `hk_contact_submissions` table | `hk-storefront/v1/contact` |
| HK blog fields (SEO, hero image, tags, FAQ) | registered post meta | read/written through `wp/v2/posts` |
| Blog posts, revisions | WordPress posts and its own revisions | `wp/v2/posts`, `/revisions` |
| Blog hero images, product images | WordPress Media Library | `wp/v2/media` |

Options rather than tables for settings and hubs because both are small whole-value
documents read as a unit — and that inherits WordPress's caching and backup path
instead of inventing a parallel one. A table for events because traffic is
append-only and read in aggregate; tables for newsletter and contact because losing
a subscriber or a customer's message is the one failure those endpoints exist to
prevent.

What the app calls, and the route that fronts it:

| App route | WordPress call |
| --- | --- |
| `POST /api/events` | `hk-storefront/v1/events` (public write, rate-limited, field-allowlisted) |
| `GET /api/events` | the same namespace, admin-only, for the traffic dashboard |
| `POST /api/newsletter`, `POST /api/contact` | the plugin's tables |
| `/api/category-hub` | `hk-storefront/v1/category-hubs/one` (published filter applied in the app) |
| `/api/admin/blog/posts[/…]` | `wp/v2/posts` with the administrator application password |
| `/api/upload-image`, `/api/admin/media/import-url` | `wp/v2/media` |
| `/api/admin/labels` | `wc/v3/orders` |
| `/api/admin/analytics` | `wc/v3/orders`, `wc/v3/customers`, the inventory report |
| `POST /api/admin/hubspot/import` | `crm/v1/leads` (it wrote to Supabase while the inbox read WordPress) |

### 10.2 Two real defects this fixed

- **HubSpot imports went somewhere the console could not see.** The route inserted
  into a Supabase `crm_leads` while the CRM inbox read the LeadOS plugin. It writes
  through the plugin now, deduping against the leads the inbox actually holds.
- **A paid WooCommerce order could be missing from the label bench.** The worklist
  read the app's own `orders` table; it reads WooCommerce now, so an order paid in
  the store is on the bench. `shipping_carrier` and `tracking_number` come from the
  meta the label step writes, so a label bought here appears immediately.

### 10.3 What is still on Supabase, individually

Measured with `npm run audit:supabase` after this pass (11 runtime modules):

| Module(s) | Why it is still there | The WooCommerce/WordPress replacement |
| --- | --- | --- |
| `features/catalog/repository.ts` (and its callers `CatalogAdmin`, `AdminSection`, `AIImportPanel`, `ListingTaskAdmin`, `HermesIntel`), `services/db.ts` Supabase adapter | The legacy admin catalog CRUD. In the `vinext` build `import.meta.env.VITE_SUPABASE_*` is statically replaced, so this path is live on the Worker — it is not dead code | `lib/woo/productWrite.ts`, `lib/woo/taxonomyWrite.ts`, `lib/woo/coupons.ts`, `lib/woo/inventory.ts` — all of which exist and are already used by the newer admin routes. This is the largest single block left |
| `lib/backend/products.ts`, `lib/backend/adminCatalog.ts` | Their `supabase` source branches, selected by `NEXT_PUBLIC_DATA_SOURCE`. On this deployment the flag is `woocommerce`, so the branch is unreachable — but it is still imported, so the SDK and `lib/supabase/*` stay in the graph | Delete the branch and the flag: WooCommerce becomes the only catalog source |
| `views/admin/AdminCategories.tsx` | Its Supabase category editor, shown only while the flag is `supabase` | The WooCommerce editor *already exists in the same file* (`/api/admin/categories`, `/api/admin/categories/[id]`) |
| `views/admin/AdminCategoryHubs.tsx` | **Fixed in this pass** — the last gate and notice are gone | — |
| `lib/seo/server.ts` | Reads SEO metadata through a Supabase client created during server render | `wp/v2/posts` + Yoast's REST fields (already read by `lib/blog/wordpressBlog.ts`) and `wc/v3` product fields |
| `lib/hermes/evidenceStore.ts` | `hermes_evidence` table, with an in-memory fallback | A plugin table (the storefront plugin already owns tables) or WooCommerce order notes for order-scoped evidence |
| `lib/shippo/server/rates.ts` (+ `lib/shippo/packing/enrichLineItems.ts`) | Reads packing profiles from Supabase to compute rate packages | WooCommerce product weight/dimensions + a plugin packing-profile option — the profile is per product, which is what product meta is for |
| `lib/orders/legacyOrders.ts`, `/api/admin/orders/legacy` | **Intentional**, read-only, for pre-migration orders | `scripts/import-historical-orders.mjs` (Phase P) is the design; it is not run yet, so the adapter stays and is clearly marked |
| `lib/stripe/server/supabaseAdmin.ts`, `lib/supabase/*` | The plumbing the rows above still import | Deleted with the last importer |

### 10.4 Phase L — the plugin blocker, measured

`npm run check:wordpress` (read-only) now probes both HK namespaces and the public
namespace index, so "the plugin is not active" is a stated fact rather than an
inference from scattered feature failures:

```
HK WordPress plugins
  credential: absent
  registered: hk-storefront/v1 = no · crm/v1 = no
  ABSENT GET /hk-storefront/v1/events — HTTP 404
         The hk-storefront/v1 namespace is not registered on this site.
         Blocks: wishlist, saved addresses, cart across devices, customer sign-in and password resets
  ABSENT GET /crm/v1/leads — HTTP 404
         Blocks: the CRM inbox and LeadOS
```

**Blocked, and it needs one human step**: the plugin files have to reach
`wp-content/plugins/` on the WordPress host. Nothing in the Worker deployment puts
them there, and `POST /wp/v2/plugins` installs from the wordpress.org directory only,
so a private plugin cannot be installed through REST. Once the files are present,
activation *is* a single authenticated call (`POST /wp/v2/plugins/<plugin>` with
`{"status":"active"}`), which the check script prints. Everything above that depends
on these namespaces is correct in code and untested live until that happens — stated
rather than claimed.

---

## 9. Next safe step

Exactly one: **obtain a read-only WooCommerce REST key from the staging admin
panel and put it in `.env.local`, then run `npm run check:wordpress` again.**

No staging code change, no production change, no DNS change, and no payment
activity is required to unblock price and stock. The adapter already tries
`/wc/v3/products` first, so populating those two variables is the entire change
needed to make real prices appear — the read paths and the honest-unknown
fallbacks are wired and verified.

The follow-on decision that will need owner input: whether all 11 staging
products should be publicly sellable, or whether WooCommerce needs its own
"is this ready to sell" marker to mirror the Supabase `packing_profile:` gate
(see §4).
