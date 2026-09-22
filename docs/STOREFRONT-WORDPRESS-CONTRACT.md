# Storefront cart & wishlist — WordPress contract

Status: **cart, wishlist, saved addresses and customer accounts have left
Supabase.** The cart is WooCommerce's (`wc/store/v1`), scoped to the account through
a token binding in our plugin. The wishlist and the saved addresses are WordPress
tables behind the same namespace, both owned by a WooCommerce customer id. A
customer account **is** a WooCommerce customer, and the shopper's password is
verified by WordPress — including the reset and change flows, which are WordPress's
own `get_password_reset_key` / `reset_password` / `wp_set_password`. What remains on
Supabase is the *orders* slice, the admin console, content, settings and media; see
`WORDPRESS-WOOCOMMERCE-MIGRATION.md`, and `ORDERS-WOOCOMMERCE-MIGRATION.md` for the
orders design.

This file is written for whoever operates the WordPress side.

---

## 1. Why the two halves went to different places

| Concern | Owner | Why |
| --- | --- | --- |
| Cart | **WooCommerce**, `wc/store/v1` | WooCommerce already owns carts, pricing, coupons, shipping and stock reservation. Rebuilding that would be reimplementing WooCommerce's rules in our code — the thing this migration exists to stop doing. |
| Wishlist | **Our plugin**, `hk-storefront/v1` | WooCommerce has no wishlist: not in core, not in the Store API, not in REST v3. The choice was a custom table or leaving the data in Supabase. |
| Saved addresses | **Our plugin**, `hk-storefront/v1` | Woo has two address *slots* on the customer (the ones that ship an order) but no list to choose from, which is what the account portal has always shown. |

They are not split by convenience; they are split by which system already owns the
concern.

---

## 2. The cart (WooCommerce Store API)

### What the app calls

| Method | Route | Used for |
| --- | --- | --- |
| `GET` | `/wp-json/wc/store/v1/cart` | the cart, and a fresh nonce |
| `POST` | `/wp-json/wc/store/v1/cart/add-item` | `{ id, quantity }` |
| `POST` | `/wp-json/wc/store/v1/cart/update-item` | `{ key, quantity }` |
| `POST` | `/wp-json/wc/store/v1/cart/remove-item` | `{ key }` |
| `POST` × n | `/wp-json/wc/store/v1/cart/remove-item` | clearing (the Store API has no bulk clear) |

Nothing else in the Store API is used. In particular **the app never calls
`wc/store/v1/products`** — see §4.

### Authentication

None, and none is needed. The Store API is public. The cart is identified by two
values WooCommerce issues in response headers:

- `Cart-Token` — a signed JWT naming the session's cart;
- `Nonce` — required on every mutation (WooCommerce's CSRF guard).

The app keeps both in **httpOnly cookies** (`hk_wc_cart`, `hk_wc_cart_nonce`), so
the browser never holds a value it could tamper with, and the server-side checkout
reads the same cart. A nonce expires while a cart token does not; when that
happens WooCommerce answers `woocommerce_rest_invalid_nonce`, the app re-reads the
cart for a fresh nonce and retries **once**. From the shopper's side the first
click simply worked.

### What the browser may send

A product id, a line key and a quantity. **Never a price.** WooCommerce prices
each line when it is added; that removed the old client-writable
`cart_items.unit_price`, which the checkout used to have to re-derive because it
could not be trusted.

### No setup required

This half is live against staging today — verified end to end (add, read,
quantity change, removal, clear, per-session isolation, store refusal).

---

## 3. The wishlist (our plugin)

### Install

Copy `wordpress/himalayan-koh-storefront.php` to
`wp-content/plugins/himalayan-koh-storefront/himalayan-koh-storefront.php`, or zip
the folder and use **Plugins → Add New → Upload Plugin**, then **activate** it.
Activation creates `{prefix}hk_wishlists` via `dbDelta`. Deactivation does not drop
the table.

Then create the app credential: **Users → Profile → Application Passwords → Add
New**, and set it on the app's server (never `NEXT_PUBLIC_`):

```
WORDPRESS_ADMIN_USER=<the administrator's WordPress username>
WORDPRESS_ADMIN_APP_PASSWORD=<the generated password>
```

Application passwords require HTTPS — WordPress refuses Basic auth over plain
HTTP. (These are the same two variables the LeadOS plugin uses; there is one
application password, not one per plugin.)

**Confirm it is live:**

```
GET https://<site>/wp-json/hk-storefront/v1/wishlist?owner=test
```

should answer **401 or 403**, not 404. A 404 means the plugin is not active. The
app turns that 404 into *"the Himalayan Koh storefront plugin is not active"*
rather than a blank wishlist.

### Routes

All require `manage_options` — i.e. the administrator application password above.

| Method | Route | Body / query |
| --- | --- | --- |
| `GET` | `/hk-storefront/v1/wishlist?owner=…` | → `{ items: [{ id, owner, product_id, created_at }] }`, newest first |
| `POST` | `/hk-storefront/v1/wishlist` | `{ owner, productId }` — idempotent |
| `DELETE` | `/hk-storefront/v1/wishlist` | `{ owner, productId }` → `{ ok, deleted }` |
| `GET` | `/hk-storefront/v1/wishlist/count?owner=…` | → `{ count }` |

### Table

`{prefix}hk_wishlists`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint unsigned, auto-increment | |
| `owner` | varchar(191) | see below |
| `product_id` | bigint unsigned | the WooCommerce product id |
| `created_at` | datetime | |

`UNIQUE KEY (owner, product_id)` is the dedupe rule itself, and the add is
`INSERT IGNORE` against it: the duplicate check and the insert are one atomic
statement, so two tabs racing cannot produce two rows. That replaces the old
Postgres unique constraint 1:1.

`owner` is varchar(191) because that is the longest string a utf8mb4 column can
carry inside a composite index on MySQL 5.7 / MariaDB 10.x.

### The owner is not a client-supplied value

`owner` is an opaque string. **Today it is the application's user id**, because
customer accounts are the last thing still on Supabase. When those move to
WooCommerce customers, `owner` should become the customer id — a single `UPDATE`,
which is why the column is a free-form string rather than a foreign key into
`wp_users`.

The endpoint being administrator-only is deliberate, and it is not the thing that
authorises a shopper:

- `GET/POST /api/wishlist` (Next.js) verifies the **shopper's own session**
  (`lib/auth/customerRequest.ts`) and derives the owner from it.
- The request body's `owner` is ignored. A body that names somebody else is not
  an error, it simply has no effect — there is no path by which a browser can
  read or write another account's wishlist. This is pinned by a test
  (`src/app/api/wishlist/route.test.ts` → *"uses the session owner even when the
  body names someone else"*) and was exercised against a running server.

---

## 4. Customer accounts (WooCommerce customers)

A customer account **is** a WooCommerce customer, and a WooCommerce customer is a
WordPress user with the `customer` role. So the customer id *is* the WordPress user
id, `/wc/v3/customers/<id>` is keyed by it, and nothing has to be created or matched
by email at sign-in time.

### Routes

| Method | Route | Used for |
| --- | --- | --- |
| `POST` | `/hk-storefront/v1/customer/login` | `wp_authenticate` the shopper's password, answer with the customer id |
| `POST` | `/hk-storefront/v1/customer/register` | `wc_create_new_customer` — the WordPress user, the customer record and the store's welcome email |
| `POST` | `/hk-storefront/v1/customer/request-password-reset` | `get_password_reset_key` + `wp_mail` a link that points at the storefront's `/reset-password` |
| `POST` | `/hk-storefront/v1/customer/reset-password` | `check_password_reset_key` then `reset_password` (single-use, WordPress's own rule) |
| `POST` | `/hk-storefront/v1/customer/change-password` | re-check the current password with `wp_authenticate`, then `wp_set_password` |
| `GET` | `/hk-storefront/v1/cart-session?customerId=` | the cart bound to that customer; `{ "session": null }` when there is none |
| `POST` | `/hk-storefront/v1/cart-session` | bind the customer's current cart token (`REPLACE INTO`, so two devices cannot interleave) |
| `DELETE` | `/hk-storefront/v1/cart-session?customerId=` | forget the binding |
| `GET` | `/hk-storefront/v1/addresses?customerId=` | the customer's saved addresses, defaults first |
| `POST` | `/hk-storefront/v1/addresses` | save one address; `is_default_*` clears the previous default on that axis |
| `PATCH` | `/hk-storefront/v1/addresses/<id>` | update fields, or set/clear a default |
| `DELETE` | `/hk-storefront/v1/addresses/<id>` | remove one address |

All of them are `manage_options`-guarded like the rest of the plugin: the app's
server calls them with a WordPress **administrator application password**. The
shopper's own password is passed *through* the app to WordPress and is never stored,
logged, or placed in a token — only the identity that comes back is used.

### The session is signed by the app, not by WordPress

WordPress verifies the password; the app mints the session
(`src/lib/auth/customerSession.ts`, HMAC-SHA256 with `CUSTOMER_SESSION_SECRET`,
30 days). Its payload names the WooCommerce customer id in `cid` and **carries no
Supabase id**. The admin and customer sessions use different keys *and* are
role-checked, so neither can be replayed as the other. Rotating
`CUSTOMER_SESSION_SECRET` ends every customer session at once — that is the only
server-side revocation this design has; tokens otherwise expire on their own.

### Environment

| Variable | Needed for |
| --- | --- |
| `CUSTOMER_SESSION_SECRET` (≥16 chars) | every customer route. Without it, sign-in answers **503** rather than issuing a token nothing could verify. |
| `WORDPRESS_ADMIN_USER`, `WORDPRESS_ADMIN_APP_PASSWORD` | calling the plugin routes above (shared with LeadOS/CRM) |
| `WORDPRESS_BASE_URL` | already required |

### What each table is keyed by

- `hk_wishlists.owner` is the **WooCommerce customer id** as a string (e.g. `"42"`)
  from plugin 1.1.0. It was the Supabase user uuid while accounts lived there, so
  rows written before the change are keyed by a uuid and are now unreachable from
  the app (no shopper can present that owner any more). They are left in place, not
  migrated: there is no reliable way to attribute a uuid to a customer, and the
  wishlist is re-saveable. Delete them when convenient.
- `hk_cart_sessions.customer_id` is the customer id as an integer, and
  `hk_cart_sessions.cart_token` is WooCommerce's own opaque `Cart-Token`. The
  *contents* of the cart are never copied — that would be a second source of truth
  that drifts the first time stock moves.
- `hk_addresses.customer_id` is that same integer (plugin 1.2.0). Addresses were the
  one feature this migration inherited already broken: the Supabase rows were keyed
  by the Supabase user id, which sign-in stopped producing, so the list was always
  empty and every save went nowhere. They are re-keyed rather than migrated — the old
  rows point at an id nobody can present, exactly like the pre-1.1.0 wishlist rows.

WooCommerce *does* have two address slots on the customer record, but only the two
that ship an order (billing and shipping). The account portal has always shown a
*list* to choose from, which Woo has no field for, so those live in our table and
the two Woo slots stay Woo's.

### Email verification and in-app notifications are retired, not migrated

Two Supabase-era flows had no equivalent to move to, and both were removed rather
than rebuilt:

- **`/verify-email`.** `wc_create_new_customer` makes the account usable
  immediately and mails a welcome, not a verification link — so there was nothing
  left to verify, and the page's "click the link to verify your account" copy (on the
  signup screen too) was describing a step that had not existed since accounts moved.
  The route is gone and `/verify-email` now redirects to `/login`, so an old link in
  someone's inbox still lands somewhere useful.
- **Customer/admin notifications.** Nothing ever wrote a customer notification and
  nothing read an admin one; the writer fetched its recipients from Supabase
  `profiles` rows with `role = 'admin'`, a table whose admin identity had already
  moved to WordPress. The delivered alert for an order is the **email**
  (`lib/email/orderEmails.ts`); an in-console alert would need two halves that do not
  exist yet (a WordPress recipient source and a reader in the console), so the writer
  was deleted rather than left writing rows nobody opens.

### Still missing: account deletion

`POST /api/account/delete` verifies the customer session and re-checks the password
in WordPress, then answers **501** — because deleting a customer means
`wp_delete_user` and its WooCommerce record, and only WordPress can do that. The
route names `/hk-storefront/v1/customer/delete` as the seam: the plugin should delete
the user and, in the same request, drop that owner's wishlist rows and cart binding
(it owns both tables). Until it exists, no customer can delete their account, and the
route says so rather than pretending.

---

## 5. Grain size is a real WooCommerce variation

Grain used to be a *description*: the products are named "... Fine Grain — 6 lbs"
and carried their grain in a free-text attribute, so the storefront's grain selector
had nothing to render on the WooCommerce source and a cart line could not name a
grain at all.

### The WordPress side

`pa_grain-size` (attribute id 2, terms **Fine Grain** / **Medium Grain** /
**Coarse Grain**) is now a real variation axis on the two products where grain is
actually a *choice* — that is, where two listings differed by grain alone:

| Parent | Was | Now |
| --- | --- | --- |
| **2492** `himalayan-salt-6-lbs` | "... Fine Grain — 6 lbs" | variable; **Fine Grain** = 2539 `HK-SFL-F-6lbs` $19.95, **Coarse Grain** = 2540 `HK-SFL-C-6lbs` $19.95 |
| **2479** `himalayan-pink-edible-salt-16-oz-jar` | "... Fine Grain — 16 oz Jar" | variable; **Fine Grain** = 2541 `HK-ESF-16oz` $9.95, **Coarse Grain** = 2542 `HK-ESC-16oz` $9.95 |

Each parent took the name of the family ("Himalayan Salt Fine & Coarse Grain — 6
lbs") and gave up its own SKU to the variation that inherited it. The grain-specific
twin of each pair (**2493**, **2480**) is now a **draft** — its SKU was released to
the variation and its former value is recorded in its description.

Every other product stays `simple`: a product with one grain (or none) has no
choice to offer, and a one-option selector is worse than no selector.

### Retired URLs — two maps, both required

Merging the pairs retired four live slugs. Both servers that publish a product need
to know:

- **WordPress** (`/product/<slug>`): `hk_storefront_retired_product_slugs()` in the
  plugin, 301ing each retired slug to its parent. **Requires the plugin to be
  active** — until it is uploaded and activated, those WordPress URLs 404.
- **Storefront** (`/products/<slug>`): `RETIRED_PRODUCT_SLUGS` in
  `src/lib/backend/woocommerce.ts`, resolving the retired slug to its parent so the
  app's own URL still renders. This half works without the plugin.

They are kept in step by hand; each names the other. Add to both when a merge
retires a product.

### What the app does with a variable product

The catalog read (`lib/backend/woocommerce.ts`) reads `/wc/v3/products/<id>/variations`
for every variable product — the same request that supplies the price range — and
sets two forms of the same facts:

- `grainSizes` — the **labels** (`Fine Grain`), what the selector renders and what an
  order line prints;
- `variations.options` — the **addressable** form: `attribute: 'pa_grain-size'` with
  `value: 'fine-grain'`, plus the variation id, its price and its SKU.

Adding to the cart sends `{ attribute, value }` and nothing about money; WooCommerce
matches the pair against the product, prices the line and returns it. The cart line
reports the chosen option, which becomes the caption the drawer and the order show —
and because a variation line has its own `key`, quantity and remove work **per
grain**, not per product.

### Limits, stated

1. **One variation axis.** The selector renders one axis (grain when the store varies
grain, otherwise the first). A product varying on two axes needs a selector each and
a different model; the second axis is ignored rather than half-shown.
2. **The option's slug is derived from its name**, as WooCommerce does. A term whose
slugs was edited by hand afterwards would need the attribute's term list to be read;
today that surfaces as the store refusing the pair rather than a wrong line.
3. **Adding grain to another product** is: set it `variable`, make grain a variation
axis, create one variation per grain with its SKU and price, and add a line to both
retired-slug maps if a listing was merged away.

---

## 6. What the Store API product fatal still blocks

Re-checked on 2026-09-22 with `npm run check:wordpress` and by hand:

| Route | Result |
| --- | --- |
| `GET /wc/store/v1/cart` | **200** |
| `POST /wc/store/v1/cart/add-item` | **201**, full cart body |
| `POST /wc/store/v1/cart/update-item`, `/remove-item` | **200** |
| `GET /wc/store/v1/products/categories` | **200** (5 categories) |
| `GET /wc/store/v1/products/collection-data` | **200** |
| `GET /wc/store/v1/products` | **HTTP 500 — WordPress PHP fatal** |
| `GET /wc/store/v1/products/<id>` | **HTTP 500** for a real id (404 only for an id that does not exist) |
| `GET /wc/v3/products` | **200** (price, SKU, stock) |

So the fatal is confined to **the product routes**, and everything below follows
from that.

### The trigger, narrowed — `npm run diagnose:store-products`

A read-only diagnostic (GET only; exits 1 while the route still fails, so it can gate
a deploy step). What it establishes on staging:

1. **It is a real PHP fatal, and the body shape is a red herring.** The same 500 is
   the `wp_die` page `<title>WordPress › Error</title>` for a request that does not ask
   for JSON, and the REST envelope `internal_server_error: There has been a critical
   error on this website.` when `Accept: application/json` — one failure, two
   renderings, chosen by the request header. Earlier notes reading this route as "an
   HTML fatal, *not* JSON" (or the reverse) were describing the header their probe
   happened to send.
2. **The trigger is per-product serialisation, proven as a pair rather than inferred.**
   Queries known to match nothing (`include=99999999`, `per_page=2&page=99`,
   `min_price=0&max_price=0.01`) answer `200 []`; every query that matches at least one
   product fails, including `_fields=id`, so the item is built before any field is
   filtered. Only the presence of a product changes the outcome.
3. **Not the query, not the parameters, not the data.** `collection-data` runs the same
   product query and the price aggregation over it and answers 200; all 10 published
   products fail, spanning `simple` and `variable`.
4. **Environment is evidence here:** WooCommerce **7.7.0** on WordPress **6.7.2**, PHP
   **7.4.33**, 44 active plugins.

The change set it prints, in the order worth trying:

1. **Read the log — one request, then `grep -n "PHP Fatal" wp-content/debug.log`**
   (needs `WP_DEBUG` + `WP_DEBUG_LOG`) or the host's PHP error log for the same
   timestamp. First because it *decides between* the two changes below instead of
   guessing: the fatal is either in WooCommerce's own product code or in a filter a
   plugin hung on it, and those two look identical from outside.
2. **The change the log implies.** A path under `plugins/woocommerce/` → update
   WooCommerce (database backup first). Any other path → that plugin or theme.
3. **If no log is available and a change must be made blind:** update WooCommerce. It
   owns the failing code and the change is reversible — unlike editing WooCommerce
   core, which the next update silently overwrites.
4. **Not a plugin-by-plugin bisect.** 44 plugins are active; about 11 hook product
   output at all, which is the shortlist the script prints.

### Blocked

1. **Serving the catalog from the public Store API.** Price and stock still come
   from `/wc/v3/products`, which needs the consumer key/secret on the server. Without
   it there is no public route that reports price, sale price, SKU or stock.
2. **Any feature that needs a Store API product read.** Nothing in the app does
   today; that is why the cart could move now.
3. **Handing the storefront to a browser-side cart.** A future "the browser talks
   to WooCommerce directly" design would need the product routes for its catalog
   reads. The current design does not, because the cart lives on the server.

### Not blocked (i.e. this is what moved)

- Cart persistence — WooCommerce's cart works completely.
- Wishlist persistence — WordPress table + `/wc/v3/products` for the card
  details.
- Adding an item and being told what it costs: the *cart response* carries the
  line's name, SKU, image and price, so no product read is involved.

### The one thing the catalog gap does affect, indirectly

`checkoutCartIssues` used to skip the niche guard on the WooCommerce path
(`isRealCatalogProduct` reads a Supabase `tags` column that WooCommerce has no
equivalent for). The WooCommerce catalog read applies its own name/category/description
guard (`isNicheProduct`) for browsing, but a product added to the cart is not
re-checked against it. Closing that properly needs an attribute or category rule
agreed on the WordPress side — it is a WordPress-side decision, not app work.

---

## 7. Known limits, stated rather than hidden

1. **The cart follows the account only while the plugin is active.** WooCommerce
   identifies a cart by an opaque `Cart-Token`, and a token is scoped to whoever
   holds it. Signing in adopts the account's cart and every mutation re-saves the
   binding (`hk_cart_sessions`), which is what makes a second device see the same
   cart. When the binding cannot be stored, sign-in still succeeds and the cart
   stays this browser's — reported as `cart.error`, never thrown.
2. ~~**Grain sizes cannot reach a WooCommerce cart.**~~ **Closed** — grain is a real
   variation axis on the two products where it is a choice; see §5. A product with a
   single grain still has no selector, which is correct rather than missing.
3. **Notices no longer say "removed from your cart".** WooCommerce keeps an
   out-of-stock line and reports the problem instead of deleting it. The checkout
   refuses it with the store's own wording, and the customer can see and adjust the
   line. Silently deleting a customer's line on a transient stock blip was the old
   behaviour.
4. **The profile slice still runs on Supabase, and a signed-in customer has no
   Supabase session to read it with.** Profile, address book and notifications go
   through `src/lib/supabase/api`, which needs a Supabase user JWT. Since sign-in
   mints a WooCommerce-keyed session instead, those reads cannot succeed for a
   customer — the remaining work is to move them (WooCommerce customer meta for the
   profile and addresses; our plugin or WooCommerce for notifications), or to
   re-establish a Supabase session purely for that slice. Order history does not
   have this problem: `/api/account/orders` reads WooCommerce by the session's email
   and answers 200.
5. **The Stripe webhook reads the cart by a recorded token.** It has no browser and
   therefore no cookie, so `POST /api/stripe/create-payment-intent` records the cart
   token on the checkout session row and the webhook hands it back. A token lives
   ~48 hours, and a payment completes in minutes.

---

## 8. Site content, settings and telemetry (plugin 1.3.0)

The same plugin now serves the app's own content and telemetry, so this half of the
contract is written down in one place instead of being discovered route by route:

| Route | Methods | What it is |
| --- | --- | --- |
| `/settings` | GET, POST, DELETE | App settings the console edits. WordPress options, one option per category; a POST writes a whole category so a form save is all-or-nothing |
| `/category-hubs` | GET, POST | Category-hub overrides (option per category key) |
| `/category-hubs/one` | GET | One override. The *published* filter is applied by the app, not here |
| `/events` | GET, POST | First-party storefront events (`hk_site_events`). POST is write-only and field-capped; GET is the traffic dashboard's window |
| `/events/summary` | GET | Events grouped by path and name with 7/30/90-day windows, aggregated in SQL |
| `/newsletter` | GET, POST | Subscribers (`hk_newsletter_subscribers`, UNIQUE on email so a repeat signup keeps one row). POST reports `created: false` for a repeat |
| `/contact` | GET, POST | Contact submissions (`hk_contact_submissions`) |

Like every other route in this namespace they require `manage_options`, so the app's
server is the only caller and the browser never reaches them directly. The browser's
access is the app's own same-origin routes (`/api/events`, `/api/newsletter`,
`/api/contact`, `/api/category-hub`).

The HK blog fields are **post meta**, not a route: `hk_hero_image_url`,
`hk_hero_image_alt`, `hk_seo_title`, `hk_meta_description`, `hk_target_keyword`,
`hk_secondary_keywords`, `hk_search_intent`, `hk_tags`, `hk_faq_json`, registered with
`show_in_rest` so they travel in the post object through `wp/v2/posts`. Storing them as
meta rather than a parallel table is what makes WordPress's own revision system
snapshot them with the content, which is what the console's "Restore" then restores.

---

## 9. Rollback

The cart and wishlist have no dual code path: the Supabase cart/wishlist modules
were deleted rather than kept behind the data-source flag. Rollback is
`git revert` of the change, not an environment variable.

The `carts`, `cart_items` and `wishlists` Supabase tables are now unused by the
app. **Do not drop them until the WordPress path has run in production** — they
are currently the only copy of any existing saved carts and wishlists. A one-off
wishlist import is not yet written (the cart needs none: carts are transient), and
it can only attribute rows to a customer by matching the old Supabase uuid to a
WordPress user, which is why it has not been written as a blind script.
