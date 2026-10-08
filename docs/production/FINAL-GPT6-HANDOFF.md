# FINAL GPT-6 HANDOFF — Himalayan Koh production preparation

Written for the engineer/agent who completes the migration. Everything below is either
**measured in this pass** (with the command that produced it) or explicitly marked as
**unverified / blocked**. Nothing here is inferred from a variable name or a dashboard
screenshot.

**Scope of this pass:** safe technical preparation only. No public routing change, no DNS
change on the apex, no WordPress database write, no catalogue import. The one production
change was the owner-approved access gate on the pre-cutover Worker (§6).

| | |
| --- | --- |
| Repository | `himalayankoh/himalayankoh` (remote `origin`) |
| Branch | `integration/cloudflare-workers-migration` |
| Verified release SHA | `b31f47a` — **proven on the deployment**, not assumed: the Worker's `/api/version` reports `b31f47aef93787c7ad73f96c6506f4a8baf71a66` |
| Deployment build time | `2026-10-08T20:00:56.608Z` |
| Date of this document | 2026-10-08 |

---

## 1. Current architecture

```
Shopper ──▶ Cloudflare edge (himalayankoh.com zone, denver/fish.ns.cloudflare.com)
              │
              │  himalayankoh.com  ─── A ─▶ 162.0.209.25 (Namecheap shared hosting)
              │                             └─ WordPress + WooCommerce, apex install
              │                                · the live retail site TODAY
              │                                · 13 published products
              │
              │  preview.himalayankoh.com ─▶ Worker `himalayan-koh-ecommerce` (staging)
              │                                └─ backend: himalayankoh.com/staging
              │
              │  himalayan-koh-ecommerce-prod.<account>.workers.dev
              │        └─ Worker `himalayan-koh-ecommerce-prod` (pre-cutover production)
              │             └─ backend: wp.himalayankoh.com (NOT yet serving WordPress)
              │
              └─ wp.himalayankoh.com ─→ 162.0.209.25 (proxied) but with NO WordPress
                                          document root on the origin → 404 for /wp-json/*
```

- **Storefront:** Next.js 15 App Router, built for Cloudflare Workers with `vinext` +
  `@vinext/cloudflare` (`npm run build:production`, output in `dist/`). Static assets come
  from the Worker's asset binding; there is no Node server and no container.
- **Retail source of truth:** WordPress + WooCommerce on the apex, read over **WooCommerce
  REST v3** (`/wp-json/wc/v3/*`). The WooCommerce **Store API** (`/wc/store/v1/*`) is
  currently broken on the apex (§7) and the storefront deliberately does not depend on it for
  the catalogue.
- **Wholesale / B2B:** an isolated module in the same deployment (its own session secret).
- **Supabase:** historical only. The deployed Worker has **no Supabase variable or secret**
  (the 5 public variables and 15 secrets in §5 contain none), so it is not a runtime
  dependency of retail. `.env.local` still carries `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_*` and
  `VITE_SUPABASE_*` names for old tooling; do not promote them into a deployment.
- **Payments:** Stripe (secret key missing, §9). **Shipping:** Shippo (live, §10).
  **Email:** Resend, unconfigured (§11).

## 2. Exact Cloudflare Worker names

Measured with `GET /accounts/{account_id}/workers/scripts`.

| Worker | Role | Public hostname | Public variables (names) |
| --- | --- | --- | --- |
| `himalayan-koh-ecommerce` | **staging** storefront | `preview.himalayankoh.com` (AAAA `100::`, proxied — a Workers custom domain) | `NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WOOCOMMERCE_BASE_URL`, `NEXT_PUBLIC_WORDPRESS_BASE_URL` |
| `himalayan-koh-ecommerce-prod` | **pre-cutover production** storefront | none attached; reachable only at its `*.workers.dev` name | those four **plus** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |

- The production Worker has **no route and no custom domain** — `scripts/assert-production-config.mjs`
  refuses to build one, and the deploy script re-asserts it. Attaching the apex is §15/C1.
- `himalayan-koh-ecommerce-prod` is *not* `package.json`'s `name`
  (`himalayan-koh-ecommerce`), which is why `scripts/deploy-production.mjs` passes `--name`
  explicitly and reads the Worker back afterwards. Keep both properties.
- The account also holds unrelated Workers (`pc-bridge*`, `premium-technology-news-magazine`,
  `spotaware-moderation-staging-*`). They are not part of this migration.

## 3. WordPress backend design

| | Production | Staging |
| --- | --- | --- |
| Origin | `https://himalayankoh.com` (WordPress today) | `https://himalayankoh.com/staging` |
| Production-time backend | `https://wp.himalayankoh.com` (`PRODUCTION_BACKEND_ORIGIN`) | — |
| Storefront origin | `https://himalayankoh.com` (`PRODUCTION_SITE_ORIGIN`) | `https://preview.himalayankoh.com` |
| Catalogue transport | WooCommerce REST v3, consumer key/secret | same, staging key pair |
| Catalogue today | 13 published products, 3 categories | 6 published + 1 draft, 7 categories |
| WP REST (`/wp-json/wp/v2/product`) | 200, anonymous-readable | 200 |
| WooCommerce REST with the configured pair | **401 `woocommerce_rest_cannot_view`** | **200** |
| Store API (`/wc/store/v1/products`) | **500** | not measured |

The apex and `/staging` are **separate WordPress installations**: separate databases,
separate key tables, separate catalogues, and **overlapping-but-different category ids**
(the same id `75` means `Uncategorized` on the apex and `Live Stock` on staging). Never
carry term ids across; map by name.

**The staging credential set does not reach the apex.** The WordPress admin login, the
WooCommerce key pair and the WordPress application password all authenticate against
`/staging` only. This is the single most important fact for the catalogue work.

## 4. Verified release SHA, and how it is proven

`/api/version` on the deployed production Worker returns:

```json
{"sha":"b31f47aef93787c7ad73f96c6506f4a8baf71a66","builtAt":"2026-10-08T20:00:56.608Z"}
```

Reproduce:

```bash
T=$(grep '^PREVIEW_ACCESS_TOKEN=' .env.local | sed 's/^[^=]*=//' | tr -d '\r')
curl -s -H "Authorization: Bearer $T" \
  https://himalayan-koh-ecommerce-prod.<account>.workers.dev/api/version
```

Commits after `b31f47a` in this branch touch documentation and one local check script
(`scripts/check-shippo-setup.mjs`); neither is part of the Worker bundle, so the deployed
artifact remains the `b31f47a` build. Re-run the command above after any deploy to confirm.

## 5. Production secrets — names only, never values

`himalayan-koh-ecommerce-prod`, 15 secrets (measured with `wrangler secret list`):

| Secret | Set by | Purpose |
| --- | --- | --- |
| `PREVIEW_ACCESS_TOKEN` | this pass | the pre-cutover access gate (§6) |
| `SHIPPO_API_KEY` | owner | live Shippo rating and labels |
| `SHIPPO_FROM_NAME`, `SHIPPO_FROM_STREET1`, `SHIPPO_FROM_CITY`, `SHIPPO_FROM_STATE`, `SHIPPO_FROM_ZIP`, `SHIPPO_FROM_COUNTRY`, `SHIPPO_FROM_EMAIL`, `SHIPPO_FROM_PHONE` | owner | warehouse address for rating |
| `WORDPRESS_BASE_URL` | owner | production backend origin |
| `WOOCOMMERCE_BASE_URL` | owner | production catalogue origin |
| `ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `WHOLESALE_SESSION_SECRET` | owner | session signing |

**Not present on the Worker** (measured): `STRIPE_SECRET_KEY`, the Stripe webhook secret,
`RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_SEND_ENABLED`, `ADMIN_NOTIFICATION_EMAIL`,
`ADMIN_LOGIN_ACCOUNTS`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`.

Where owner credentials live locally (both gitignored, **names only**):

- `docs/production/owner-access.local.env` — the authoritative, owner-edited copy:
  `CLOUDFLARE_DNS_TOKEN_1..3`, `GITHUB_TOKEN`, `GITHUB_ACTIVE_REPO`, `GITHUB_OLD_REPO`,
  `NAMECHEAP_USER`, `NAMECHEAP_PASS`, `NAMECHEAP_HOSTING_ORIGIN_IP`, `PREVIEW_ACCESS_TOKEN`,
  `WOOCOMMERCE_API_CONSUMER_KEY`, `WOOCOMMERCE_API_CONSUMER_SECRET`, `WORDPRESS_ADMIN_URL`,
  `WORDPRESS_ADMIN_URL_STAGING`, `WORDPRESS_ADMIN_EMAIL`, `WORDPRESS_ADMIN_PASSWORD`.
- `.env.local` — the merged values under the names the tooling reads. `npm run owner:access`
  performs the merge, prints names only, refuses to run if `.env.local` is git-tracked, and
  maps `WOOCOMMERCE_API_CONSUMER_*` → `WOOCOMMERCE_CONSUMER_*` and
  `CLOUDFLARE_DNS_TOKEN_1` → `CLOUDFLARE_API_TOKEN`. It deliberately does **not** map the
  WordPress admin *login* onto `WORDPRESS_ADMIN_APP_PASSWORD`; those are different secrets.

Rotation is the same command with an updated source file.

## 6. The pre-cutover access gate (deployed, owner-approved)

`himalayan-koh-ecommerce-prod` holds a **live** Shippo key and is reachable at its
`*.workers.dev` name, so it now enforces its own access gate. Cloudflare Access is **not
available on this account** (`access.api.error.not_enabled`; measured, and confirmed with a
valid token — see §14), so "or equivalent" was implemented in the app:

- **A production host is never gated** (`himalayankoh.com`, `www` — the list in
  `src/lib/seo/indexing.ts` is passed in, not duplicated).
- **No token configured means no gate**, so the same build is safe on staging and in `next dev`.
- **Everything else presents the token**: `Authorization: Bearer <token>` for a script, or one
  visit to `/?hk_preview=<token>` which sets an `httpOnly; Secure; SameSite=Lax` cookie and
  303-redirects to the same URL without the parameter.
- Anything else is a **401** with `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.
- Exempt because they cannot be public requests: the build phase (`NEXT_PHASE`), a missing
  `Host`, and loopback. Next's own `x-nextjs-prerender` header is deliberately *not* trusted —
  a caller can send any header.

**Verified on the deployed Worker** (each row is a real request; `…` is the `*.workers.dev` host):

| Request | Result |
| --- | --- |
| `GET /`, `/products`, `/blog`, `/login`, `/products?category=…`, `/api/stripe/config`, `/api/version`, `/api/catalog` with no credential | **401** (478 B refusal) |
| `POST /api/shippo/rates`, `POST /api/shippo/validate-address` with no credential | **401** — the money-spending routes are closed |
| `GET /` with `Bearer` | **200**, 47,982 B of storefront |
| `GET /products` / `/blog` with `Bearer` | **200** (42,134 B / 39,488 B) |
| `GET /api/stripe/config` with `Bearer` | **200** |
| `POST /api/shippo/rates` with `Bearer` | **200**, `configured: true`, **8 live carrier rates** |
| `GET /?hk_preview=<token>` | **303** → `/`, `Set-Cookie: hk_preview=…; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=lax` |
| the same request carrying that cookie / a wrong cookie | **200** / **401** |
| `himalayankoh.com`, `www.himalayankoh.com`, `himalayankoh.com/staging`, `preview.himalayankoh.com` | **200 / 301 / 200 / 200** — unaffected |

No credential value appears in `dist/`, `.next/` or the repository:
`check-build-secrets.mjs` scanned 1,179 files against the values of every non-public variable
before the deploy and found none, and `grep -rlF` over both build trees returns 0 files.

**Turning it off** (e.g. if the gate ever blocks real traffic): `wrangler secret delete
PREVIEW_ACCESS_TOKEN --name himalayan-koh-ecommerce-prod`. The code stays; with no token
configured the gate is inert. **Rotating**: re-run the two commands in §14.4.

## 7. Infrastructure blockers (measured, current)

| Surface | State | Evidence |
| --- | --- | --- |
| `wp.himalayankoh.com` | DNS exists (A → 162.0.209.25, proxied) but **the origin has no WordPress document root**: `/` returns the host's placeholder redirecting to `/cgi-sys/defaultwebpage.cgi`, and `/wp-json/`, `/wp-json/wp/v2/types`, `/wp-json/wc/v3/products` all **404** | curl matrix, §14.1 |
| Production Worker catalogue | `/api/catalog` → `{"products":[],"count":0,"degraded":true}`: "WooCommerce REST v3 skipped: … not configured", "Store API failed: HTTP 404", core fallback 404 — i.e. **the backend it points at is not serving WordPress** | curl (needs the token) |
| Store API fatal (apex) | **HTTP 500**, WordPress's generic "There has been a critical error on this website." Narrowed: sibling routes 200; queries matching no product return 200 `[]`; every query matching ≥1 product 500s (even `_fields=id`); the legacy `/wc/store/products` route 500s too → the product response pipeline. Needs one line of `wp-content/debug.log` | curl + `diagnose:store-products` (see `PRODUCTION-REMEDIATION.md` §K) |
| Live WooCommerce REST | **401 `woocommerce_rest_cannot_view`** with the configured pair; staging accepted the same pair (200) | §14.2 probe |
| Hosting panel | **Not obtained.** The Namecheap *account* login is not a cPanel login: `:2083/login/?login_only=1` → `401 invalid_login`. Required: a cPanel/SFTP credential for the account at `162.0.209.25` | `PRODUCTION-REMEDIATION.md` §J |
| Apex WP admin | **Not obtained** — the owner's login reaches `/staging` (302 + `wordpress_logged_in_*`), not the apex (200, no cookie) | §J |
| Backup | **None verified.** Blocked on the hosting panel. See §12 | — |
| Cloudflare Access | **Not enabled on the account** (`access.api.error.not_enabled`), so the in-app gate is the control | §14.3 |

## 8. Catalog comparison and the SKU-based reconciliation plan

Authoritative comparison: [`docs/production/CATALOG-COMPARISON.md`](./CATALOG-COMPARISON.md),
regenerable with `npm run compare:catalogues` (read-only GETs; nothing is copied, created,
updated or deleted).

**Counts as of this pass — verify before acting, do not hard-code:**

| | Live apex | Staging `/staging` | Preview storefront | Production Worker |
| --- | --- | --- | --- | --- |
| Products returned | **13** | **7** | **6** | 0 (degraded) |
| Published | 13 | **6** | — | — |
| Draft | 0 | **1** | — | — |
| Categories | 3 | 7 | — | — |
| Products with an image | 13 of 13 | 7 of 7 | — | — |

Live featured images were resolved through the public media endpoint: **12 distinct URLs, all
12 returning HTTP 200**. They are listed in the comparison document; they are what the
`/wp-content/*` passthrough would have to serve after the cutover.

**What differs (the requested diff):**

- **All 6** storefront products differ from the live apex by **id** — the id spaces do not
  overlap (`271`–`2461` live, `2653`–`2752` staging).
- **5 of 6** have a likely live counterpart **by name** (a suggestion, not an identity):
  - exact matches (similarity 1.00): *Bag of Himalayan Pink Salt for Livestock (45 lbs.)* ↔ live
    `271`; *Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain* ↔ live `2446`
  - partial: *…Licks for Horses 2 lbs* ↔ live `281` (0.80); *…6 lbs Fine or Coarse Grain
    Pouches* ↔ live `2321` (0.60); *…Pure Natural … (0.5–1mm)* ↔ live `2461` (0.64)
- **1 has no counterpart at all**: *Himalayan Koh 30 lb Red Rock Salt Lick for Cattle*
  (`HK-LB-30LBS`, id `2752`).
- **3 of 13** live products match nothing curated: `HIMALAYAN SALT POUCHES` (id 2367), the
  salt-lamp-ionizer (2295), and `Himalayan Pink Salt Block for Deer` (286).

**Reconciliation plan — SKU-keyed, and nothing below may run before §12.**

1. **Back up the live database and files and verify a restore.** The precondition for
   everything else, and still blocked (§7).
2. **Create a read-only WooCommerce key pair on the apex** (WooCommerce → Settings → Advanced
   → REST API). This turns every `_not readable (no live key)` cell in the comparison into a
   fact — price, SKU and stock for all 13 — and re-running the script produces the complete
   comparison. **Do not reuse the staging pair.**
3. **Assign a SKU to every live product that lacks one, and treat a missing SKU as a stop.**
   Key every import on **SKU**, never on id: the id spaces do not overlap, so an id-keyed
   re-run creates duplicates instead of updating.
4. **Re-run `npm run compare:catalogues` and decide the mapping** — the owner's decision, no
   system change. For each pair: does the curated product *replace* the live one or is it
   *additional*?
5. **Reconcile categories before products, by NAME.** Both installs have a category `75` with
   different meanings (`Uncategorized` vs `Live Stock`), and `105` (`Bulk Order`) exists on
   both. An import that carries term ids will file livestock products under `Uncategorized`
   while appearing to succeed. Create missing terms, then verify the assignment read-back.
6. **Bring the curated products across as drafts first.** Compare price, stock, image count
   and categories against the staging table, then publish. Drafts are invisible to shoppers
   and to the sitemap, so this step costs nothing to get wrong.
7. **Leave every live product published until the owner retires it, one at a time**, with a
   redirect from the retired URL to its replacement. Removing them is an SEO decision, not
   cleanup.
8. **Verify after each change**: the live `/api/catalog` on the Worker (products, prices,
   stock), one product page per shelf, the images through `/wp-content/*`, then the sitemap.
   The shrinking diff from step 4 is the evidence that reconciliation is complete.

## 9. Stripe requirements

Measured from the deployed Worker (`GET /api/stripe/config`, authorized):

```json
{"publishableKeySource":"env","configured":false,"mode":"test","webhookConfigured":false,
 "keyStatus":{"publishable":"live","secret":"missing","webhook":"missing"},
 "chargingBlockedReason":"No Stripe secret key is configured."}
```

- The **publishable** key is live and **pinned as a build input**
  (`PRODUCTION_STRIPE_PUBLISHABLE_KEY` in `scripts/production-target.mjs`, refused unless it
  is `pk_live_`, inlined into a browser-served file, and asserted by
  `scripts/assert-production-config.mjs`). A `pk_test_` value fails the build.
- **Required before charging:** `STRIPE_SECRET_KEY` (live) as a Worker secret, and a live
  webhook signing secret. `chargingBlockedReason` and `mode: "test"` are the proof they are
  still missing; the preview deployment holds a live secret but refuses to charge from a
  non-production origin, which is correct.
- `STRIPE_ALLOW_LIVE` must stay unset until the cutover is approved.
- Nothing in this pass enables charging.

## 10. Shippo status

**Live and working.** With an authorized request (`Bearer`), `POST /api/shippo/rates` returns
`configured: true` with **8 live carrier rates** (USPS 8.27 / 14.46 / 62.51 …, UPS 8.16 / 10.59 …)
for a 2 lb parcel to New York.

Protections in place on the two public shipping routes (both measured live):

- **Origin allowlist**: `Origin: https://evil.example` → **403** `{"error":"Origin not
  allowed."}`. A request with *no* `Origin` is still allowed, deliberately, so server-side
  callers and the repo's own checks keep working.
- **Per-client rate limit** (20 rate / 30 validation requests per minute, keyed on
  `cf-connecting-ip`). Per-isolate, so it bounds one source rather than forming a global quota.
- Both routes are now **behind the access gate** (401 without a credential), which is the
  control that actually closes them.
- Packing logic: `npm run check:packing` and `npm run check:packing-splits` both exit 0.

`npm run check:shippo` cannot pass locally while `.env.local` holds a **live** key: the app
refuses (`502 "Live Shippo API keys cannot be used in staging environment…"`). That refusal is
a safety feature, not a defect — verify Shippo on the deployed Worker instead (command in §14.4).

## 11. Email requirements

`npm run check:email` (read-only DNS over HTTPS; it never sends mail) **exits 1** — not ready:

| Check | Measured |
| --- | --- |
| SPF | **INCOMPLETE** — `v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all` exists and does **not** authorise Resend |
| DKIM (Resend) | **MISSING** — no CNAME at `resend._domainkey.himalayankoh.com`; Resend therefore reports the domain unverified and **rejects the message**, so the failure mode is an empty inbox rather than an error |
| MX | **PRESENT** — `mx{1,2,3}-hosting.jellyfish.systems` (the hosting provider's mail, not Cloudflare Email Routing) |
| DMARC | **ABSENT** — advice, not a blocker |
| Required variables | `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_SEND_ENABLED`, `ADMIN_NOTIFICATION_EMAIL` — all **unset** |

To finish: verify the domain in Resend, add the DKIM CNAME it issues, append
`include:_spf.resend.com` to the **existing** single `v=spf1` record (a second SPF record is
itself a failure), set `RESEND_API_KEY` + `RESEND_FROM` as Worker secrets, then set
`EMAIL_SEND_ENABLED=true` **last**. Until then the deployment sends no mail and claims none.

## 12. Backup and rollback status

**Backup: NONE. Not verified, because it cannot be produced from here.**

- A complete database backup, a complete files/uploads backup, and a copy stored outside the
  production server all require the hosting panel or SFTP for `162.0.209.25` (§7). Nothing was
  attempted, nothing is claimed, and no production data was modified in this pass — so no
  backup was *required* yet.
- What does exist: `docs/production/dns-export-2026-10-08.json` (a DNS + zone-settings export,
  **not** a WordPress backup) and `docs/production/CATALOG-COMPARISON.md` (a read-only view of
  the public catalogue). Neither substitutes for a backup.
- **Rule for GPT-6:** no production database write, and no catalogue import, before a verified
  restore of both the database and the uploads.

**Rollback (routing) status:** the cutover is a routing change, so the routing reference is
the DNS export. As of this pass it is an **API** export (11 records, with record ids and
`proxied` flags) plus zone settings — regenerate with §14.5, and keep a copy of the previous
file (it is in git history).

Zone settings that a cutover or rollback must preserve, and that are **wrong or risky today**:

| Setting | Value now | Note for the cutover |
| --- | --- | --- |
| `ssl` | **flexible** | Cloudflare → origin over plain HTTP. Anything that still fetches the apex or `wp.` origin will do so unencrypted (admin logins included). Move to `full`/`full (strict)` before trusting the origin. |
| `always_use_https` | **off** | `http://` is not redirected. Should be **on** before a storefront that sets `Secure` cookies and expects HTTPS everywhere. |
| `min_tls_version` | `1.0` | Raise to `1.2`. |
| `automatic_https_rewrites`, `opportunistic_encryption` | `on`, `on` | — |
| `security_header` | object (HSTS policy) | Review before the cutover. |
| `cache_level` | `aggressive` | Aggressive caching in front of a WordPress admin is a known hazard; review. |
| `development_mode` | `off` | Leave off. |

**Rollback runbook** (also in `PRODUCTION-REMEDIATION.md` §7): the apex stays WordPress until
the cutover; if the Worker deployment misbehaves after the cutover, re-point the apex
`A`/`CNAME` records from the export file and the site is WordPress again — which is why the
export records ids and `proxied` flags, and why it must be regenerated immediately before any
DNS change.

## 13. DNS status

Zone `himalayankoh.com` (`1f114016cd25da9e12c584e48fbd7f96`), status **active**,
nameservers `denver.ns.cloudflare.com`, `fish.ns.cloudflare.com`. 11 records:

| Type | Name | Target | Proxied |
| --- | --- | --- | --- |
| A | `himalayankoh.com` | `162.0.209.25` | yes |
| A | `mail.himalayankoh.com` | `162.0.209.25` | yes |
| A | `webmail.himalayankoh.com` | `162.0.209.25` | yes |
| A | `wp.himalayankoh.com` | `162.0.209.25` | yes |
| CNAME | `www.himalayankoh.com` | `himalayankoh.com` | yes |
| AAAA | `preview.himalayankoh.com` | `100::` | yes (Workers custom domain) |
| MX ×3 | `himalayankoh.com` | `mx{1,2,3}-hosting.jellyfish.systems` | no |
| TXT | `himalayankoh.com` | SPF | no |
| TXT | `default._domainkey.himalayankoh.com` | hosting provider's DKIM | no |

**DNS write permission is the cutover's hard dependency, and it is not held by the token the
tooling uses.** Measured capability (a `PUT` against a non-existent record id: `404` means
*permitted but no such record*, `403` means *not permitted*; it cannot modify anything):

| Token | DNS read | DNS write | Zone settings read | Workers |
| --- | --- | --- | --- | --- |
| `.env.local` `CLOUDFLARE_API_TOKEN` (token 1) | **200** | 403 | 200 | read |
| `CLOUDFLARE_DNS_TOKEN_2` | 403 | 403 | 200 | — |
| `CLOUDFLARE_DNS_TOKEN_3` | **200** | **404 (permitted)** | 403 | — |
| deploy token (`cf-env`) | 403 | 403 | 200 | **edit** |

So: **token 3 is required to change DNS at the cutover**, token 1 (or the deploy token) is
needed to read zone settings, and no single measured token can do both. Record this in the
cutover checklist; do not discover it during the window.

## 14. Reproducible verification commands

All read-only unless noted. From the repository root, with `.env.local` present.

```bash
# 14.0 — code health (all exit 0)
npm run typecheck          # tsc --noEmit
npm run lint               # 0 errors; 247 pre-existing <img> warnings
npm test                   # 173 files: 168 passed, 5 skipped; 1,869 cases passed, 19 skipped
npm run build              # next build + postbuild origin/secret scans
npm run build:production   # the Worker artifact in dist/ + every production guard

# 14.1 — the backend surfaces
curl -s -o /dev/null -w '%{http_code}\n' https://himalayankoh.com/                      # 200 (WordPress)
curl -s -o /dev/null -w '%{http_code}\n' 'https://himalayankoh.com/wp-json/wp/v2/product?per_page=1'   # 200
curl -s -o /dev/null -w '%{http_code}\n' 'https://himalayankoh.com/wp-json/wc/store/v1/products?per_page=1'  # 500 (the fatal)
curl -s -o /dev/null -w '%{http_code}\n' https://wp.himalayankoh.com/wp-json/           # 404 (no docroot yet)

# 14.2 — WooCommerce credentials (statuses only; the script prints no values)
node scripts/compare-catalogues.mjs        # the pair: apex 401, staging 200 — see the file it writes

# 14.3 — Cloudflare Access availability
curl -s -H "Authorization: Bearer $(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps"   # access.api.error.not_enabled

# 14.4 — the deployed gate (each must match §6)
H=https://himalayan-koh-ecommerce-prod.<account>.workers.dev
curl -s -o /dev/null -w '%{http_code}\n' "$H/"                                          # 401
T=$(grep '^PREVIEW_ACCESS_TOKEN=' .env.local | sed 's/^[^=]*=//' | tr -d '\r')
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" "$H/"             # 200
curl -s -H "Authorization: Bearer $T" "$H/api/version"                                   # b31f47a…
curl -s -H "Authorization: Bearer $T" -X POST "$H/api/shippo/rates" \
  -H 'Origin: https://himalayankoh.com' -H 'Content-Type: application/json' \
  -d '{"address":{"fullName":"P","addressLine1":"1 A St","city":"New York","state":"NY","postalCode":"10001","country":"US"},"items":[{"quantity":1,"weightLbs":2}]}'
# → 200, configured: true, 8 live rates

# 14.5 — the rollback reference (writing it is safe: it is a read-only export to a local file)
CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-) npm run export:dns
# → docs/production/dns-export-<date>.json, source: cloudflare-api
# NOTE: the deploy token cannot read DNS records; the export must use the DNS-capable token above.

# 14.6 — shipping and email
npm run check:packing && npm run check:packing-splits   # exit 0
npm run check:email                                      # exit 1 until Resend is configured
# check:shippo needs a local server (npm run dev:vinext) AND a Shippo test key; a live key is refused by design.
```

## 15. Remaining work, by category

### A. Can be done without new owner credentials (safe, automated)

1. **Re-run the catalogue comparison** at any time (`npm run compare:catalogues`); it is
   read-only and idempotent.
2. **Build the SKU-keyed import as a dry-run tool now** — read the apex (once a key exists),
   read staging, emit the intended create/update plan and refuse any record without a SKU.
   Ship it disabled by default; it must not run until §12 is satisfied.
3. **Add the missing production variables as named secrets** as soon as the owner supplies
   values (`wrangler secret put`), and re-run `npm run deploy:production` — the deploy script
   refuses to attach any route and reads the Worker back afterwards.
4. **Keep the DNS export current** before any routing change (§14.5).
5. **Re-verify the gate matrix** (§14.4) after every deploy.

### B. Requires owner credentials or access

1. **Hosting panel / SFTP for `162.0.209.25`** — unblocks the `wp.` document root, the PHP
   error log (the Store API fatal), and both backups (§7, §12).
2. **A WordPress administrator login on the apex, or a live WooCommerce key pair handed over** —
   unblocks price/SKU/stock for all 13 live products (§8, step 2).
3. **Live `STRIPE_SECRET_KEY`** as a Worker secret, then the webhook signing secret (§9).
4. **Resend**: verified domain, DKIM CNAME value, API key, `RESEND_FROM` (§11).
5. **`ADMIN_LOGIN_ACCOUNTS`** for the production admin console — present in `.env.local`, but
   **not** set on the Worker.
6. **A DNS-write token for the cutover** (`CLOUDFLARE_DNS_TOKEN_3` is the one that has it) or
   the owner performing the record change (§13).

### C. Requires explicit approval (do not do these unattended)

1. **Attaching `himalayankoh.com` / `www.himalayankoh.com` to the Worker** — the cutover
   itself. No route and no custom domain exists today, by design.
2. **Any change to zone settings** — `ssl: flexible` → `full (strict)`, `always_use_https: off`
   → `on`, `min_tls_version: 1.0` → `1.2`. These affect the **live WordPress site** the moment
   they change (§12).
3. **Any DNS record edit on the apex, `www`, `wp.` or `mail`.**
4. **Any catalogue import, overwrite or publish** — after the verified backup (§8, §12).
5. **Retiring live products or adding redirects** — an SEO decision with permanent effects.
6. **Enabling real email sending** (`EMAIL_SEND_ENABLED=true`).
7. **Creating the 6 lb Salt Lick** — still absent from both catalogues; a content decision.

## 16. What this pass did not do

- No public domain cutover, no DNS change, no route or custom domain attached.
- No WordPress database write, no catalogue create/update/delete, no order or customer touch.
- No backup was created or claimed.
- No Stripe charging enabled; no email sending enabled.
- No production secret was set other than the owner-approved `PREVIEW_ACCESS_TOKEN`.

The deployment remains a pre-cutover QA target reachable only at its `*.workers.dev` name,
holding live credentials but closed to unauthenticated callers.
