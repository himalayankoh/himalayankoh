# WooCommerce REST v3: product writes, live commercial data, and the audits

Status as of commit `1df3cbd` on `integration/frontend-content-migration`.
Read this before changing anything that reads or writes a product.

## 1. Where the credentials live

Two server-only variables, in the server environment. Never `NEXT_PUBLIC_*`,
never in the repository, never in a client bundle:

```
WOOCOMMERCE_CONSUMER_KEY      (staging store only)
WOOCOMMERCE_CONSUMER_SECRET   (staging store only)
WOOCOMMERCE_BASE_URL          https://himalayankoh.com/staging
```

They are read in exactly one module — `src/lib/backend/credentials.ts` — for one
structural reason: `src/lib/backend/config.ts` is imported by client components,
and a browser bundle naming the credential variables is how the next component
ends up reading the source directly. The build audit below enforces it.

The staging key is scoped to the staging install: the same pair returned **HTTP
401** against `https://himalayankoh.com/wp-json/wc/v3/products`. It cannot write
to production.

## 2. The write seam

| Piece | Owner | Notes |
| --- | --- | --- |
| `src/lib/woo/productPayload.ts` | pure mapping | editor ⇄ Woo shape; unit tested |
| `src/lib/woo/productWrite.ts` | server writes | create / update / variation / trash / restore / duplicate |
| `src/app/api/admin/products/*` | HTTP surface | admin-authenticated, sanitized DTOs |
| `src/lib/admin/wooProductApi.ts` | browser client | the only product-write module a client may import |
| `src/components/admin/WooProductEditorModal.tsx` | editor UI | the console's own primitives |

Rules the shape enforces:

- **Undefined means untouched.** The console sends partial patches (toggling a
  product to draft); a mapper that filled blanks would clear the description
  every time somebody flipped a switch.
- **Absence is not zero.** An empty price, an empty SKU and a null stock count
  each stay unknown. `0` is a price and a stock level, not a silence.
- **No fallback.** There is one product store. A write that cannot reach it
  throws and the route answers 502; nothing lands in Supabase.
- **Archive, not delete.** The console offers WooCommerce trash, which is
  recoverable. Permanent deletion exists in the seam for the test's own cleanup
  and is not reachable from the UI.
- **Ignored fields are reported.** On a *variable* product WooCommerce keeps
  price and stock on the variations, so a parent-level price edit is a no-op.
  The write strips those keys and returns them in `ignored` with the reason, and
  the console shows it rather than reporting a save that did not happen.

## 3. Live commercial data

Almost every product on this catalog is **variable**: the parent carries an empty
`regular_price` and the real numbers are on the variations. Reporting the
parent's empty price is what produced "Price unavailable" on products a customer
could buy, so the authenticated read resolves the range
(`withVariationPricing` in `src/lib/backend/woocommerce.ts`).

- Price, sale price and the resulting range: WooCommerce REST v3, variations
  included, variation reads cached 60s while the parent read stays uncached so a
  stock change is visible on the next request.
- Stock: Woo's own `stock_status` per product. **Quantity is not tracked** on
  this catalog (`manage_stock` is false), so no quantity is shown — that is a
  property of the data, not a gap in the read.
- SKU: empty on all but two products, and reported as unavailable rather than
  invented.
- Out of stock disables Add to Cart; an unknown stock state also disables it and
  says why.

The console reads through `/api/admin/catalog` (server, credentialed). It is
deliberately **not** `/api/catalog`: that read is sealed by the pink-salt niche
guard, and the console has to see a withheld product in order to archive it.

## 4. Verification (all run against staging, 2026-09-18)

- **Write lifecycle** — `src/lib/woo/productWrite.integration.test.ts`, run with
  `npm run test:integration`: create a draft with price/SKU/stock, read it back
  from the store, change price/SKU/stock/title, read the changes back, trash it,
  confirm it left every catalog read, then remove it outright. Nothing is left
  behind, including in the trash.
- **Console API end to end** (real admin session): add, edit price/SKU/stock/
  category/image/SEO, publish, archive — with each change verified against
  WooCommerce REST v3 afterwards. An edit to a real product (2185) was confirmed
  on the storefront API and then restored to its original values.
- **Public off-niche sweep** — `/`, `/products`, every product page, `/about`,
  `/contact`, `/faqs`, `/shipping`, `/privacy`, `/terms`, `/return`,
  `/sitemap.xml`, `/robots.txt`, `/api/catalog`, plus crafted URLs naming an
  excluded product: **0 matches** for livestock/horse/cattle/deer/animal-feed, on
  both the local production build and the deployed temporary URL.
- **Credential audit** — every built artifact, and every JS chunk the deployed
  pages load: **0** key-shaped tokens, **0** occurrences of
  `WOOCOMMERCE_CONSUMER` / `consumer_secret`.
- **Preview guard** — `X-Robots-Tag: noindex, nofollow` and
  `robots.txt: Disallow: /` on every route of the temporary deployment.

## 5. Staging data changes made for the pink-salt niche

Recorded in `docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md`; all staging-only and
recoverable.

| Product | Change | Why |
| --- | --- | --- |
| 2321 Himalayan Rock Salt Pouches | description rewritten for kitchen use | store copy sold a pink-salt pouch as livestock feed |
| 271 Bag of Salt for Livestock | trashed | animal product |
| 281 Salt Licks for Horses | trashed | animal product |
| 286 Salt Block for Deer | trashed | animal product |
| 291 Salt Rock for Cattle | trashed | animal product |
| 2367 Himalayan Salt Pouches | trashed | stale duplicate of 2321: no description, no SEO copy |
| 2372 Himalayan Rock Salt Bag | image link cleared | its only photo was a salt lump cut for cattle, so the filename reached the storefront's HTML |

Kept as-is: **2352 SALT LICKS** stays hidden from the storefront pending the
owner's decision on whether it is a human-use or animal product.

## 6. Known follow-ups

- The staging origin is slow (0.7–6s per REST call measured), and a catalog read
  costs one call plus one per variable product. Caching the variation reads keeps
  repeats fast; the first read of a cold cache is still seconds.
- Orders, customers, coupons, inventory counts, reviews and payment gateways are
  not yet read through REST v3 from the console. Reads only, when they are:
  nothing here should mutate an order or a customer.
- WordPress media upload needs WordPress credentials, which this connection does
  not carry (Woo consumer keys authenticate `wc/*` only — confirmed: `/wp/v2/media`
  answers 401). Image editing therefore takes a URL and lets WooCommerce store the
  file, rather than uploading to the media library directly.
- Gemini / OpenRouter keys for the AI surfaces are still unset.
