# Cutover readiness — himalayankoh.com, catalogue-only launch

Measured 2026-10-09 (UTC). Read-only unless an item says otherwise. **Nothing production-facing
has been changed**: `himalayankoh.com`, `www.himalayankoh.com` and `wp.himalayankoh.com` all still
resolve through Cloudflare to the WordPress origin (`162.0.209.25`), and the apex still serves
WordPress.

| | |
| --- | --- |
| Branch | `integration/cloudflare-workers-migration`, pushed to `origin` |
| Commit the artifact was built from | `c10ca502a3ec6fdd2546bb91df1a79e58eb72c44` |
| Deployed Worker | `himalayan-koh-ecommerce-prod`, version `1cca2a70-7597-486b-97b5-3afc319d194a` |
| Deployed build stamp | `/api/version` → `{"sha":"c10ca502a3ec6fdd2546bb91df1a79e58eb72c44","builtAt":"2026-10-09T10:18:57Z"}` |
| Reachable at | `himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev`, `preview.himalayankoh.com` (both behind the preview gate) |
| Attached to `himalayankoh.com` | **No.** No Worker route and no custom domain for the apex or `www`. |

The invariant is *the deployed artifact matches a committed revision*, and the way to read it is
`/api/version`'s `sha` against that commit — not naive equality with `HEAD`. A commit that changes
no build input (this document is one) cannot alter the artifact, and the guards
(`scripts/assert-production-config.mjs`, `scripts/check-build-secrets.mjs`) compare the built
output rather than the tree.

## The check list

| Check | State | Evidence |
| --- | --- | --- |
| PRODUCTION BUILD | **PASS** | `npm run build:production`: overlay applied (`name=himalayan-koh-ecommerce-prod`, backend `https://wp.himalayankoh.com`, `STOREFRONT_ORDERS_PAUSED=true`), config asserted, no staging value compiled in, live Stripe publishable key inlined and no test key, no loopback origin, no server credential in 1178 built files. |
| TYPECHECK / LINT / TESTS | **PASS** | `tsc --noEmit` 0 errors; `next lint` 0 errors; `vitest run` 1951 passed, 19 skipped (integration tests that need live credentials), 173 files. |
| PRODUCTS | **PASS** | `/api/catalog` returns the five launch records: 2446 jar `$9.95` (3 images), 2321 pouches `$17.95` (8), 271 livestock bag `$99.95` (5), 281 horse licks `$9.95–$17.95` (7), 291 cattle rock `$49.95` (9). All `in_stock`. |
| IMAGES | **PASS** | Every product page's first image returned `200 image/jpeg` from the WordPress uploads tree. |
| SHELVES (product-ID filing) | **PASS** | `/products?category=live-stock` links exactly `pouches`, `bag-of-salt-for-livestock-45-lbs`, `salt-licks-for-horses`, `rock-of-salt` with the panel count **4** and the breadcrumb/eyebrow `Live Stock`; `/products?category=edible-pink-salt` links only `himalayan-edible-pink-salt` (`Edible Pink Salt`); neither page renders the other shelf's cards. The unfiled 6 lb livestock pouches and 16 oz jar are filed by record id (`lib/categoryContent/storedFiling.ts`), not by their titles. |
| ORDERS DISABLED | **PASS** | `POST /api/orders/create` → `503` with the catalogue-only message, before the body is read; `POST /api/stripe/create-payment-intent` → `503`; `POST /api/stripe/webhook` → `503` (`STRIPE_WEBHOOK_SECRET` not configured — the new endpoint is deliberately not live); `/cart` → `307` to `/products`; every card and product page renders a **disabled** `Ordering unavailable` control and no cart promise. |
| LEGACY STRIPE WEBHOOK | **PASS (verified against the live install)** | `GET /?wc-api=wc_stripe` → `200 "-1"`, `POST /?wc-api=wc_stripe` → `204`, `POST /?wc-api=unknown_handler_probe` → `400 "-1"`, `GET /wc-api/wc_stripe` → `200 "-1"` — **byte-identical to what the live apex answers today**. `GET /wp-json/wp/v2/types` is *not* relayed (the app answers 404), so the bridge is a callback surface, not a WordPress proxy. `/api/stripe/webhook` is never relayed. |
| BACKEND | **PASS** | On `wp.himalayankoh.com`: `/wp-login.php` 200, `/wp-admin/` 200, `/wp-admin/admin-ajax.php` 200, `/wp-json/` 200, `/wp-json/wp/v2/product` 200, `/wp-json/wc/store/v1/products` 200, `/wp-content/uploads/…` 200. The login and admin pages contain **no** `himalayankoh.com`-hosted URLs, so the admin does not depend on the apex. Only `/` redirects to the apex, which is what a backend hostname should do. |
| SSL | **PASS for the launch path** | Edge certificates verified with SNI and chain validation: `himalayankoh.com` (SAN `himalayankoh.com`, `preview.himalayankoh.com`), `www.himalayankoh.com` and `wp.himalayankoh.com` (SAN `himalayankoh.com`, `*.himalayankoh.com`) — all three `authorized=true`, TLSv1.3. Nothing on the launch path lacks a valid certificate, and the apex/`www` will terminate at Cloudflare's edge once attached to the Worker. |
| DNS / MAIL | **PASS** | Zone export (12 records, `docs/production/` sibling of this file): 3 MX (`mx1/2/3-hosting.jellyfish.systems`, DNS-only), SPF `v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all`, DKIM `default._domainkey`. No DMARC record exists (pre-existing). None of these names is touched by attaching a Worker to the apex or `www`. |
| ROLLBACK | **READY, not executed** | Apex `A 162.0.209.25` (proxied) and `www CNAME himalayankoh.com` are the values to restore. Detaching the two Worker custom domains and re-creating that A record returns the apex to WordPress with no code change and no rebuild; `wp` and the mail records are untouched throughout. |
| HOSTING CONTINUITY | **OWNER ACTION** | Namecheap → Hosting Subscriptions: `himalayankoh.com` — plan *Stellar Plus*, status **EXPIRING**, **Auto-Renew not set**, expires **Oct 17, 2026** (8 days out). The domain itself is `ACTIVE`, auto-renew on, expiring Aug 10, 2027. The WordPress backend this launch depends on must be renewed by the owner. |
| BACKUP | **FAIL (per this repository's own rule)** | `node scripts/verify-backup.mjs --db ../hk-backups/2026-10-08/himaljpz_dbigyg59kmwnws.sql.gz --files ../hk-backups/2026-10-08/` → 14 PASS, 1 FAIL, 1 PARTIAL: the dump (67.5 MiB decompressed, 320 tables, orders present), the split files archives, `wp-config.php` and the checksums all verify, but **no restore into a scratch database is recorded** (§4.5). No local MySQL/MariaDB or Docker is available on this machine, so §4.5 cannot be run from here; `docs/production/BACKUP-RESTORE-VERIFICATION.md` keeps the item at FAIL until it is. |

## The SSL question, answered

The pending Namecheap certificate is **not** the launch blocker it was assumed to be.

- **PositiveSSL 29701772** (`Secures himalayankoh.com, www.himalayankoh.com`) is **PENDING**,
  validation method HTTP, managed through cPanel's SSL auto-installer, CA order `2360423220`.
  Its sibling `29701771` is **CANCELED**. It does **not** cover `wp.himalayankoh.com`.
- The origin server itself presents `*.web-hosting.com` (Sectigo DV, valid to Dec 18, 2026) for
  every SNI, which does **not** match `himalayankoh.com`. That is why the zone can only be
  `ssl = flexible` today, and why **Full (strict) cannot be switched on without first installing a
  certificate that covers the hostnames on the origin** — an Origin CA certificate covers
  `himalayankoh.com` and `*.himalayankoh.com` (so `wp` too), which the PositiveSSL does not.
- Switching `ssl` is a zone-wide setting and was **not** changed. It is optional hardening: the
  storefront terminates at Cloudflare's edge, and `wp.himalayankoh.com` stays on the origin.

## What the cutover would be

1. Attach Cloudflare **Worker custom domains** `himalayankoh.com` and `www.himalayankoh.com` to
   `himalayan-koh-ecommerce-prod` — the same mechanism that already serves
   `preview.himalayankoh.com` (`AAAA 100::`, proxied).
2. Leave `wp.himalayankoh.com`, `mail.`, `webmail.`, the three MX records, SPF and DKIM exactly as
   they are.
3. Verify, in this order: homepage, `/products`, both shelves, one product page per shelf, images,
   HTTPS on apex and `www`, `wp.himalayankoh.com/wp-admin/`,
   `wp.himalayankoh.com/?wc-api=wc_stripe` (the legacy callback), `/api/orders/create` (must stay
   503), and mobile at 390 px.

   **`www` is one thing to know in advance.** Today's `www → apex` 301 comes from WordPress
   (`x-redirect-by: WordPress`), not from a Cloudflare rule — and the zone's rulesets could not be
   read with the credentials here (HTTP 403), so a rule of that kind can be neither confirmed nor
   ruled out. The application itself does not redirect by host: `www.himalayankoh.com` is in
   `PRODUCTION_HOSTS` (`lib/seo/indexing.ts`) so it is served rather than gated, and its canonical
   and metadata name the apex. After the cutover, `www` therefore serves the same storefront under
   a second hostname rather than bouncing to the apex. That is a cosmetic duplicate, not a broken
   page, and making it a redirect is a one-rule change in `middleware.ts` if the owner wants it —
   it is not a launch requirement and is not done here.

Rollback, if any of those fails: detach the two custom domains and re-create
`A himalayankoh.com 162.0.209.25` proxied.

**Nothing in this document authorises the cutover. It needs the owner's explicit approval, and
the hosting renewal above needs the owner's decision either way.**
