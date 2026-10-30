# Storefront route shape and edge cache — 2026-09-29

Preview deployment: `https://preview.himalayankoh.com`
Origin: `https://himalayankoh.com/staging` (Namecheap cPanel, WordPress + WooCommerce 7.7.0)
Worker: `himalayan-koh-ecommerce`, final version `62401a6c-524d-4697-aacd-8c8a39845b6e`

Companion document: `PERFORMANCE-AUDIT-2026-09-29.md` (the admin console work).

---

## 1. The root cause

Three findings, in the order they were measured.

**1. `/products` was dynamic by construction.** The page and `generateMetadata`
both read `searchParams` to decide which shelf was being rendered. In the App
Router that opts a route into dynamic rendering, so it was never prerendered and
never cached anywhere. Every visitor paid a WooCommerce round trip.

**2. The cache that page reads were supposed to use could not accept writes.**
The Worker's cache adapter was `kvDataAdapter()` — Workers KV. The runtime logs,
read with `wrangler tail` while requesting `/products`, answered:

```
Error: KV put() limit exceeded for the day.
    at Pa._put (index.js)
    at Pa.set
    at _next/static/fetch-cache-XsESMfD3.js
    at async _next/static/wordpress-BfGwQegi.js
    at async _next/static/woocommerce-DuyAq4BF.js
    at async _next/static/products-BA03V_NT.js
    at async _next/static/serverCatalog-xlSfRToG.js
    at async _next/static/page-sQm19u3B.js
```

A Workers KV namespace on this account allows **1,000 writes a day**. A page
cache writes one entry per render. Every cache write was being rejected, so:

- the ISR cache reported `X-Vinext-Cache: MISS` on every request, forever;
- `/blog` — which *is* prerendered (`blog.html` exists in the build output) — was
  re-rendered from the origin on every request, 902 ms;
- the `next.revalidate` work from the previous session had nothing to write to,
  which is why it measured no effect;
- the KV namespace had accumulated 12,977 keys across ~80 deploy prefixes, none
  of them a fetch/data entry for a current build.

**3. Products were being read from the origin for every visitor.** Direct
benchmark of the origin during the same window: product list 687–852 ms, product
by slug 661–789 ms, categories 689–790 ms. That is the per-visitor cost the
caching was supposed to remove.

## 2. What changed

| Area | Change |
| --- | --- |
| Cache adapter | `cache: { cdn: cdnAdapter() }` — page caching moved to Cloudflare Workers Cache. The KV data adapter was **removed**, and with it the `VINEXT_KV_CACHE` binding (`wrangler.jsonc`). |
| `/products` | Reads no `searchParams`; `export const revalidate = 60`. Prerendered and edge-cached. |
| `/products/shelf/[key]` | New route. Answers every query-bearing catalogue request via a middleware **rewrite** (not a redirect), so `?category=` keeps its title, canonical, breadcrumb and `noindex` decision, and the address bar is untouched. `generateStaticParams` covers every shelf plus an `all` sentinel for search/sort/page. |
| `/products/[slug]` | `export const revalidate = 60` — one minute, the window `STOREFRONT_READ_TTL_SECONDS` already documented. |
| `/` | `export const revalidate = 300`. The homepage is a client shell; without a window it was treated as uncacheable. |
| Invalidation | New `src/lib/backend/publicCache.ts`: `purgePublicProduct`, `purgePublicCatalog`, `purgePublicBlog`, called after product saves, variation edits, stock writes, archives, permanent deletes, and blog edits / status changes. |
| Latent bug | `updateWooProduct` crashed with HTTP 502 (`Cannot read properties of null (reading 'trim')`) when a client sent `sku: null` — the shape WooCommerce itself reports. A non-string SKU is now treated as "no SKU edit". |

## 3. Before / after

Median of 3, one client, `backups/.perf/baseline.mjs`. Origin latency is reported
alongside because the previous session found a ×2.54 origin drift; here the origin
was **unchanged** (before 833 ms, after 687–852 ms for the same list read), so the
page gains are attributable to caching rather than to a faster origin.

| Route | Before | After | Change | Cache state after |
| --- | --- | --- | --- | --- |
| `/` | 61 ms | **33 ms** | −46% | `cf-cache-status: HIT` |
| `/products` | 899 ms | **30 ms** | −97% | HIT, `Cache-Control: private, max-age=0, must-revalidate` |
| `/blog` | 902 ms | **31 ms** | −97% | HIT |
| `/products/himalayan-koh-authentic-…` | 865 ms | **33 ms** | −96% | HIT |
| `/products/himalayan-edible-…` | 885 ms | **34 ms** | −96% | HIT |
| PDP LCP (browser) | 1342 ms | **166 ms** | −88% | — |
| `/cart` | 791 ms | 60 ms | −92% | HIT (a 307 to `/products`; no cart data in it) |
| `/checkout` | 44 ms | 67 ms | +52% | BYPASS, `no-store` (see below) |
| `/faqs` | 73 ms | 86 ms | +18% | BYPASS (see below) |
| WooCommerce list read (direct) | 833 ms | 687 ms | origin unchanged | — |

**The two regressions, and why they are accepted.** Under the CDN adapter a route
with no revalidate window is treated as `no-store`, so the fully static pages
(`/faqs`, `/checkout`, `/about`, …) no longer take the prerendered-artifact path
and render per request — ~20–40 ms slower, still far inside the 150–250 ms target.
They are not *slower* because of caching; they lost a build-time shortcut. The
homepage was covered by a window because it is the highest-traffic static page;
`/checkout` was deliberately left uncached, because the rule is that checkout is
never publicly cached.

**Verified non-regressions**

- `?category=` metadata is server-rendered correctly on direct load: title
  `Edible Himalayan Pink Salt — Fine & Coarse | Himalayan Koh`, canonical
  `https://preview.himalayankoh.com/products?category=edible-pink-salt`.
- Bare `/products` canonical is `/products` with the generic catalogue title.
- Both catalogue routes render the same 2 products (the only 2 published on
  staging), the same prices and the same add-to-cart controls.
- `<img>` in the PDP hero is unchanged in behaviour (see remaining bottlenecks).
- 1,394 tests pass, typecheck clean, lint has no errors, build clean.

## 4. Invalidation, proven

`backups/.perf/verify-invalidation.mjs` performs a **no-op save** (the product's
own name written back) through the real admin API and watches the cache:

```
product: #2683 himalayan-koh-authentic-pure-natural-halal-…
before write: cf=HIT age=54
save: 200 {…}
after write:  cf=MISS age=-   build=8722c909a5f2
RESULT: PASS — the pre-write entry is gone (HIT age 54 -> MISS age -)
page after purge: 200, 76743 bytes
name after: "Himalayan Koh Authentic …" (unchanged: true)
price after: 0 (unchanged: true)
```

A save evicts the edge entry immediately rather than waiting out the minute.

## 5. Remaining bottlenecks

1. **Static pages render per request** (`/faqs`, `/about`, `/checkout`, …) because
   they have no revalidate window. Giving content pages a window would put them on
   the edge; `/checkout` must stay uncached.
2. **The PDP hero image is 493,584 bytes, 500×500, with no `srcset` or `sizes`**,
   served straight from `himalayankoh.com/staging/wp-content/uploads/…jpeg`. LCP is
   already 166 ms because the edge is fast, but the bytes are ~1.9 per pixel and
   the storefront never uses the image optimizer (`nextImages: 0`).
3. **Storefront JS: 94 files, 302 KB transferred / 967 KB decoded per PDP**, plus
   ~30 RSC prefetches for nav and footer links. The prefetches are now cheap
   (edge HIT) but the JS payload is not.
4. **`/api/catalog` is `force-dynamic` + `no-store` by design** (it carries price
   and stock to client components), so client-side catalogue reads still pay the
   origin (~700–850 ms) whenever a component is not seeded from the server.
5. **Staging has 2 published products, both simple.** No variable product exists
   to measure; the "10 PDPs" target was measured over the two live ones.
6. **The stale stale-while-revalidate serve fires an origin render** on the first
   request after each window, so a cold-ish cycle can still show ~400–800 ms on
   those requests even though the median is 30 ms.
