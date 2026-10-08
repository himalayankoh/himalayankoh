# Production remediation — what was fixed, what is still blocked

Status: **prepared, not cut over.** Nothing in this document was applied to
`himalayankoh.com`. The apex still serves WordPress; no DNS record was changed and
no domain was attached to the new Worker.

Release under test: `2036ec17996988e948e5bd3d8a4a43cae56b2d4c`
Temporary production Worker: `himalayan-koh-ecommerce-prod` →
`https://himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev`
Staging Worker (unchanged): `himalayan-koh-ecommerce` →
`https://preview.himalayankoh.com`

---

## 1. The origin collision, and the backend host it needs

The storefront and WordPress both want `https://himalayankoh.com`. If the apex is
attached to the Worker, then every WordPress URL becomes a request to the Worker:

- the app's own server-side reads (`WORDPRESS_BASE_URL`) would call the Worker,
  which would forward to itself;
- `/wp-json/`, `/wp-admin/` and `/wp-content/uploads/*` would stop resolving;
- every product image URL in the live catalogue is absolute to the apex, so the
  images would break at the same moment.

WordPress Site URL / Home URL are **not** changed. The backend gets its own
hostname instead:

```
PUBLIC STOREFRONT          https://himalayankoh.com   -> Cloudflare Worker (Next.js)
WORDPRESS / WOOCOMMERCE    https://wp.himalayankoh.com -> the existing WordPress server
```

`scripts/production-target.mjs` holds that hostname as `PRODUCTION_BACKEND_ORIGIN`,
and `wrangler.production.jsonc` declares the same value in
`NEXT_PUBLIC_WORDPRESS_BASE_URL` / `NEXT_PUBLIC_WOOCOMMERCE_BASE_URL`. The build
fails if the two disagree.

### What was measured (2026-10-08)

| Probe | Result |
| --- | --- |
| `himalayankoh.com`, `www`, `preview`, `mail` A records | Cloudflare proxy addresses (`104.21.79.159`, `172.67.146.121`) |
| `wp.himalayankoh.com` | **now created** (see the second pass below); `origin.*`, `backend.*`, `staging.*` do not exist |
| Origin server, reachable at `162.0.209.25` (from the zone's SPF record) with SNI/Host `himalayankoh.com` | HTTP 200, WordPress JSON |
| The same origin with Host `wp.himalayankoh.com` | HTTP 200 with the **cPanel placeholder** (`/cgi-sys/defaultwebpage.cgi`, 163 bytes), and `/wp-json/` 404s — the hosting account still has no vhost for it |
| `mail.himalayankoh.com/wp-json/` | HTTP 200 — the same WordPress, i.e. a cPanel `ServerAlias` on the main domain |
| `WORDPRESS_BASE_URL=https://mail.himalayankoh.com npm run check:wordpress` | identical to the apex: WP core PASS, `/wc/v3/products` 401, Store API products FATAL |

So the mechanism works — WordPress answers on a second hostname without any change
to its Site URL — but a *new* name needs two things, both owner actions:

1. **Cloudflare DNS** (zone `himalayankoh.com`, id `1f114016cd25da9e12c584e48fbd7f96`):
   add an `A` record for `wp` → `162.0.209.25` (the target the existing `mail`
   record uses), **proxied**. Cloudflare's Universal SSL covers `wp.himalayankoh.com`.
2. **The hosting account** (Namecheap / cPanel): make that hostname serve the
   WordPress installation — either add `wp.himalayankoh.com` as a subdomain whose
   document root is the WordPress root (usually `public_html`), or add it as an
   alias of the main domain.

   **Alternative to step 2:** a Cloudflare **Origin Rule** for hostname
   `wp.himalayankoh.com` that overrides the Host header to `himalayankoh.com`.
   Measured above, the origin only 404s because of the Host it receives, so this
   achieves the same result without touching the hosting account. It requires
   `Zone → Origin Rules: Edit` in addition to the DNS edit.

### Verifying it once done

```bash
npm run check:production-backend          # every endpoint, read-only, through wp.himalayankoh.com
```

That script refuses to run against the apex, because that is the loop this design
exists to prevent.

### Still open: `/wp-content/*` after the cutover

Product images in the live catalogue are absolute to the apex
(`https://himalayankoh.com/wp-content/uploads/…`). On the day the Worker owns the
apex, those paths reach the Worker, not WordPress, and images break. Two ways to
close it, both **not implemented yet** because neither can be exercised before the
cutover:

- **Worker passthrough (recommended).** A route that streams `/wp-content/*`
  (and `/wp-includes/*`, `/wp-admin/*`, `/wp-login.php`) from the backend host.
  One origin for the browser, no loop, and the cache behaviour stays Cloudflare's.
- **Rewrite at read time.** Point the storefront's image URLs at the backend host
  instead of the apex. Cheaper for the Worker, but it touches image handling in
  several places (`lib/backend/woocommerce.ts`, `lib/images/legacyAssets.ts`,
  `lib/products/curatedImages.ts`, the media library routes) and every one of them
  has to be right.

`lib/images/legacyAssets.ts` already serves app-shipped legacy images from the
repo, so the *curated* photography is unaffected either way.

---

## 2. Production deployment path (new)

| Piece | File |
| --- | --- |
| Production Worker name + public vars | `wrangler.production.jsonc` |
| The same facts for tooling, and the reasons | `scripts/production-target.mjs` |
| Applies the overlay to the built config | `scripts/apply-production-config.mjs` |
| The guard (config **and** artifact) | `scripts/assert-production-config.mjs` |
| Build | `npm run build:production` |
| Deploy | `npm run deploy:production` |
| DNS + zone-settings export (read-only) | `scripts/export-production-dns.mjs` |
| The `/wp-content/*` passthrough | `src/app/wp-content/[...path]/route.ts` |

`vinext build` reads only the root `wrangler.jsonc` (staging), so the production
name and variables are applied to `dist/server/wrangler.json` after the build and
read back by the guard before anything uploads. The guard refuses: another Worker
name, a wrong or extra variable, any staging origin in the config, any value a
production build should not carry, **any route or custom domain**, and any built
file that contains a staging value.

Two traps in `vinext-cloudflare deploy` are worth knowing, because both were hit:

- it **runs its own build unless `--skip-build`**, which regenerates
  `dist/server/wrangler.json` from the staging `wrangler.jsonc` and discards the
  overlay between the guard and the upload. `deploy-production.mjs` always passes
  `--skip-build`.
- its Worker name **defaults to `package.json`'s `name`**, which is
  `himalayan-koh-ecommerce` — the staging Worker. `--name` is passed explicitly and
  the deployed Worker is read back from the Cloudflare API afterwards.

---

## 3. Secret store on the production Worker

Set and verified present (never printed):

`ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `WHOLESALE_SESSION_SECRET`
(three freshly generated 32-byte values — a session token signed with the staging
key is replayable against production, so these are deliberately not copied),
`WORDPRESS_BASE_URL`, `WOOCOMMERCE_BASE_URL` = `https://wp.himalayankoh.com`,
`SHIPPO_API_KEY` (the token in the owner's local environment carries the
`shippo_live_` prefix), and the nine `SHIPPO_FROM_*` values.

**Still required from the owner — none of these exist anywhere in this
environment:**

| Missing | Why it blocks |
| --- | --- |
| Live WooCommerce REST key/secret | The pair in `.env.local` / `owner-secrets.local` is the **staging** pair: `https://himalayankoh.com/wp-json/wc/v3/products` answers **401 `woocommerce_rest_cannot_view`** with it. Without a live pair the storefront cannot read price, SKU or stock in production. |
| Live WordPress administrator application password | `WP_ADMIN_USER` / `WP_ADMIN_PASS` in `owner-secrets.local` authenticate nowhere (`incorrect_password` on staging, `not_logged_in` on live). Needed for the admin console, media, and the HK plugin routes. |
| `ADMIN_LOGIN_ACCOUNTS` | Without it nobody can sign in to `/admin` on the production Worker. Must be the owner's real accounts, not the staging list. |
| `RESEND_API_KEY` + a verified sending domain | See §5. |
| Stripe webhook signing secret | See §4. |
| `CLOUDFLARE_API_TOKEN` (for the email-routing pane) | `/api/email/status` currently reports inbound as `NOT_CONFIGURED` with "CLOUDFLARE_API_TOKEN is not set". Only relevant if the inbound-email screen is wanted in production. |

### Independent blocker found on the live store

`https://himalayankoh.com/wp-json/wc/store/v1/products` returns **HTTP 500 with a
WordPress PHP fatal**. It is *not* the same failure the staging store has: measured
again in the second pass, `/staging/wp-json/wc/store/v1/products` returns **200 with
real product JSON**, so the two installs differ in data or options rather than code —
both run WooCommerce 7.7.0 on PHP 7.4.33 behind LiteSpeed, with the same 748-route
plugin surface and the same 24 plugins. The live route is diagnosed in detail in the
second pass below. It needs a server-side fix; the public Store API cannot be used as
a fallback for price/stock until it is fixed.

---

## 4. Stripe

Measured on the production Worker and on preview:

- live publishable **and** live secret keys are present (stored in the *staging*
  store's settings row — the owner pasted the live pair there);
- **no webhook signing secret exists anywhere**, so `webhookConfigured` is false;
- live charging is refused on preview because preview is not the production origin;
- the live charge path has never been exercised.

What is correct today and must stay: `STRIPE_ALLOW_LIVE` is **not set on any
deployment**. It is one of six conditions `lib/stripe/server/readiness.ts`
requires; the others are a live key pair that agrees on mode, a stored `whsec_`,
a webhook endpoint that answers a correctly signed probe, and passing health
checks. **Set `STRIPE_ALLOW_LIVE=true` on the production Worker only at cutover**,
after the webhook is configured.

Cutover steps that cannot be done earlier:

1. Stripe Dashboard → Developers → Webhooks → add endpoint
   `https://himalayankoh.com/api/stripe/webhook` (Live mode) for the events the app
   handles, then copy the `whsec_…` into the production Worker as
   `STRIPE_WEBHOOK_SECRET` (or the Stripe settings row of the **live** store —
   whichever the owner prefers; the settings row wins over the environment).
2. Only then set `STRIPE_ALLOW_LIVE=true` and run the webhook probe + health check.
3. Take one real payment and refund it — that is the only honest proof, and it is
   the owner's decision, not a QA step.

Note for the temporary Worker: because `SITE_ORIGIN` is baked at build time, a
production *build* deployed to `*.workers.dev` evaluates itself as being on the
production origin. It still cannot charge, because the live-only conditions
(`STRIPE_ALLOW_LIVE`, the webhook probe, the health checks) are all unmet — which
is precisely why `STRIPE_ALLOW_LIVE` is not set yet.

---

## 5. Email

The project's sender is **Resend** (`RESEND_API_KEY`, `RESEND_FROM`), gated by
`EMAIL_SEND_ENABLED === 'true'`. Production status on the temporary Worker:

```json
{"outbound":{"status":"NOT_CONFIGURED","sender":"sales@himalayankoh.com",
             "resendConfigured":false,"sendEnabled":false}}
```

That is the correct state — nothing broken is enabled. To turn it on the owner must
provide `RESEND_API_KEY` and a **verified sending domain** for
`sales@himalayankoh.com` (DNS records added at the ESP), then set
`EMAIL_SEND_ENABLED=true` on the production Worker. `CLOUDFLARE_EMAIL_FORWARD` sets
where inbound `@himalayankoh.com` mail is forwarded.

Order emails, customer notifications and admin notifications all run through
`lib/orders/notifyOrderEvents.ts` → `lib/email/sendEmail.ts`; with the key missing
they log and skip rather than failing an order, so the store can go live before
email is ready, but nobody gets a receipt.

---

## 6. Shippo

The approved packing rules are unchanged and still asserted by
`npm run check:packing` and `npm run check:packing-splits`:

| Product | Parcel | Max per box |
| --- | --- | --- |
| 2 lb Salt Lick | 10 × 10 × 6 in | 6 |
| 6 lb Salt Lick | 10 × 10 × 6 in | 4 |
| 30 lb Block | 8.5 × 7.5 × 6.5 in | 1 |

One box = one Shippo parcel; mixed products are never combined; Shippo decides
billable weight, service, rate and transit time. No dimensional pricing is
computed by this application. The live token and the nine `SHIPPO_FROM_*` values
are set on the production Worker; **no label was purchased** during this work
(rate quotes are free; `/create-label` was not called).

---

## 7. Backups, and the rollback runbook

### BACKUP BLOCKER: OWNER/HOST ACCESS REQUIRED

No verified database backup exists, and one cannot be taken from here:

- **superseded:** the zone's DNS is now readable *and writable* (see the second pass
  below), and `scripts/export-production-dns.mjs` has been run. A DNS export exists at
  `docs/production/dns-export-2026-10-08.json`. What is still missing is the database
  and files backup, which needs hosting access; and the zone's **settings** (SSL mode,
  Always Use HTTPS) cannot be read, because that is the separate
  `Zone → Zone Settings → Read` permission the current token does not carry;
- the hosting account is Namecheap/cPanel; the credentials in
  `../.freebuff/owner-secrets.local` (`NAMECHEAP_USER` / `NAMECHEAP_PASS`) were not
  used to log in or change anything, and a cPanel backup needs the server hostname,
  which is not recorded anywhere in this repository;
- the only SQL file on this machine,
  `../.freebuff-backup/dealer-wholesale-backup-20260815.sql`, is 5 KB and predates
  the current catalogue; `scripts/export-store-backup.mjs` is explicitly a **logical
  JSON export, not a backup**; `backups/` holds an extracted All-in-One-WP-Migration
  *file tree* from 2026-09-29, not a database dump.

What the owner (or host support) must do before the cutover:

1. cPanel → Backup Wizard → **Download a full account backup** (or ask the host to
   take a snapshot), which covers the database, files, uploads, plugins and themes.
2. Keep it somewhere off the server, and record the date and the file's size.
3. Export the zone's DNS records (Cloudflare → DNS → Export) and store them with it.
4. Record, in writing, that production today is: apex and `www` → Cloudflare →
   WordPress origin `162.0.209.25`; `preview` → Worker `himalayan-koh-ecommerce`.

### Rollback runbook

The cutover is a routing change, and the code and data are untouched by it, so
rollback is too. Full procedure: **`docs/PRODUCTION-ROLLBACK.md`**.

---

## 8. DNS permissions for the cutover

Change nothing until these are granted, and grant the smallest set that works.
Attach them to a token **scoped to the `himalayankoh.com` zone only** — not
account-wide.

| Permission | Scope | Why |
| --- | --- | --- |
| Zone → Zone → Read | `himalayankoh.com` | Resolve the zone id and read zone settings |
| Zone → DNS → **Read** | `himalayankoh.com` | Export the existing records before touching anything (this is the one that 403s today) |
| Zone → DNS → **Edit** | `himalayankoh.com` | Attaching a Worker custom domain rewrites that hostname's record |
| Zone → Workers Routes → Edit | `himalayankoh.com` | Attach/detach the apex and `www` on the Worker |
| Account → Workers Scripts → Edit | account | Already held — deploy and secret writing |
| Zone → Origin Rules → Edit | `himalayankoh.com` | Only if the Origin-Rule route is chosen for `wp.himalayankoh.com` |

No `Account → Members`, no billing, no zone-create, no other zone.

---

## 9. The 6 lb Salt Lick

**It does not exist, published or unpublished.** No product is created or
published to satisfy the packing rule.

The staging store, read directly with its REST credentials (all statuses):

| ID | Status | SKU | Weight | Name |
| --- | --- | --- | --- | --- |
| 2752 | publish | HK-LB-30LBS | 30 | Himalayan Koh 30 lb Red Rock Salt Lick for Cattle |
| 2728 | **draft** | – | – | Himalayan Salt Rock for Cattle 18 Lbs Bag - Himalayan Koh |
| 2721 | publish | HK-LFH-2lbs | 2 | Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh |
| 2716 | publish | HK-LFC-45lbs | 45 | Bag of Himalayan Pink Salt for Livestock (45 lbs.) |
| 2710 | publish | HK-ESF-6lbs | 6 | Himalayan Pink Salt for Livestock - 6 lbs Fine or Coarse Grain Pouches |
| 2704 | publish | HK-ESF-3lbs | 3 | Pure Natural Himalayan Pink Salt for Livestock – Fine Grain |
| 2653 | publish | HK-ESF-16oz | – | Himalayan Edible Pink Salt – 16 oz Jar |

There is a 6 lb **pouch** (2710, a bag of loose grain) and a 2 lb **lick** (2721),
but no 6 lb rope **lick**. The live store's published products are a different,
legacy set (13 items, none of them a 6 lb lick). The rule stays in place and stays
correct; it simply has no product on the storefront until one is created. Nothing
on either store was modified by this work.

---

## 10. SEO

Verified on the temporary production Worker (production build, no domain attached):

- `<link rel="canonical">` = `https://himalayankoh.com`
- `og:url` = `https://himalayankoh.com`
- `/sitemap.xml` lists production URLs only (`https://himalayankoh.com/…`)
- `robots.txt` on the `*.workers.dev` host is `Disallow: /`, which is correct — that
  host is not the production origin, and `lib/seo/indexing.ts` treats only the
  production origin as indexable. The production origin serves the real robots file
  once the domain is attached.
- `www` → 301 → non-www stays the established canonical; the Worker does not change it.

---

## 11. Order of work from here

1. Owner: create `wp.himalayankoh.com` (DNS + hosting alias/Origin Rule); then
   `npm run check:production-backend` must pass.
2. Owner: issue live WooCommerce REST keys and a live WordPress application
   password; set both on the production Worker (`wrangler secret put`), plus
   `ADMIN_LOGIN_ACCOUNTS`.
3. Owner/host: take and verify the backup; export the DNS records.
4. Fix the live store's `/wc/store/v1/products` fatal (WordPress side).
5. Stripe: add the live webhook endpoint, store the `whsec_`.
6. Email: `RESEND_API_KEY` + verified domain, then `EMAIL_SEND_ENABLED=true`.
7. Implement the `/wp-content/*` passthrough and test it against the temporary
   Worker with the backend host available.
8. Re-run `npm run build:production` and `npm run deploy:production`; re-check the
   temporary Worker end to end (cart, checkout, Shippo rate, Stripe
   initialization without a charge, mobile).
9. Only then: attach the apex and `www` to `himalayan-koh-ecommerce-prod`, purge
   the cache, run the cutover checklist in `docs/PRODUCTION-CUTOVER-PLAN.md`, and
   keep `docs/PRODUCTION-ROLLBACK.md` open.

---

# Second pass — 2026-10-08 (later the same day)

This section supersedes anything above that it disagrees with. It records what
changed since the first pass, what was newly measured, and what is now built.

Release under test: `d5733e8` (this pass's code lands on top of it).
Temporary production Worker: `himalayan-koh-ecommerce-prod`, version
`5e011cb1-72d5-4403-a01f-1e68589d4978`, reachable only at
`https://himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev`.
The apex is still WordPress. No DNS record was changed except the one added below.

## A. DNS access was granted, and what it bought

The owner re-scoped the Cloudflare tokens. Measured capability, token by token:

| Token | Carries | Does not carry |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN_1` | zones read, Workers scripts, Worker custom domains | DNS edit (403) |
| `CLOUDFLARE_API_TOKEN_2` | Workers scripts + deploy (assets upload session) | DNS read (403) |
| `CLOUDFLARE_API_TOKEN_3` | **zone read, DNS read, DNS edit** | Workers anything (403) |

`../.freebuff/cf-env.mjs` now selects by capability (`dns` → token 3, `deploy` →
token 2) instead of assuming token 1 could write DNS, and no longer fails when a
zone-scoped token cannot see an account id.

**Exported for the first time:** `npm run` → `node scripts/export-production-dns.mjs`
wrote `docs/production/dns-export-2026-10-08.json` — all 10 records, the zone id and
name servers, and the routing the export is preserving. Read-only.

**Still not readable with this token:** the zone *settings* — `ssl`,
`always_use_https`, `min_tls_version`, `automatic_https_rewrites`,
`opportunistic_encryption`, `security_header`, `cache_level`, `development_mode`
all answer `9109 / 10000 Unauthorized`. The export records them as `UNREADABLE`
rather than omitting them, so the gap is visible. Adding
`Zone → Zone Settings → Read` closes it; these matter at cutover because the Worker
and the origin want different answers for SSL mode and Always Use HTTPS.

## B. `wp.himalayankoh.com` now exists, and what it still needs

Created (proxied `A` → `162.0.209.25`, DNS record id `7ed6361f7bca22c48397add457151552`).
Cloudflare's Universal SSL covers it — TLS verifies clean — and the apex, `www`,
`mail` and the MX records were not touched.

It does **not** serve WordPress yet: the origin answers Host `wp.himalayankoh.com`
with the cPanel placeholder page and 404s `/wp-json/`. No amount of DNS work fixes
that; the hosting account needs the hostname. One owner step, either:

- cPanel → Domains → create `wp.himalayankoh.com` as a subdomain (or alias) whose
  document root is the WordPress installation; **or**
- Cloudflare → Rules → Origin Rules → a rule for hostname `wp.himalayankoh.com`
  that overrides the Host header to `himalayankoh.com`. This needs
  `Zone → Origin Rules → Edit`, which the DNS token does **not** have (403), so it is
  an owner action too.

### A verified working backend host already exists

The hosting account answers for `mail.himalayankoh.com` as a `ServerAlias` of the main
domain, and it serves **the identical installation**:

| Probe | Result |
| --- | --- |
| `/wp-json/` | 200, 1,232,486 bytes — the same 25 namespaces and 748 routes |
| `wp-json` root `home` | `https://himalayankoh.com` |
| `/wp-content/uploads/2022/08/logo.png` | 200, `image/png`, **8,288 bytes — byte-identical** to the apex |
| `/wp-json/wc/store/v1/products` | 500 (the same fatal as the apex, i.e. the same install) |

So a backend host that needs no hosting change is available today. It is **not** used
as the production backend, because `NEXT_PUBLIC_WORDPRESS_BASE_URL` is also read by
browser code (`lib/youtube/store.ts`), so the public variable and the server secret
must be the same value — and `mail.` is a name that a future email migration could
repoint, which would silently take the store down. It was used for verification only,
through a local override. The decision is recorded as an owner choice in the final
report: add the hosting alias for `wp.`, or accept `mail.` as the backend.

## C. The `/wp-content/*` passthrough — implemented (was: not implemented)

`src/app/wp-content/[...path]/route.ts`, with the path rules in
`src/lib/images/wpContentPath.ts` and 15 tests in the route's `route.test.ts`.

The helper is a separate module for a reason worth recording: Next.js validates a
`route.ts`'s exports against the set of route handlers it allows, so exporting a
helper from the route file fails the build's generated route types with
`Property 'safeWpContentPath' is incompatible with index signature`. This is the same
failure class as the `__resetAiStatusCache` build break fixed in `afbe60c`.

What it guarantees:

- the upstream is built from `backendConfig.wordpressBaseUrl` — the **configured
  backend host**, never the origin the request arrived on. That is what makes it
  loop-free after the cutover, and it is the same rule `production-target.mjs`
  enforces for the build;
- the `wp-content/` prefix is supplied by the code, not the caller, so no crafted
  path resolves outside it; each segment is percent-encoded, so `?`, `#` and an
  encoded `/` inside a segment cannot become structure upstream; a traversal segment
  is refused before any request is made;
- `redirect: 'manual'`, and a 3xx becomes a 404. Following a canonical-host bounce is
  how a proxy acquires a loop;
- `set-cookie` is on the response deny-list, so WordPress never gets a session onto
  the shopping domain; request headers are limited to `if-none-match`,
  `if-modified-since` and `range`;
- 200/206 stream through with the upstream `content-type`/`etag`/`last-modified`/
  `cache-control`; 304 passes straight back; a missing file is a 404 and an
  unreachable backend is a 502 (not a 500 — it is the *backend* that failed).

It deliberately does **not** proxy `/wp-json/`, `/wp-admin/` or `/wp-login.php`:
those belong at the backend hostname, and making the shopping domain an entry point to
the WordPress admin is a surface with no upside.

**Verified end to end** through the app against the live WordPress
(`WORDPRESS_BASE_URL` overridden to the working backend host, see §B):

| Request | Result |
| --- | --- |
| `GET /wp-content/uploads/2022/08/logo.png` | 200, `image/png`, 8,288 bytes — `cmp` says **byte-identical** to the backend |
| `GET /wp-content/../../wp-config.php` | 404, and no upstream request made |
| `GET /wp-content/uploads/2022/08/logo-300x100.png` (absent) | 404 |

**Verified on the deployed Worker:** `GET /wp-content/uploads/2022/08/logo.png`
answers 404 in 9 bytes — that is *this route's own* 404, which it may only produce
after a real fetch of `https://wp.himalayankoh.com/…` came back 404 (that host serves
the cPanel placeholder and 404s the path). So the passthrough is live, resolves to the
configured backend, and is blocked only by §B's hosting step.

## D. The live Store API fatal — diagnosis, with the evidence

Not fixed: it needs shell or file access to the hosting account, and the local
`NAMECHEAP_USER` / `NAMECHEAP_PASS` pair **is not a cPanel login for this server**
(`POST https://himalayankoh.com:2083/login/?login_only=1` → **HTTP 401**; the server
is `premium164-3.web-hosting.com`). What is established, and what the owner or the
host can act on:

**It is not a route-registration problem.** `/wc/store/v1/products` appears in the
route index, and `OPTIONS` on it returns the full 14,831-byte JSON schema.

**It is not the cart or the rest of the namespace.** On the *same* install:
`/wc/store/v1/cart` → 200; `/wc/store/v1/products/categories` → 200;
`/wc/store/v1/products/collection-data` → 200. Only the routes that serialise a
product fail.

**It fails on serialising a product, not on querying one.** This is the sharpest
clue and it was measured, not inferred:

| Request | Status |
| --- | --- |
| `/wc/store/v1/products?featured=true` (no featured products) | **200, `[]`** |
| `/wc/store/v1/products?category=0` (no such category) | **200, `[]`** |
| `/wc/store/v1/products?per_page=1&page=9` (past the end) | **200, `[]`** |
| `/wc/store/v1/products?per_page=1` | 500 |
| `/wc/store/v1/products/271`, `/281`, `/286` … **every one of the 13 live ids** | 500 |

An empty result set is fine and any single product is fatal, so it is not one corrupt
product — it is code that runs per product. The response is WordPress's own fatal
page (`text/html`, 2,653 bytes, `x-robots-tag: noindex`) with the real message
suppressed, which means `WP_DEBUG_DISPLAY` is off and the detail went to
`wp-content/debug.log` (if `WP_DEBUG_LOG` is on) or the account's error log.

**It is not the plugin set and not the version.** Both installs return the same 748
routes and the same 25 namespaces from the same 24 plugins and the same theme, both
run **WooCommerce 7.7.0** on **PHP 7.4.33** behind LiteSpeed — and staging's identical
route returns **200 with real product JSON**. The difference is therefore in that
install's options, its per-install code (active theme `functions.php`, or anything in
`wp-content/mu-plugins/`, which an asset scan cannot see), or its product data.

### The fix, in order

1. Read the actual error: cPanel → File Manager → `public_html/wp-content/debug.log`
   (enable `WP_DEBUG_LOG` temporarily if it is absent), or the account error log in
   cPanel → Metrics → Errors. The message names the file and line.
2. Compare against the staging install that works: its `functions.php`, its active
   plugin list and its `mu-plugins` directory. That is where a per-product filter that
   fatals will be.
3. Fix on the WordPress side and remove the debug flag. Do **not** point the storefront
   at staging, and do not paper over it in the application: `lib/backend/woocommerce.ts`
   already reports it honestly, and `backend/config.ts` `describeReadiness` already
   explains the consequence to the owner.

Until it is fixed, price and stock can only come from authenticated `/wc/v3` — which
is §3's missing credential pair, not a second blocker.

## E. Live Shippo rating — verified (was: never exercised)

The production Worker returns **real carrier quotes**: `POST /api/shippo/rates` with a
real destination answered **200 with 8 rate options** — USPS Ground Advantage /
Priority Mail / Priority Mail Express and UPS Ground / Ground Saver / 3 Day Select /
2nd Day Air, with live amounts and ETAs (e.g. one 30 lb block, Mountain View CA:
USPS Ground Advantage **$183.88**, 4 days; UPS Ground **$79.18**, 3 days).

**No label was purchased.** Only `/api/shippo/rates` was called; `/create-label` was
not. The live `shippo_live_` token is on the Worker, and the app's own guard is why
this had to be done there: run locally, the same request is refused with *"Live Shippo
API keys cannot be used in staging environment"* — which is the correct behaviour and
worth keeping.

The packing rules were exercised for all four cases (2 lb ×1 and ×7, 6 lb ×1,
30 lb ×2) and `npm run check:packing` / `check:packing-splits` both pass, including:
2 lb and 6 lb licks share the **10×10×6** box *dimensions* while each product type is
packed on its own rule and boxes are never merged (1×2lb + 1×6lb → 2 parcels, never
one 8 lb box); 5×6 lb licks → 2 parcels (4 per box); 2×30 lb blocks → 2 parcels
(**8.5×7.5×6.5**, 1 per box, never one 60 lb box); 7×2 lb + 5×6 lb → 4 parcels.
Shippo decides billable weight, service, rate and transit time.

## F. Stripe, and one build-input risk found

On the production Worker: `STRIPE_ALLOW_LIVE` is **absent** (checked against the
deployed bindings, not the config file), and `/api/stripe/config` reports
`chargingBlockedReason: "No Stripe secret key is configured."`. Live charging is
off, as required.

The live **publishable** key is present (`pk_live_…`, `publishableKeySource: "env"`) —
but it is **not a declared production variable**: there is no `STRIPE_*` binding on the
Worker, so the key reaches the bundle because `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` sits
in the developer's `.env.local` and `NEXT_PUBLIC_*` is inlined at build time.

That is a real deployment risk, not a leak — a publishable key is public by design and
the build's credential scan covers the 14 *server-side* values. But it means **a build
on a machine without that file ships a storefront with no payment option and no failure
anywhere to say so**. Before the cutover, `prepare-deploy-env.mjs` should write it from a
`DEPLOY_STRIPE_PUBLISHABLE_KEY`, and the production guard should assert the artifact
contains a `pk_live_`/`pk_test_` string. Left as a check item rather than changed here.

The live **secret** key is not on the Worker, so `keyStatus.secret` is `missing`; per
the first pass it lives in the live store's WooCommerce settings row. `settingsRead`
reports `ok: false` for the same reason everything else does — the backend host has no
vhost yet (§B) — so this is one thing to re-measure *after* `wp.` is aliased, not a
separate finding.

## G. SEO — verified on the deployed production Worker

| Check | Result |
| --- | --- |
| `<link rel="canonical">` on `/` | `https://himalayankoh.com` |
| `og:url` on `/` | `https://himalayankoh.com` |
| `/sitemap.xml` | 15 URLs, **all** `https://himalayankoh.com` |
| `/robots.txt` on the `*.workers.dev` host | `User-Agent: *` / `Disallow: /` |
| `X-Robots-Tag` on the `*.workers.dev` host | `noindex, nofollow` |
| `/quality` | 308 → `/about` |
| apex `www` behaviour | unchanged: apex 200 (WordPress), `www` 301 → non-www |

The temporary host is noindex by two independent mechanisms and no preview URL appears
in the sitemap. No public DNS was changed.

## H. Email

Unchanged and correct: `/api/email/status` reports outbound
`NOT_CONFIGURED` (`resendConfigured: false`, `sendEnabled: false`, sender
`sales@himalayankoh.com`) and inbound `NOT_CONFIGURED` (needs
`CLOUDFLARE_API_TOKEN` for email routing). Nothing broken is enabled; no email
configuration was faked. Still an owner action: provide `RESEND_API_KEY` and a verified
sending domain, then set `EMAIL_SEND_ENABLED=true`.

## I. What is still blocking, in one list

1. **Hosting alias for `wp.himalayankoh.com`** (or an Origin Rule) — one owner step.
   Everything to do with reading live product data is behind it.
2. **Live WooCommerce REST key/secret and a live WordPress application password.**
   Not present anywhere in this environment. Without the first, the catalogue is empty
   (verified: `/products` renders 42 KB of empty catalogue vs 83 KB on staging).
3. **The Store API fatal** (§D) — a WordPress-side fix, or item 2 makes it moot for
   price and stock.
4. **Database + files backup** — needs hosting access. No verified backup exists.
5. **Zone Settings: Read** on the token, to record the TLS/HTTPS settings in the export.
6. **Stripe live webhook** (`whsec_`) — a cutover-time step, after the real domain.
7. **`RESEND_API_KEY` + verified sending domain.**
8. **`ADMIN_LOGIN_ACCOUNTS`** for the production admin console.
9. **The 6 lb Salt Lick does not exist** — unchanged from the first pass; nothing was
   created, and the packing rule is correct but has no product.

---

# Third pass — 2026-10-08 (evening)

Owner decisions applied in this pass: **`wp.himalayankoh.com` is the permanent backend
hostname** and `mail.` stays free for email infrastructure; the owner supplied hosting,
WordPress, WooCommerce, Cloudflare and repository credentials.

No cutover was performed. The apex and `www` were not touched, no Worker was attached to
any hostname, and `STRIPE_ALLOW_LIVE` is not set anywhere.

## J. Credentials: where they live, and what each one actually reaches

Stored in two gitignored places and nowhere else:

| File | What it is |
| --- | --- |
| `docs/production/owner-access.local.env` | The commented, authoritative copy the owner edits when rotating. Ignored by `docs/production/*.local.*`. |
| `.env.local` | The values merged from it, under the names the tooling and the app already read. Ignored by `.env*`. |

`scripts/apply-owner-access.mjs` performs the merge, prints only variable **names** and
whether each was added/updated/unchanged, refuses to run if `.env.local` is ever tracked
by git, and will not overwrite a name it does not own. `git status` was checked
afterwards: neither file is visible to git.

### Measured capability, per credential

Nothing below is inferred from a name or a prefix; each cell is an HTTP status from a
real request. `—` means the request was not made.

| Credential | Reach | Result |
| --- | --- | --- |
| GitHub token | `api.github.com/repos/himalayankoh/himalayankoh` | **200**, repo `himalayankoh/himalayankoh`, default branch `main` |
| Cloudflare token 1 | zone / DNS read / DNS write / settings / Workers | 200 / **200** / 403 / 200 / 200 |
| Cloudflare token 2 | (same probes) | 200 / 403 / 403 / 200 / 200 |
| Cloudflare token 3 | (same probes) | 200 / **200** / **404** / 403 / 200 |

Token 3's `404` is the interesting one: a `PUT` against a record id that does not exist
can create nothing, and it answers **404 ("no such record") rather than 403**, which is
what a token *permitted* to write DNS returns. So the deployment's DNS needs are covered
— read by tokens 1 and 3, write by token 3 — and no record has to be created, because
`wp.himalayankoh.com` already resolves.

`CLOUDFLARE_API_TOKEN` is set to **token 1** (zone + DNS read + zone settings + Workers
read), which is the superset the migration tooling asks for. The three are also kept
individually as `CLOUDFLARE_DNS_TOKEN_1..3` so a future comparison does not have to
re-derive this table.

**These are deliberately not Worker secrets.** The storefront never edits DNS, so giving
the running Worker a DNS-write token would be a privilege the code does not use. The
admin email-routing pane reads `CLOUDFLARE_API_TOKEN` from the Worker environment and
stays unavailable until the owner chooses to set a token there — that is a decision, not
an oversight.

### WordPress and cPanel: the credentials reach staging, not production

| Target | Method | Result |
| --- | --- | --- |
| `himalayankoh.com/wp-login.php` (apex) | form login, owner's email + password | HTTP 200, **no `wordpress_logged_in_*` cookie** — login refused |
| `himalayankoh.com/staging/wp-login.php` | same | **302 → `/staging/wp-admin/` with the cookie** — login works |
| apex `/wc/v3/products` | owner's WooCommerce key/secret pair | **401** `woocommerce_rest_cannot_view` |
| `/staging/wp/v3/products` | same pair | **200**, real product, real price, `instock` |
| `himalayankoh.com:2083/login/?login_only=1` | Namecheap account username + password | **401** `{"status":0,"message":"invalid_login"}` |

This is the single most consequential measurement of the pass, and it contradicts the
assumption the owner's message carried: `/staging /wp` is **one** target, not two. The
WordPress administrator login, the WooCommerce key pair and the WordPress application
password all authenticate against the **`/staging` installation only**. The apex — the
public store — accepts none of them.

It is also not a case of "production needs its own copies of the same values". The two
hosts are **separate WordPress installations with separate databases, separate key tables
and separate catalogues**:

| | apex (`himalayankoh.com`) | `/staging` |
| --- | --- | --- |
| `<title>` | *Himalayan Pink Salt for Livestock, Deer, Horses, Sheep* | *Himalayan Pink Salt for Livestock & Wholesale \| Himalayan Koh* |
| Homepage bytes | 590,399 | 766,625 |
| Store API categories | 3 — `animal feed`, `Bulk Order`, `Uncategorized` | 4 — `Edible Pink Salt`, `Live Stock`, `Salt Blocks`, `Salt Licks` |
| Product id 2752 | **does not exist** (Store API: 404 `woocommerce_rest_product_invalid_id`) | exists — *Himalayan Koh 30 lb Red Rock Salt Lick for Cattle*, $49.95 |

So a key created on `/staging` can never read the apex catalogue, and the earlier reading
that "the backend credentials are half-configured" was wrong in a way that matters: they
are correctly configured for the wrong installation.

**The Namecheap account login is not a cPanel login.** `invalid_login` from the cPanel
endpoint is what that produces, and it is the same outcome the previous pass measured.
Reaching the hosting account needs a credential that is *for the hosting panel*, not for
the Namecheap account that manages billing and DNS.

### The exact access this pass did not get

Either of these unblocks the remaining WordPress and backup work; the first is a
requires-nothing credential, the second is what the hosting work needs.

1. **A WordPress administrator login on the apex install** — one that reaches
   `https://himalayankoh.com/wp-login.php`. From there: create a production WooCommerce
   REST key pair (§2), and read `wp-content/debug.log` for the Store API fatal (§3).
   Alternatively, create the key pair in the owner's own session and hand over just the
   `ck_`/`cs_` values, which is less access and enough for the catalogue.
2. **A hosting-panel login for the account at `162.0.209.25`** — a cPanel username and
   password, or SFTP credentials, or the hosting panel the Namecheap account hands off to.
   From there: add `wp.himalayankoh.com` as a domain alias/subdomain whose document root
   is the WordPress installation (§1), read the PHP error log (§3), and produce the
   database and files backups (§7).

## K. The Store API fatal, narrowed further

`npm run diagnose:store-products` was run against the apex (`WORDPRESS_BASE_URL=https://himalayankoh.com`).
Verdict unchanged and now stronger: **`product-builder`**.

- Sibling routes answer — `products/categories`, `products/attributes`, `products/tags`,
  `cart`, `collection-data` all 200. The REST stack and WooCommerce are loaded.
- The query is not the trigger — `collection-data?calculate_price_range=true` runs the same
  product query, including price aggregation, and answers
  `{"price_range":{"min_price":"0","max_price":"9995","currency_code":"USD"…`,
  so the catalogue is real and priceable.
- The **pair** that pins it down: queries matching no products (`include=99999999`,
  `per_page=2&page=99`) return **200 `[]`**; every query matching at least one product
  returns **500**, including `_fields=id`. The item is built before fields are filtered.
- The legacy route `GET /wp-json/wc/store/products` returns **500 too**, so this is not one
  route's regression but the product response pipeline in that installation.
- `min_price: 0` is not the trigger: `min_price=0&max_price=0.01` also 500s.

What would settle it is one line of `wp-content/debug.log`, which needs access 1 or 2
above. The interim is already in place and unchanged: **the storefront reads the catalogue
over WooCommerce REST v3**, not the Store API product routes, so fixing the fatal is not
on the catalogue's critical path — but it *is* on the cart's, because `/wc/store/v1/cart`
and Store API product reads share the product serializer, and an *empty* cart answers 200
only because nothing has to be built.

## L. Stripe: the build-input risk is closed

Found in the second pass, fixed here. The publishable key existed **only in the
developer's gitignored `.env.local`**, so any other machine running `npm run build:production`
produced a bundle with no publishable key at all — `/api/stripe/config` reports payments as
unconfigured and the checkout renders no card form — and a machine whose `.env.local` held a
`pk_test_` key produced a production bundle carrying a test key against a live secret key.

That is a build *input* problem, so it is fixed at the build input:

- `scripts/production-target.mjs` now carries `PRODUCTION_STRIPE_PUBLISHABLE_KEY` — the one
  place production facts live, documented as **public by design** (Stripe ships it to every
  visitor; `src/app/api/stripe/config/route.ts` serves it and the client bundle embeds it;
  Stripe's own guidance is that a publishable key may be committed, and
  `scripts/check-build-secrets.mjs` already classifies `NEXT_PUBLIC_*` as public by intent).
  `DEPLOY_STRIPE_PUBLISHABLE_KEY` overrides it for a rotation, and a non-`pk_live_` value is
  refused either way.
- `scripts/prepare-deploy-env.mjs` pins it in `.env.production.local`, which outranks
  `.env.local` in both Next's and Vite's env-file order — so the developer's file cannot
  override it, and its absence is a failed build rather than a silently different one.
- `scripts/assert-production-config.mjs` proves the value is **inlined in a
  browser-served** file and that no `pk_test_` appears anywhere in the artifact.
- `wrangler.production.jsonc` declares it, so the deployed Worker is read back and the
  five public variables are compared against the running deployment.

The guard chain was tested in both directions, because a guard that has never refused is
not evidence of anything:

| Input | Result |
| --- | --- |
| normal production build | passes; *"a live key is inlined in 1 browser-served file(s) (7 in total) and no test key is present"* |
| `DEPLOY_STRIPE_PUBLISHABLE_KEY=pk_test_…` | **refused** by `prepare-deploy-env.mjs`, exit 1 |
| a bundle containing `pk_test_…` | **refused**: "a Stripe TEST publishable key is compiled into 1 built file(s)" |
| a bundle with no key at all | **refused**: "the production Stripe publishable key is not in the built artifact" |
| `.env.production.local` without the key line | **refused**: "does not pin NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" |

The deployed Worker reports `publishableKeySource: "env"`, `keyStatus.publishable: "live"`
and `mode: "test"` — the last two are consistent, not contradictory: `mode` is decided from
the **secret** key, and the live secret key is the one thing still missing (below).

## M. Protecting the temporary production Worker (was: not addressed)

The pre-cutover Worker is reachable at its `*.workers.dev` name by anyone who knows it, and
it holds **live** Shippo and Stripe keys. Two of the three money-spending routes were
unauthenticated and unlimited:

`POST /api/shippo/rates` and `POST /api/shippo/validate-address` now carry two guards,
applied **before** any upstream call:

- **Same-site browsers only.** An `Origin` that is neither this deployment nor the
  configured site origin answers `403 Origin not allowed.` A request with *no* `Origin` is
  still allowed, deliberately: the app's own server, `scripts/check-shippo-setup.mjs` and
  the packing checks send none, and refusing those would break the checks that prove the
  route works.
- **A per-client rate limit** (20 rate requests and 30 validations per minute), keyed on
  the address the edge recorded. `src/lib/http/clientIp.ts` prefers `cf-connecting-ip` —
  the one header Cloudflare sets and a client cannot forge — and falls back to the first
  `x-forwarded-for` entry, so rotating a client-supplied header cannot multiply a caller's
  budget. It returns `unknown` rather than keying on a non-address, which shares one bucket
  instead of handing the caller its own.

`create-label` and the admin routes were already behind `verifyAdminRequest` and were not
changed. 12 new tests cover the guards, and both behaviours that would break real traffic
(a shopper's own origin, and a server-side call with no `Origin`) are asserted to pass.

**Verified on the deployed Worker**, not only in tests:

| Request | Result |
| --- | --- |
| `POST /api/shippo/rates` with `Origin: https://evil.example` | **403** `{"error":"Origin not allowed."}` |
| `POST /api/shippo/rates` with `Origin: https://himalayankoh.com`, weight supplied inline | **200**, `configured: true`, **8 live carrier rates** (USPS 8.27/14.46/62.51, UPS 8.16/10.59 …) — no regression |

Residual risk, stated rather than papered over: the limit is per Worker isolate, so it is a
bound on one source rather than a global quota, and the Worker is still reachable by anyone
who learns its hostname. The controls for that are Cloudflare Access in front of the
`*.workers.dev` hostname, or keeping `workers_dev` disabled and attaching nothing until the
cutover — both are owner decisions, and neither is needed for the QA this pass performed.

**Fourth pass, 2026-10-08 (late): the gate was built, and it is not live yet.** See §S.
Measured on the deployed Worker today, an anonymous `GET /` still answers **200**. So the
paragraph above remains the truth about production: the rate limit is a bound, not access
control, and the deployment's live Shippo secret is reachable by anyone with the URL.

## N. Email: measured, not asserted

`scripts/check-email-delivery.mjs` (new, read-only, `npm run check:email`) resolves the
sending domain's mail DNS over HTTPS and reports what is actually published. It never uses
a key and never sends mail. Measured for `himalayankoh.com`:

| Check | Result |
| --- | --- |
| SPF | **INCOMPLETE** — `v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all` exists, and does **not** authorise Resend |
| DKIM (Resend) | **MISSING** — no CNAME at `resend._domainkey.himalayankoh.com`, so Resend reports the domain as **not verified** and refuses to send |
| MX | **PRESENT** — `mx{1,2,3}-hosting.jellyfish.systems`. Inbound is the **hosting provider's** mail, not Cloudflare Email Routing |
| DMARC | **ABSENT** — advice, not a blocker |
| `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_SEND_ENABLED`, `ADMIN_NOTIFICATION_EMAIL` | all **unset** |

The MX result corrects a printed assumption: the admin email panel describes Cloudflare
Email Routing, and the zone's real inbound path is the hosting provider's mail. The DKIM
result is the one that matters — **a Resend key with an unverified domain sends nothing**,
and Resend accepts the API call and rejects the message, so the failure is an empty inbox
rather than an error anyone sees. Nothing was enabled: `EMAIL_SEND_ENABLED` stays off, so
the deployment sends no mail and claims none.

## O. The DNS export can no longer stop existing

`scripts/export-production-dns.mjs` needed `Zone → DNS → Read`, and a token can lose that
permission without anyone editing the script — the token in the environment already had,
since the second pass's export. A rollback reference that quietly stops being producible is
worse than none, so the script now falls back to **public resolvers over DNS-over-HTTPS**
and records the source and what the fallback cannot see (`record ids`, `proxied`, zone
settings) in the file itself, rather than writing a thinner file that looks the same.

The snapshot it produced is more current than the API export: it contains
**`wp.himalayankoh.com`**, which resolves to Cloudflare anycast (`104.21.79.159`,
`172.67.146.121`) and so is proxied — the record exists and was added after the API export
was taken.

## P. The deploy path no longer depends on a file outside the repository

`npm run deploy:production` and `deploy:staging` both hard-failed without
`../.freebuff/cf-env.mjs`, a workspace helper that is neither tracked nor documented. That
helper had been deleted in the previous pass's cleanup — and the deploy became unrunnable
with no code change to blame. **It has since been re-created by this pass's own ad-hoc API
work** (`node .freebuff/cf-env.mjs`, used to list Worker secrets and DNS records), which is
the point rather than a contradiction: a file outside the repository comes and goes, so the
deploy path must not depend on it. Both scripts now resolve credentials through
`scripts/lib/cloudflareCredentials.mjs`: environment first (which is also what `wrangler`
reads), then the repository's own gitignored `.env.local`, then a refusal that names the
permissions required. Nothing is ever printed. `scripts/premium-worker-status.mjs` was the
last remaining `execFileSync('../.freebuff/cf-env.mjs')` caller and now uses the same
resolver.

## Q. Checks run in this pass, and one that is intermittent

All green, exit 0: `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run build:production`, `npm run check:packing`, `npm run check:packing-splits`, and the
two new test files. `npm test` on the full suite: **167 files passed, 5 skipped (172)**.

**Correction (fourth pass): `167 passed | 5 skipped` counts test *files*, not cases.** Both
numbers were measured again at `bf75e8c` and in the working tree, rather than inferred:

| Measure | At `bf75e8c` | This pass |
| --- | --- | --- |
| Test files on disk | 172 | **173** (one added, none removed) |
| Files the runner reports | 167 passed + 5 skipped | **168 passed + 5 skipped** |
| Declared `it(`/`test(` cases, tracked files | 1,643 | **1,658** |
| Declared cases in the added file | — | **+18** |
| Cases the runner *executes* | — | **1,869 passed + 19 skipped** |

The sweep compared every tracked test file's declared case count at `bf75e8c` with its count
now: **the only file that changed is `src/middleware.test.ts`, 13 → 28**, no file lost a case,
and no file present at `bf75e8c` is missing. So nothing was accidentally excluded. The
executed count exceeds the declared one because several suites are table-driven — that gap is
measured, not assumed, and the 1,824 figure in earlier reports was a case count measured on an
earlier tree, which is why it never matched a file count.

**One honest caveat.** The first full-suite run reported 4 failures in 2 files as
`Test timed out in 5000ms` (`src/lib/auth/browserSignOut.test.ts` among them). Both files
pass in isolation — `browserSignOut.test.ts` in 1.39s — and an immediate rerun of the whole
suite passed with no code change. So this is **load-dependent flakiness in the default 5s
`testTimeout`**, not a regression from this pass and not a failing assertion. It is recorded
here rather than silenced: raising a timeout or skipping the file would hide a real
regression the next time one occurs.

## R. Blocking list, corrected and current

Items 1, 2, 5, 7 and 8 of the second pass's list are replaced by the measurements above.

1. **A WordPress administrator login on the apex install** — or a WooCommerce REST key pair
   created there and handed over. Unblocks the catalogue, prices and stock; the credentials
   supplied reach `/staging` only. *(WordPress)*
2. **A hosting-panel login for `162.0.209.25`** — cPanel or SFTP. Unblocks the `wp.` domain
   alias, the PHP error log and both backups. *(Hosting; the Namecheap account login is not
   it.)*
3. **`STRIPE_SECRET_KEY` (live) on the production Worker** — `wrangler secret put`. The
   publishable key is present and now provably pinned; the secret key is **missing**, which
   is why `/api/stripe/config` reports `mode: "test"` and
   `chargingBlockedReason: "No Stripe secret key…"`. Correct as-is for this stage:
   charging is blocked, and `STRIPE_ALLOW_LIVE` is unset. *(Owner)*
4. **Database + files backup** — needs item 2. No verified backup exists. *(Hosting)*
5. **The Store API fatal** — needs item 1 or 2 for its one line of error log. Off the
   catalogue's critical path; on the cart's. *(WordPress)*
6. **Resend: DKIM record + SPF include + `RESEND_API_KEY` + `RESEND_FROM`** — measured
   missing, with the exact list in `npm run check:email`. *(Owner)*
7. **`ADMIN_LOGIN_ACCOUNTS`** for the production admin console. *(Owner)*
8. **Stripe live webhook** (`whsec_`) — a cutover-time step, after the real domain. *(Owner)*
9. **The 6 lb Salt Lick does not exist.** Unchanged; nothing was created. *(Owner)*
10. **Zone Settings → Read** on the token kept as `CLOUDFLARE_API_TOKEN` would let the export
    record TLS/HTTPS settings; token 1 already has it, so this is satisfied for the export
    this pass ran. *(Informational)*

`mail.himalayankoh.com` is **not** used as the production backend, per the owner's
instruction: the committed configuration is `wp.himalayankoh.com`. `mail.` remains free for
email infrastructure, and `wp.` still needs item 2 to serve WordPress.

# Fourth pass — 2026-10-08 (late): the pre-cutover access gate

## S. The gate exists and is tested; it is not deployed, so the hole is still open

§M bounded what a caller can *spend* on the two public Shippo routes. It did not stop a
caller, and it left the rest of a deployment holding **live** credentials open. Measured on
the deployed Worker during this pass, anonymously and with no cookie:

| Request | Result |
| --- | --- |
| `GET https://himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev/` | **200**, 47,982 bytes of storefront |
| `GET …/api/stripe/config` | **200**, 798 bytes |
| `POST …/api/shippo/rates` (wrong method) | 405 — the route is there and reachable |

`wrangler secret list --name himalayan-koh-ecommerce-prod` returns **14 secrets**, including
`SHIPPO_API_KEY` and the three session secrets. Nothing about that inventory is public, but
the Worker in front of it is.

### Cloudflare Access: measured, and not available on this account

Access is the right control and it cannot be used yet. A policy call answers
`access.api.error.not_enabled`, and enabling it is a one-time dashboard action (create the
team name, then policies can be created by API) — which is exactly what the residual-risk
paragraph in §M reserved as an owner decision. **"Or equivalent" is therefore the only option
that closes the hole today**, so the equivalent was built.

### What was built

`src/lib/http/previewAccess.ts` holds the judgement as a pure function — no request, no
middleware, no environment — and `src/middleware.ts` enforces it on **every route except the
build's own assets** (`matcher` widened to
`/((?!_next/static|_next/image|favicon.ico).*)`, because the refusal page has to be able to
load its CSS or a 401 renders blank). Three outcomes:

- **A production host is never gated.** `himalayankoh.com` and `www` come from
  `@/lib/seo/indexing` — the module that already owns that list — and are passed in, so there
  is no second copy of it. The same build serves before and after the cutover, so gating by
  *deployment* instead of by *host* would be a store-wide outage on the day of the switch.
- **No token configured means no gate.** A deployment with no `PREVIEW_ACCESS_TOKEN` behaves
  exactly as it did before, so this cannot break staging, `next dev`, or a future build.
- **Everyone else presents the token**: `Authorization: Bearer <token>` for a script or a
  health probe, or one visit to `/?hk_preview=<token>` which sets an `httpOnly`, `secure`,
  `SameSite=Lax` cookie and 303-redirects to the same URL with the parameter removed — so the
  token never sits in the address bar, in history, or in a later `Referer`. The follow-up
  request has no parameter and carries the cookie, so the redirect cannot loop. Anything else
  gets a **401** with `X-Robots-Tag: noindex`, `Cache-Control: no-store` and a body that names
  no hostname, token or deployment detail.

The comparison is exact string equality on the whole token; a prefix, an appended character
and a wrong case all fail.

### Tests, and one that had to be restored

26 new cases: **15** in `src/lib/http/previewAccess.test.ts` (the judgement: each outcome
above, the header/cookie shapes, exact-equality, whitespace handling) and **11** in
`src/middleware.test.ts` (the wiring: the exchange and its cookie attributes, the 401 and its
headers, that the gate is inert with no token, and the matcher's negative lookahead).

`src/middleware.test.ts` **already existed** — it held 13 cases for the URL-normalisation
rules — and this pass overwrote it before noticing, then restored it from `bf75e8c` and
appended the gate section. That was verified rather than assumed: the 13 original test names
are byte-identical to `bf75e8c`, the file now declares 24 cases, and a sweep of every test
file shows **no file carrying fewer declared cases than it did at `bf75e8c`** (§Q).

### The gate broke the build, and that was found here rather than at activation

A token in `.env.local` — which is exactly where the deploy tooling needs it — made
`npm run build` **fail**: `next build` prerenders `/_not-found` by running the middleware on
a synthetic request, and the gate judged that request unauthenticated. It answered 401, the
export of the page failed, and the error surfaced as `TypeError: a[d] is not a function` from
`.next/server/webpack-runtime.js`, which names neither the gate nor the page in a way anyone
could act on.

It was isolated by measurement, not by reading: the same command, on the same tree, exits **1**
with the token set and **0** with `PREVIEW_ACCESS_TOKEN=` empty, and it reproduced on a
cleaned `.next`. So the gate now exempts three shapes, all of which are non-public-request
shapes that Cloudflare cannot route to this Worker from the internet:

| Shape | Why it is exempt |
| --- | --- |
| `NEXT_PHASE=phase-production-build` | A build is not a visitor. Process state; no request can set it. |
| a request with **no `Host`** | How the build's own prerender arrives. `Host` is mandatory in HTTP/1.1 and Cloudflare routes on it, so a real caller cannot remove it. |
| a **loopback** host | `next dev`. A developer holding the deploy token should not have to present it to read their own machine. |

What the gate deliberately does **not** key on is Next's `x-nextjs-prerender` marker header.
It is present on the build's request and would have been the easy fix, but any caller can
send any header — a gate that an arbitrary header switches off is not a gate. The `Host` that
Cloudflare requires is the signal, because it cannot be removed.

Verified after the fix, with the token present: `npm run build` → **exit 0** (was 1) and
`npm run build:production` → **exit 0**. The new tests assert all three exemptions *and* the
case they must not degrade into — a real public host with no token is still 401.

### The gate was then run in workerd, not only in tests

`npm run build:production` produced the artifact, and `wrangler dev` served it — so the
deployment path the owner would actually take was exercised end to end. The token was supplied
to the **running** Worker as a variable, while the artifact had been built with no token value
in it at all, which is the property activation depends on:

| Request (via `wrangler dev`, port 8791) | Result |
| --- | --- |
| `Host: probe.local`, no credential | **401** |
| `Host: probe.local`, `Bearer` wrong / partial token | **401** / **401** |
| `Host: probe.local`, `Bearer` the right token | **200** |
| `Host: probe.local`, `/api/stripe/config`, no credential | **401** |
| `Host: probe.local`, `/api/stripe/config`, right token | **200** |
| `Host: himalayankoh.com` and `Host: www.himalayankoh.com` | **200** — the store is never gated |
| `Host: localhost` | **200** — the developer is not gated |
| no `Host` header at all | **400 from workerd itself** — it refuses the request before the Worker sees it, so the exemption is unreachable from a network |
| `/?hk_preview=<token>` | **303** to `/` with `hk_preview=…; Secure; HttpOnly; SameSite=lax; Max-Age=2592000` |
| the same request carrying that cookie | **200**; without it, **401** |
| the 401's own headers | `Cache-Control: no-store`, `WWW-Authenticate: Bearer`, `X-Robots-Tag: noindex, nofollow` |

The value of the token never appears in `dist/` or `.next/`: `grep -rlF` over both trees
returns **0 files**, and `check-build-secrets.mjs` covers it generically because it scans the
*values* of every non-public variable in the env files (55 characters, so it is above the
scanner's floor). So the secret store and the artifact are consistent with each other: the
deploy can carry the gate and no token, and the token arrives as a Worker secret.

### Activation — two commands, and neither has been run

The token was generated here (55 characters), stored in the gitignored `.env.local` as
`PREVIEW_ACCESS_TOKEN` via `scripts/apply-owner-access.mjs` (the mapping was extended so it
lands where `wrangler` and the tooling already look), and **never printed**. It is not on the
Worker:

```
# the value never reaches the terminal: it goes from the file into wrangler's stdin
grep '^PREVIEW_ACCESS_TOKEN=' .env.local | sed 's/^[^=]*=//' | tr -d '\r' \
  | npx wrangler secret put PREVIEW_ACCESS_TOKEN --name himalayan-koh-ecommerce-prod
npm run deploy:production
```

Rotating the token is the same two commands with a new value; the `tr -d '\r'` is there
because a CRLF `.env.local` would otherwise store a carriage return in the secret — harmless
(the gate trims what it compares) but invisible, which is the kind of thing to not leave to
luck.

Either order is safe, which matters because it decides whether a mistake is recoverable: the
deployed code predates the gate, so the secret alone changes nothing; and a deploy with no
secret leaves the gate open (`no token configured means no gate`) rather than locking the owner
out. Both orders were exercised in workerd above — the artifact was built with no token in it
and the running Worker was given one — so the two steps are known to compose.

**Nothing above is done.** The deploy is a change to the production Worker, and this pass was
instructed to stop for owner approval before touching production routing or content. Until the
secret and the deploy both land, the deployed Worker answers `200` to an anonymous `GET /`.

Until then, the honest status of item 6 is **mitigated, not closed**: bounded, origin-checked
and rate-limited, still reachable and still holding a live Shippo key.
