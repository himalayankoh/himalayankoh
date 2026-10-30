# Cloudflare Workers migration

How this storefront runs on Cloudflare Workers (`vinext`), what compatibility was
verified, what had to change, and which system owns which data.

- Branch: `integration/cloudflare-workers-migration`
- Worker: `himalayan-koh-ecommerce`
- Temp URL: <https://himalayan-koh-ecommerce.8002salman.workers.dev>
- Staging domain: `preview.himalayankoh.com` (Cloudflare custom domain after cutover)
- Production (`himalayankoh.com`): **read-only**, never built or deployed from here

## Compatibility (`npx vinext check`, vinext 1.0.0-beta.10)

```
Overall: 95% compatible (19 supported, 2 partial, 0 issues)

Project structure:
  App Router        62 page(s), 6 layout(s), 26 route handler(s)
  loading boundary   2
  error boundary     1
  not-found page     1
Libraries:  tailwindcss, lucide-react, framer-motion  → compatible
Config:     redirects ✓  headers ✓
```

| Area | Result | Note |
| --- | --- | --- |
| App Router / RSC / SSR | PASS | 62 routes, 6 layouts render on workerd |
| Route handlers | PASS | 26 handlers, incl. Stripe webhook (raw body) |
| Route handlers with dynamic params | PASS | `/api/admin/products/[id]` |
| `middleware.ts` | PASS | runs, matcher unchanged |
| `redirects()` / `headers()` | PASS after fix | see "Matcher gotchas" |
| `notFound()` | PASS | crafted product slugs 404 |
| `next/image` | PARTIAL | no on-the-fly optimizer without Cloudflare Images; images pass through |
| `reactStrictMode` | PARTIAL | App Router is not wrapped by vinext (Next defaults it on) |
| ISR (`/blog`, `revalidate = 3600`) | PASS | served from the edge cache; no KV binding |
| Node APIs used here (`crypto`, `Buffer`, `fetch`) | PASS | `nodejs_compat` enabled |
| Filesystem access | NONE | no `fs` use at request time |
| Server actions | NONE used | all mutations are route handlers |
| Cookies / headers / redirects | PASS | |

### Matcher gotchas (both fixed in this branch)

1. **`/:path*` does not match `/`.** The root request was serving without the
   host-scoped security headers. The noindex rule is now keyed on an explicit
   matcher that includes the root.
2. **`vinext` writes its own `.next/types/routes.d.ts`**, which collides with
   Next's generated `validator.ts` and breaks `npm run typecheck` after a
   vinext build. `scripts/clean-next-route-types.mjs` is prepended to both
   `prebuild` and the vinext build scripts so the two toolchains stop fighting.

Dependency fixed during init: `react-server-dom-webpack@19.3.0` requires React
`^19.3.0` while this project pins React `19.2.6`; the package is pinned to the
project's React version.

Another side effect to watch: `next` uses a caret range, so a plain
`npm install` can drift it. Keep the lockfile authoritative and re-run
`npm run typecheck && npm run build` after any dependency change.

## Page cache — Workers Cache, and no KV binding

A Worker has no persistent filesystem, so `vinext-cloudflare deploy` refuses to
deploy without a cache adapter. The adapter is Cloudflare's own edge cache
(`cache: { cdn: cdnAdapter() }` in `vite.config.ts`), and `wrangler.jsonc`
carries **no `kv_namespaces` entry at all** — deliberately, with the reasoning
in that file.

The KV adapter was tried first and could not do the job: a Workers KV namespace
on this account allows a thousand writes a day while a storefront cache writes
one entry per render, so every write answered `KV put() limit exceeded for the
day`. `/products` and `/blog` served a fresh render to every visitor (≈900 ms
each), the ISR cache never hit, and saving a product failed with a 502 when the
purge tried to write its tag marker. The edge cache has no per-day write budget,
is purged by `revalidatePath` when the console saves something, and stores
nothing in the Worker.

Measured 2026-09-30 on the preview: `/products` and `/blog` answer from the edge
in ~0.10-0.12 s, and a purged route re-renders once before it is cached again.

Commerce data is never cached there. Products, prices, stock, cart, orders and
customer responses are read from WooCommerce per request or via the
authenticated admin API.

### The old `VINEXT_KV_CACHE` namespace was emptied

The namespace left behind by the KV adapter (`7e62970fbe5049dfb678409d6f28d064`)
held **12,977 keys** — the page cache of 82 past deployments, every one a
`cache:app:<deploy-uuid>:<route>:html|rsc` (or `cache:<sha256>`) envelope. It was
emptied on 2026-09-30 after all of the following were established:

- no Worker in the account binds it (all six checked; the deployed
  `himalayan-koh-ecommerce` has no `kv_namespace` binding of any kind);
- the built bundle contains no `cache:app:` string and no `VINEXT_KV*` binding
  name, so the deployed code cannot read or write it;
- `dist/server/wrangler.json` carries `"kv_namespaces": []`.

**14,584 keys removed, 0 remaining** (the first listing showed 12,977; Workers KV
listing is eventually consistent, and re-listing after the bulk delete exposed
1,521 then 86 more, each re-deleted). `PC_BRIDGE_KV` and `PC_BRIDGE_KV2` belong to
a different project and were not touched. The empty namespace itself is left in
place: deleting it is a separate, irreversible step that nothing requires.

## Secrets

Server-only values are set with `wrangler secret put` and never written to a
tracked file. `wrangler.jsonc` `vars` holds public values only (site URL, data
source, WordPress/Woo bases).

Secret names currently bound to the Worker (names are listed; values are never
echoed anywhere):

```
WOOCOMMERCE_CONSUMER_KEY        WOOCOMMERCE_CONSUMER_SECRET
WOOCOMMERCE_BASE_URL            WORDPRESS_BASE_URL
SUPABASE_SERVICE_ROLE_KEY       SUPABASE_DB_URL
SHIPPO_API_KEY                  SHIPPO_FROM_*
NEXT_PUBLIC_SUPABASE_URL        NEXT_PUBLIC_SUPABASE_ANON_KEY   (public by design)
NEXT_PUBLIC_SHIPPO_ENABLED      NEXT_PUBLIC_WHOLESALE_ENABLED
```

`.dev.vars` for local `wrangler dev` is generated by
`node scripts/cloudflare-dev-vars.mjs` and is gitignored (`.dev.vars`,
`.dev.vars.*`). The generator reads the existing local env file; it is a
convenience, not a place to store new secrets.

Never place a secret in: git, `wrangler.toml`/`wrangler.jsonc` plaintext,
`NEXT_PUBLIC_*` unless genuinely public, client bundles, docs, or logs.

## Build and deploy

```bash
# reproduce local dev vars for `wrangler dev` (values come from the local env)
node scripts/cloudflare-dev-vars.mjs

# build for the Worker — the public vars must match wrangler.jsonc `vars`
NEXT_PUBLIC_DATA_SOURCE=woocommerce \
NEXT_PUBLIC_SITE_URL=https://himalayankoh.com \
NEXT_PUBLIC_WORDPRESS_BASE_URL=https://himalayankoh.com/staging \
NEXT_PUBLIC_WOOCOMMERCE_BASE_URL=https://himalayankoh.com/staging \
npm run build:vinext

# deploy
npx vinext-cloudflare deploy --config dist/server/wrangler.json
```

`wrangler dev` writes miniflare state inside `dist/`, so a running dev Worker
locks the build output — stop it (kill `workerd.exe`) before rebuilding.

## Data ownership

| Data | Owner | Notes |
| --- | --- | --- |
| Products, categories, prices, SKU, stock, variations, images | WooCommerce | authenticated REST v3, server-side |
| Orders, customers, coupons, reviews | WooCommerce | read on the admin side |
| Blog, pages, media | WordPress (staging) | `/wp-json/wp/v2/*` |
| Auth | Supabase (intentional, for now) | admin bearer tokens verified server-side |
| Cart, checkout, payments, shipping | Supabase + Stripe + Shippo | **migration gap** — see below |
| CRM, settings | Supabase | app state, not commerce |
| Page/ISR cache | Cloudflare edge (Workers Cache) | cache only; no KV namespace is bound |

Supabase is deliberately **not** removed blindly. Where it holds commerce that
WooCommerce should own (cart, orders, Stripe payment records, Shippo label
records) it is a known, tracked gap — the frontend now *reads* commerce from
WooCommerce, while the write path for orders still lands in Supabase.

## Indexing safety

Non-production hosts must never be indexable. The guard is an allowlist
(`src/lib/seo/indexing.ts`): only the production host is indexable, so every
other host — `*.workers.dev`, preview aliases, Vercel previews — is
`noindex, nofollow` and serves a disallow-all `robots.txt` by default. No
per-deploy maintenance is needed.
