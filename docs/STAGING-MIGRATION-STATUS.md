# Staging migration status

Branch `integration/cloudflare-workers-migration`. Staging backend is WooCommerce
at `https://himalayankoh.com/staging`. Production is read-only throughout.

- Deployed Worker (staging): `https://himalayan-koh-ecommerce.8002salman.workers.dev`
- Deployment method: `vinext` + Cloudflare Workers (see `CLOUDFLARE-MIGRATION.md`)
- Cutover target: `preview.himalayankoh.com` — **not switched yet**

## Environment / secret matrix

Sources: the local repo env files, the Vercel project env, and the Cloudflare
Worker's secret bindings. Values are never recorded here.

| Variable | Current source | Public/server | Test/live | Used by | Cloudflare destination | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | repo + `wrangler.jsonc` vars | public | — | canonicals, JSON-LD, sitemap | `wrangler.jsonc` `vars` | set |
| `NEXT_PUBLIC_DATA_SOURCE` | repo | public | — | catalog source switch | `vars` | set (`woocommerce`) |
| `NEXT_PUBLIC_WOOCOMMERCE_BASE_URL` | repo | public | staging | client-side Woo calls | `vars` | set |
| `NEXT_PUBLIC_WORDPRESS_BASE_URL` | repo | public | staging | blog/content reads | `vars` | set |
| `WOOCOMMERCE_CONSUMER_KEY` | repo | **server** | staging | product/admin writes | `wrangler secret put` | set |
| `WOOCOMMERCE_CONSUMER_SECRET` | repo | **server** | staging | product/admin writes | `wrangler secret put` | set |
| `WOOCOMMERCE_BASE_URL` | repo | **server** | staging | server-side REST | `wrangler secret put` | set |
| `WORDPRESS_BASE_URL` | repo | **server** | staging | server-side WP REST | `wrangler secret put` | set |
| `SHIPPO_API_KEY` | repo | **server** | ⚠️ **LIVE** | rates, labels | `wrangler secret put` | set — **not exercised** |
| `SHIPPO_FROM_*` | repo | server | live | parcel origin | `wrangler secret put` | set (matches approved address) |
| `SUPABASE_SERVICE_ROLE_KEY` | repo | **server** | live | auth/admin, legacy commerce | `wrangler secret put` | set — **retained, see gap below** |
| `SUPABASE_DB_URL` | repo | **server** | live | migrations | `wrangler secret put` | set |
| `NEXT_PUBLIC_SUPABASE_URL` | repo | public | live | supabase-js client | `vars`/secret | set (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | repo | public | live | supabase-js client | `vars`/secret | set (RLS-protected, public by design) |
| `NEXT_PUBLIC_SHIPPO_ENABLED` | repo | public | — | shipping UI switch | secret | set |
| `NEXT_PUBLIC_WHOLESALE_ENABLED` | repo | public | — | wholesale UI switch | secret | set |
| `STRIPE_SECRET_KEY` | — | server | — | payments | `wrangler secret put` | **MISSING — never configured** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | — | public | — | card form | `vars` | **MISSING — never configured** |
| `STRIPE_WEBHOOK_SECRET` | — | server | — | webhook verification | `wrangler secret put` | **MISSING — never configured** |
| `VERCEL_OIDC_TOKEN` | repo `.env.local` | server | — | Vercel-only runtime auth | none | **Vercel-only; drop on cutover** |
| `GOOGLE_SITE_VERIFICATION` | — | server | — | Search Console meta tag | `wrangler secret put` | placeholder added, value owed by owner |
| `NEXT_PUBLIC_ADSENSE_ENABLED` | — | public | — | ad seam | `vars` | defaults `false` (off) |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | owner (AdSense) | public | live | ad seam | `vars` | known to owner; not activated |

Nothing above is committed. The credential file the owner supplied lives **outside
the git repository** (parent directory), and `.env.local`, `.dev.vars` and
`.dev.vars.*` are gitignored.

## Verified on the deployed Worker

Full suite, commit `4fbc39f` (`/api/version` reports the same SHA):

- 25/25 routes answer; `/checkout` now renders a real checkout page (it used to be
  shadowed by a legacy redirect — see the commit for the cause).
- Noindex on every route including `/`; `robots.txt` disallows all.
- Public niche sweep: 0 forbidden matches. Public secret sweep: 0 matches.
- Catalog: 18 authorised SKUs public with live Woo prices; 0 duplicate SKUs.
- Crafted URLs for retired livestock products still 308 to the catalogue.

## Product 404s are real 404s now (2026-09-18)

A retired or invented product URL used to answer **`200`** with the title "Product not
found" and no product in the body — a soft 404 that a crawler is invited to index.
All five hidden records (`/products/pouches`, `/products/salt-licks`,
`/products/himalayan-rock-salt-bag`, `/products/himalayan-edible-pink-salt`,
`/products/himalayan-koh-edible-salt-grain`) and every invented slug did it.

**Cause: `src/app/loading.tsx`.** A `loading.tsx` in any ancestor segment wraps the
page in a Suspense boundary, so Next streams the skeleton with `HTTP 200` before the
page resolves, and the `notFound()` the page raises afterwards can no longer set the
status. The page's own `notFound()` was correct in every review of it — the boundary
above it was the whole bug, which is why it survived this long. The file is gone; its
comment justified it as load-bearing for `useSearchParams`, and the production build
passes without it. `app/admin/loading.tsx` stays: the admin console has no 404 to
report.

What this costs: the cold-load skeleton on public routes is gone, so a cold load now
paints the real document instead of a placeholder. What it buys: `HTTP 404` with the
shop's not-found page, no product data serialised, and a route-level regression test
(`src/app/(main)/products/[slug]/page.status.test.ts`) that fails if a boundary is
reintroduced anywhere above the product route.

## Open blocker: the checkout chain is not verifiable

`product → cart → checkout → Stripe → Woo order → My Orders → Shippo` was **not**
verified, and cannot be, for two separate reasons:

1. **No Stripe credentials exist at all** — not in the repo env, not in the Vercel
   project, not in the Worker. There is no test key to charge and no publishable
   key to render a card form.
2. **The only Shippo key is a live key** (`shippo_live_…`). Per the owner's own
   instruction, a live-only shipping credential means the integration test stops
   and is reported rather than exercised.

Independently of credentials, the write path for orders is still Supabase: cart,
`orders/create`, `stripe/create-payment-intent`, `stripe/webhook`,
`shippo/create-label` and `lib/orders/serverCreateOrder.ts` all read and write the
legacy database. WooCommerce is authoritative for products, prices, stock,
categories and coupon/order *reads*; it is **not** yet the order write target. That
is a dual source of truth and is recorded here rather than quietly left.

### Order source of truth — audit, 2026-09-18 (read-only, nothing migrated)

| Area | Where it actually lives |
|---|---|
| Checkout order creation | `CheckoutPage.tsx` → `ordersApi.createOrder` → `POST /api/orders/create` → `serverCreateOrder()` → Supabase `orders` + `order_items` (service-role) |
| Order pricing | re-priced inside `serverCreateOrder` from **Supabase `products.price`** — not from WooCommerce |
| Cart | Supabase `carts` / `cart_items` (`cartStore.ts`), keyed by product id |
| Stripe | PaymentIntent metadata carries the **Supabase order id**; `verify-payment` and the webhook both call `markOrderPaid()` → Supabase `orders` |
| Customer "My Orders" | `/account` → `ordersApi.getUserOrders` → Supabase `orders` filtered by `user_id`; guests via `/api/orders/get`, `/api/orders/track` |
| Admin Orders | `/admin/orders` → `adminApi.getOrders` / `getOrderAnalytics` → Supabase |
| Shipping label + tracking | `/api/shippo/create-label` reads and writes Supabase `orders` (`tracking_number`, `label_url`, `shipped_at`) |
| Inventory decrement | **nowhere.** No trigger on `orders`, no application code decrements stock; `inventory` rows are only edited by hand in the admin console |
| WooCommerce order read/write | **none.** `src/lib/woo/` is product-write only; no `/wc/v3/orders` call exists anywhere in `src/` |
| Dual write | **none** — there is no second writer, so there is no dual write to reconcile, only a source that cannot serve the catalog it sells |

One consequence is structural rather than a matter of credentials: `cart_items.product_id`
is `UUID REFERENCES products(id)`, while the public catalog's product ids are
WooCommerce **integers** (e.g. `2497`). Adding a WooCommerce product to the cart therefore
inserts a numeric id into a uuid column, and `serverCreateOrder` re-prices through
`cart_items → products` joins that only exist in Supabase. The order path is not merely
unmigrated — it cannot complete against the WooCommerce catalog as it stands today. That
finding is from reading the schema and the code paths, not from executing a checkout: no
checkout was run, and nothing was written during this audit.

Before production, orders must move as one unit: cart keyed by Woo ids → order created
through `/wc/v3/orders` and priced from Woo → Stripe PaymentIntent referencing the Woo
order id → `My Orders` and the admin console reading Woo orders (customer matched by the
authenticated identity) → label/tracking stored on the Woo order → stock left to
WooCommerce, which decrements it itself when the order is created there. Supabase can
stay for authentication until that replacement is proven, which is a separate decision.

## Owner decisions resolved (2026-09-18)

1. **The five legacy records are hidden.** `2321`, `2352`, `2372`, `2446`, `2461`
   left the public catalog. They were set to `draft` in WooCommerce — **not**
   deleted or trashed, so their ids, slugs and history survive — and they were
   added to `OWNER_REJECTED_PRODUCT_IDS` so the exclusion also holds if one is ever
   republished. They were hidden rather than renamed because the decision was about
   the records: all five are pink-salt products in substance, and `2446`/`2321`
   closely resemble authorised SKUs at different prices. The authorised SKUs are the
   catalog that replaces them.
2. **Stripe stays unverified.** The owner has ruled out live credentials for
   staging, and no test keys exist. Order: test keys arrive → staging-only
   end-to-end. Until then checkout's payment leg is **NOT VERIFIED**, not "passing".
3. **Shippo stays unexercised.** The only key is live (`shippo_live_…`), so the
   owner's instruction is to wait for a test token rather than buy a label.
4. **Server credentials no longer reach the build artifact.** The Cloudflare Vite
   plugin stages the project's `.dev.vars` beside its generated Worker config, so
   `dist/server/.dev.vars` held the WooCommerce key/secret and the Shippo key — never
   served, never uploaded, but live credentials inside a build artifact are one
   stray upload from publication. Every build now deletes env files from the output
   and searches what remains for this machine's server-only values, failing on a hit
   (`scripts/check-build-secrets.mjs`). It compares real values instead of guessing
   at patterns, never prints one, and treats `NEXT_PUBLIC_*` and `SHIPPO_FROM_*` as
   public by intent — the shipping-from address is advertised on Contact and in the
   policies.

## Staging-safe technical cleanup (2026-09-18)

- **`next-env.d.ts` is untracked.** Two toolchains own that filename and write
  different contents (`vinext build` imports its own type augmentations, `next lint`
  restores Next's navigation types), so a tracked copy came back dirty after a lint
  run. Typecheck passes without the file — verified with `.next/types` removed — and
  both build tools write it back before anything needs it. A full `npm run build`
  and `npm run build:deploy` now leave a **clean tree**.
- **Nothing in the app asks about Vercel any more.** The AI route's CORS allowlist
  read `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` and fell back to the literal
  `himalayan-koh.vercel.app`; on Workers those are absent, so it was effectively
  asking whether a caller was the old Vercel host. It now allows the origin the
  deployment is served from (from the request's own URL) plus the configured public
  origin — verified on the Worker: own host and preview reflected, `evil.example` and
  `someone-elses-app.vercel.app` get no CORS header at all.
- **`images.remotePatterns` no longer wildcards `**.vercel.app`**, a shared domain
  nothing has referenced since content moved to WooCommerce.
- **`robots` meta is denial-only** (see the commit): staging pages were emitting
  `index, follow` while their own headers said `noindex, nofollow`. All three signals
  now agree on every route; `/login` and `/account` keep an explicit denial so they
  stay out of the index on production too.
- **Credentials are checked at build *and* deploy.** The plugin re-stages
  `.dev.vars` into `dist/server` when the deploy runs, so a build-time-only guard
  left the artifact dirty again before it shipped. `deploy:vinext` runs the check
  afterwards, which also leaves `dist` clean at rest.
- **Deploy propagation.** A deploy can answer from the previous version for a few
  seconds; `/api/version` read immediately after a deploy returned the *old* SHA
  before settling. Poll it, do not single-shot it.

## Still outstanding

- **`HK-LFH-6lbs` price conflict** — the workbook disagrees with itself (Sheet1
  $12.75/$19.95 vs Sheet2 $10.75/$17.95). Created as `draft`, flagged `OWNER PRICE
  CONFIRMATION REQUIRED`, not published, so it is the one authorised SKU that is not
  publicly visible.

## Cutover performed (2026-09-18): preview.himalayankoh.com → Cloudflare

| | |
| --- | --- |
| PREVIEW DNS BEFORE | CNAME `preview.himalayankoh.com` → `cname.vercel-dns.com`, **DNS-only**, id `2d8c5d2efab86a18e0331b096e25ccfa` |
| PREVIEW DNS AFTER | Cloudflare-managed Worker custom domain: `AAAA preview → 100::` proxied, plus the edge A records; `Server: cloudflare`, `CF-RAY` present |
| SERVED BY | **Cloudflare Worker**, not Vercel |
| WORKER (staging) | `himalayan-koh-ecommerce` in `Himalayankoh.pk@gmail.com`'s account (`fd383fa3284298b20cd3ca9ba8b1dffa`), custom domain id `1e237b316fa58c02c308b08ed0327eb31ad5ff81` |
| KV namespace | `VINEXT_KV_CACHE` `7e62970fbe5049dfb678409d6f28d064` (created in that account for this move) |
| Deployed SHA | `02a42a12afcc9cadb681cfaa2b812719724df63b`, equal to git `HEAD` at deploy time (`/api/version`) |

### Why the Worker moved accounts

A Worker custom domain requires the zone and the Worker to be in the **same** Cloudflare
account. `himalayankoh.com` lives in `Himalayankoh.pk@gmail.com`'s account; the staging
Worker was first deployed into `8002salman@gmail.com`'s account
(`f542683e97458480452b0b8ef37a898a`), which cannot see that zone at all (it sees only
`luxedge.us`). The Worker was therefore deployed into the zone's account and the custom
domain attached there. The earlier deployment is **untouched and still serving** on
`https://himalayan-koh-ecommerce.8002salman.workers.dev` as rollback.

### Which token does what (probed, not assumed)

The three supplied tokens each hold about half of what a cutover needs:

| Capability | token 1 | token 2 | token 3 |
| --- | --- | --- | --- |
| Workers scripts / KV **read** | ✅ | ✅ | partial |
| Deploy (assets upload session) | ❌ 403 | ✅ | ❌ 403 |
| KV namespace create/delete | ❌ 401 | ✅ | ❌ |
| Worker **custom domain attach** (`PUT`) | ❌ 403 | ✅ | ❌ |
| Zone **DNS write** | ❌ 403 | ❌ 403 | ✅ |
| Zone DNS read | ✅ | ❌ 403 | ✅ |
| Worker routes write | ❌ | ✅ | ❌ |

So the cutover used **token 3 to remove the Vercel CNAME** and **token 2 to attach the
custom domain**. Two details worth keeping: the attach endpoint is `PUT` (a `POST`
answers `405 Method not allowed for this authentication scheme`, which reads like a
permission problem and is not), and the attach refuses while any externally managed
DNS record holds the name (`409 100117`), so the record must be removed first.

### Verified after the cutover

Against `https://preview.himalayankoh.com` itself (pinned resolver while this machine's
cache still held the pre-cutover answer — the authoritative and public answers already
returned Cloudflare): `server: cloudflare`, no `X-Vercel-*`, `/api/version` = git HEAD,
all of `/ /products /about /contact /faqs /blog /checkout /login /account /admin
/sitemap.xml /robots.txt` = 200, 120 unique internal links all 200, approved homepage
copy present ("World's Best for Livestock", "Rich All Natural Himalayan Pink Salt",
"horses, cattle and deer"), 18 published SKUs each rendering their own price and SKU,
the five retired records absent from sitemap and listing, `HK-LFH-6lbs` still draft,
canonical and sitemap origin = `preview.himalayankoh.com`, `noindex, nofollow` +
`Disallow: /`, no permitting robots meta, no credential shapes in HTML.

DNS integrity: comparing the zone against the pre-cutover snapshot shows **exactly one**
record changed — the preview hostname. Apex `A`, `www` CNAME, `mail`/`webmail` `A`, all
three `MX`, the SPF `TXT` and the DKIM `TXT` are byte-identical to before.

### Rollback

```
1. delete the custom domain      PUT-less: DELETE /accounts/<fd383fa…>/workers/domains/1e237b316fa58c02c308b08ed0327eb31ad5ff81
                                 (token 2; see .freebuff/cf-cutover.mjs)
2. recreate the CNAME record     CNAME preview.himalayankoh.com -> cname.vercel-dns.com,
                                 proxied=false, ttl=1 (token 3)
```

The exact record is in `.freebuff/preview-cutover-snapshot.json`
(`removedRecord`) and `.freebuff/preview-rollback-state.json`. Vercel was not modified:
the old deployment and the `himalayan-koh.vercel.app` alias still serve, so the rollback
restores a working preview rather than needing a rebuild. A fuller rollback also means
reverting the `kv_namespaces` id in `wrangler.jsonc` and deploying back into
`8002salman`'s account, whose Worker still holds its own binding and secrets.

### Deploy recipe now

```
cd himalayan-koh
eval "$(node ../.freebuff/cf-env.mjs)"   # token 2 + the zone account, no OAuth needed
npm run build:deploy
npx vinext-cloudflare deploy --config dist/server/wrangler.json
```

## Rollback state (captured before any cutover)

`preview.himalayankoh.com` is a **DNS-only (unproxied) CNAME**:

```
id      2d8c5d2efab86a18e0331b096e25ccfa
type    CNAME
content cname.vercel-dns.com
proxied false
comment "Vercel preview storefront (noindex-guarded)"
```

Reverting the cutover means restoring exactly that record. Apex `A`, `www` CNAME,
MX (`*.jellyfish.systems`) and the SPF/DKIM TXT records are untouched by this
migration and must stay untouched.

## Admin completion pass (React #419, Categories, refusal visibility)

**Every admin route was failing with React error #419**, which the browser showed
as the generic "an error occurred in the Server Components render" page. Root
cause was a single hook: `NavigationProgress` read the query string with
`useSearchParams()` from `next/navigation`, which may only be called inside a
Suspense boundary, so `app/providers.tsx` wrapped the client effects in one with a
`null` fallback. That boundary sat above every route, had to hydrate before it
could resolve the query string, and received that update mid-hydration. The same
boundary also meant every prerendered document was missing what it guarded, so the
console redrew once it hydrated — the reported flicker.

The component now reads `window.location.search` through the app's router shim, so
nothing above a route suspends and the boundary is gone. Guard:
`src/lib/router-compat.test.ts` scans **every** file under `src/` and fails if
`useSearchParams` from `next/navigation` returns anywhere.

Measured after the fix: 34/34 admin routes render, **0 console errors**, and one
load of `/admin/products` issues exactly **one** `GET /api/admin/catalog` — no
repeat, no loop.

**Categories are now real WooCommerce terms.** The screen said "category editing is
not connected" while the same process already held staging Woo credentials that
write products, so only the write path was missing (`lib/woo/taxonomyWrite.ts` +
`/api/admin/categories[/:id]`, admin-session guarded; anonymous requests get 401).
Two rules live in the module, both measured against the live store rather than
assumed:

- a term holding products is **never** deleted — WooCommerce accepts that delete and
  moves the products to Uncategorized, and it reported `200` when probed;
- a taken slug is **refused**, not suffixed — WooCommerce answers `201` and appends
  `-2`, inventing a second public URL for the same shelf.

Console-verified: create → edit → delete (a real term was created and removed,
taxonomy back to 8), the slug-collision refusal renders **inside** the dialog, and
the delete guard's sentence is now shown only when the term actually holds products.

Remaining known items on this surface: the admin Blog screen requests two legacy
livestock images that 404 (`/images/legacy/cattle-grazing.jpg`,
`/images/legacy/horse-salt-lick-paddock.jpg`), and the empty WooCommerce term
`animal feed` (`/animal-feed`, id 58, 0 products) is still in the taxonomy — visible
in the console, not published on the storefront. Both are recorded, neither changed.
