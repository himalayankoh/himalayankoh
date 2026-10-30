# Production cutover plan — preview → himalayankoh.com

Status: **plan only, nothing production-facing has been changed.**

> **Correction (2026-10-08): the backend below must NOT be `https://himalayankoh.com`.**
> Step 1 in this document sets the production backend to the apex, which is the
> storefront's own origin — the Worker would call itself for every read once the
> domain is attached. The production backend is a separate hostname,
> `https://wp.himalayankoh.com`; see `docs/PRODUCTION-REMEDIATION.md` §1 for the
> measurements, the owner actions it needs and the `/wp-content/*` requirement. The
> rest of this plan — the freeze, the secrets, the deploy-to-`workers.dev`-first
> order and the verification list — still holds, and the deploy path it asks for in
> Step 1 now exists (`wrangler.production.jsonc`, `scripts/assert-production-config.mjs`,
> `npm run build:production`, `npm run deploy:production`). Rollback:
> `docs/PRODUCTION-ROLLBACK.md`.

Staging today is `https://preview.himalayankoh.com`, served by the Worker
`himalayan-koh-ecommerce`, reading the **staging** WordPress/WooCommerce at
`https://himalayankoh.com/staging`.

---

## 1. What is true right now (verified from the repository)

| Thing | Value today | Where it lives |
| --- | --- | --- |
| Worker name | `himalayan-koh-ecommerce` | `wrangler.jsonc` → `name` |
| Public origin | `https://preview.himalayankoh.com` | `wrangler.jsonc` → `vars.NEXT_PUBLIC_SITE_URL` |
| Backend | `https://himalayankoh.com/staging` | `vars.NEXT_PUBLIC_WORDPRESS_BASE_URL`, `…WOOCOMMERCE_BASE_URL` |
| Data source | `woocommerce` | `vars.NEXT_PUBLIC_DATA_SOURCE` |
| Deploy command | `npm run deploy:staging` | `scripts/deploy-staging.mjs` |
| Staging guard | **refuses any other config** | `scripts/assert-staging-config.mjs` |
| Build origin injection | `DEPLOY_SITE_ORIGIN` (default = staging) | `scripts/prepare-deploy-env.mjs` |
| Secrets | `wrangler secret put …` (never in a file) | Cloudflare dashboard / CLI |

Two facts decide the shape of this cutover:

1. **`NEXT_PUBLIC_*` values are inlined at build time.** A production build must
   be *given* the production origin and production backend URLs; editing the
   Worker's runtime vars afterwards does not change what was compiled in.
   `scripts/check-public-origin.mjs` fails the build if a loopback URL slips in.
2. **`assert-staging-config.mjs` will refuse a production deploy.** That guard is
   deliberately strict, so production needs its own path — do **not** loosen it,
   add a sibling.

## 2. The one decision to make first

Both options are valid; they differ in risk, not in correctness.

- **A — a second Worker (`himalayan-koh-ecommerce-prod`) on the production
  domain.** Preview keeps running exactly as it is. Safest, and reversible: if
  production misbehaves, move the domain back to preview with no rebuild.
- **B — reuse the `himalayan-koh-ecommerce` Worker for production.** One place to
  look. But preview *becomes* production the moment the origin flips, and there
  is no staging left to compare against.

**Recommendation: A**, then retire preview later once production has been stable.

## 3. Cutover steps (option A)

### Step 0 — freeze, and write down the rollback point
```bash
git -C himalayan-koh log --oneline -1        # record the commit going to production
```
No deploys or content edits during the cutover window.

### Step 1 — add the production deploy path (code change, staging-safe)
Two small additions, both committable before anything is deployed:

1. `wrangler.production.jsonc` — same file as `wrangler.jsonc` with:
   - `"name": "himalayan-koh-ecommerce-prod"`
   - `"vars.NEXT_PUBLIC_SITE_URL": "https://himalayankoh.com"`
   - `"vars.NEXT_PUBLIC_WORDPRESS_BASE_URL": "https://himalayankoh.com"`
   - `"vars.NEXT_PUBLIC_WOOCOMMERCE_BASE_URL": "https://himalayankoh.com"`
   - a route for `himalayankoh.com/*` **only when the domain is actually moved**
2. `scripts/assert-production-config.mjs` — the mirror of the staging guard: it
   must assert the production Worker name, the production origin, the live
   backend and a production route, and refuse anything else. A guard asserted in
   the same spirit as staging's is what stops "staging deploy onto production".

### Step 2 — set production secrets (before the first production deploy)
On the production Worker, via `wrangler secret put` (interactive is fine; never
commit them):

- `ADMIN_SESSION_SECRET` — **a new secret, not the staging one.** Sessions are
  HMAC-signed with it, so a shared key would let a staging-issued admin token be
  replayed against production.
- `CUSTOMER_SESSION_SECRET`, `WHOLESALE_SESSION_SECRET` — likewise new.
- `WORDPRESS_ADMIN_USER`, `WORDPRESS_ADMIN_APP_PASSWORD` — an application password
  for the **live** WordPress administrator.
- `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET` — **live** WooCommerce
  REST keys (Read/Write). Staging keys are a different pair.
- Stripe keys — the **live** publishable/secret pair. Test keys must not ship.
- `SHIPPO_API_KEY` — live, if shipping labels are to be printed for real orders.
- `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`) — only if the AI copy panels are to
  work in production.
- `ADMIN_LOGIN_ACCOUNTS` — the owner's real admin logins.
- `HERMES_INGEST_TOKEN`, `SALMAN_OS_PROJECT_SLUG` — if those integrations stay.

`.dev.vars` is gitignored and holds **staging** values; it must never be the
source of production secrets.

### Step 3 — build for production
```bash
cd himalayan-koh
DEPLOY_SITE_ORIGIN=https://himalayankoh.com node scripts/prepare-deploy-env.mjs
npm run build:deploy            # vinext build for the production config
node scripts/check-public-origin.mjs      # must not print a loopback origin
node scripts/check-build-secrets.mjs      # must print "No server-side credential value"
```

### Step 4 — deploy the production Worker, still without the live domain
Deploy to `*.workers.dev` first and check it there (`/api/version` should report
the commit from Step 0). Only then attach `himalayankoh.com`.

### Step 5 — move the domain, then verify
Attach the production route and check, in this order:

1. `/` and `/products` return 200 and render products with images.
2. A product page shows the right price and stock from the **live** store.
3. `/api/version` reports the expected commit.
4. Admin sign-in works with the real WordPress admin credentials.
5. `/admin/media` lists the live media library and a download saves a real file.
6. Add-to-cart → checkout → **a real Stripe test-mode purchase first**, then a
   live one, and confirm the order appears in `/admin/orders`.
7. Print one label and confirm the tracking number is the order's own — never a
   fabricated one.
8. `/sitemap.xml` and canonicals use `https://himalayankoh.com`.
9. No console errors on `/`, `/products`, a product page and `/admin`.

### Rollback
Move the `himalayankoh.com` route back to the preview Worker (or remove it).
Because the code and data are untouched by the cutover, rollback is a routing
change, not a redeploy.

## 4. Risks that are easy to miss

- **Staging data is not production data.** Staging WooCommerce holds its own
  products and **25 orders** (dated 2023 → 2026-09-30) that exist only in the
  staging database. They are not "demo" rows in the code — they are real records
  in the staging store (36 at the time of writing, dated 2023 → 2026-09-30).
  Production reads the live store, so they will not appear there; they only need
  tidying in preview if the owner wants a clean screen, and `/admin/orders`
  now has a **Trashed** view for exactly that: select the rows, move them to the
  store's own trash, and restore them later if one turns out to have mattered.
- **The session secret.** Sharing it between environments makes staging tokens
  valid in production.
- **The `staging` path.** If production is pointed at `himalayankoh.com/staging`
  by mistake the storefront will show staging prices to real customers; the
  production guard in Step 1 exists to make that impossible.
- **Cloudflare cache.** The edge caches rendered public pages for one minute and
  purges on admin saves. After the cutover, purge once so no staging-rendered page
  is served from the production domain.
- **Preview must stop being indexed.** It already sends `noindex` via the
  allowlist in `src/lib/seo/indexing.ts`; confirm it still does after the flip.

## 5. Order of work

1. Steps 1–2 (code + secrets) — safe, no customer-visible change.
2. Steps 3–4 (build + workers.dev) — safe, still not public.
3. Step 5 (domain move) — the only irreversible-feeling moment, and it is
   reversible.
4. Then, and only then, tidy staging.
