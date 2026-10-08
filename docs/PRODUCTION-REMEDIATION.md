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
| `wp.himalayankoh.com`, `origin.*`, `backend.*`, `staging.*` | NXDOMAIN — they do not exist |
| Origin server, reachable at `162.0.209.25` (from the zone's SPF record) with SNI/Host `himalayankoh.com` | HTTP 200, WordPress JSON |
| The same origin with Host `wp.himalayankoh.com` | **HTTP 404** — the hosting account has no vhost for it |
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
WordPress PHP fatal** — the same failure the staging store has, on the live store.
The public Store API cannot be used as a fallback for price/stock. It needs a
server-side diagnosis (`WP_DEBUG_LOG`, then `wp-content/debug.log`; the usual cause
is a plugin filtering Store API product output). This is a WordPress-side fix, not
an application one.

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

- the Cloudflare token cannot read DNS (`GET /zones/{id}/dns_records` → **403**), so
  the current records cannot even be exported;
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
