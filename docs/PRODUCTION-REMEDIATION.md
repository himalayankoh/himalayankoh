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
