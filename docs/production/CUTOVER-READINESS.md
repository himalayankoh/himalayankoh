# Cutover readiness — himalayankoh.com, catalogue-only launch

Measured 2026-10-09 (UTC). **The cutover has since been executed** under the owner's approval — see
"The cutover, executed" below. The measurements here are the state they were taken in, and they
remain the baseline a rollback returns to: every hostname still resolves through Cloudflare to the
WordPress origin (`162.0.209.25`), which is what makes the rollback a route deletion rather than a
DNS change.

| | |
| --- | --- |
| Branch | `integration/cloudflare-workers-migration`, pushed to `origin` |
| Commit the artifact was built from | `c10ca502a3ec6fdd2546bb91df1a79e58eb72c44` |
| Deployed Worker | `himalayan-koh-ecommerce-prod`, version `1cca2a70-7597-486b-97b5-3afc319d194a` |
| Deployed build stamp | `/api/version` → `{"sha":"c10ca502a3ec6fdd2546bb91df1a79e58eb72c44","builtAt":"2026-10-09T10:18:57Z"}` |
| Reachable at | `himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev`, `preview.himalayankoh.com` (both behind the preview gate) |
| Attached to `himalayankoh.com` | **Pre-cutover: no.** Two Worker routes were added later the same day (see "The cutover, executed"). |

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
| ROLLBACK | **AVAILABLE and untested in anger** | The apex `A 162.0.209.25` (proxied) and `www CNAME himalayankoh.com` records were never changed, so deleting the two Worker routes returns the apex to WordPress with no DNS edit, no code change and no rebuild; `wp` and the mail records are untouched throughout. |
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

## The cutover, executed

The owner approved the switch on 2026-10-09, with orders disabled and Flexible SSL retained. The
apex and `www` now serve the storefront.

**Two Worker routes, not custom domains.** `himalayankoh.com/*` and `www.himalayankoh.com/*` on
the zone, both pointing at `himalayan-koh-ecommerce-prod`:

| Route | id |
| --- | --- |
| `himalayankoh.com/*` | `9c180ca7628f496ba875178fba6570f9` |
| `www.himalayankoh.com/*` | `d279d7049cdb4cf2810c7d85237f637b` |

A Workers *custom domain* would have had to replace the existing proxied
`A himalayankoh.com 162.0.209.25` record — deleting the rollback target to perform the cutover. A
*route* changes no DNS record at all, so the origin is still exactly where it was and `wp`, `mail.`,
`webmail.`, the three MX records, SPF and DKIM are untouched by construction rather than by care.
Nothing about the built artifact changed: `scripts/assert-production-config.mjs` guards the built
config (which carries no route), so future `npm run deploy:production` runs are unaffected.

### Verified after the switch

28 of 28 checks passed against the **public** domains, with no preview token:

- homepage 200 and the storefront (no PHP header, no `wp-json` link); `/products` 200 with **five**
  products; `?category=live-stock` links exactly its four, `?category=edible-pink-salt` exactly its
  one, with no shelf leaking into the other; `/products/pouches` 200, priced, no cart control.
- two `wp-content/uploads` images 200 `image/jpeg` through the Worker's passthrough.
- `www` 200 over verified HTTPS, **served rather than redirected**: the apex-to-`www` 301 shoppers
  saw before was WordPress's own canonical redirect, and the application does not redirect by host
  (`www.himalayankoh.com` is in `PRODUCTION_HOSTS`, so it is served rather than gated). Same
  storefront, second hostname, canonical pointing at the apex.
- `POST /api/orders/create` 503, `POST /api/stripe/create-payment-intent` 503, `/cart` 307 to
  `/products`, and `POST /api/stripe/webhook` 503 — the new endpoint is still unconfigured, as the
  owner asked.
- the legacy callback answers exactly as WordPress did: `GET /?wc-api=wc_stripe` 200 `-1`,
  `POST /?wc-api=wc_stripe` 204, `POST /?wc-api=unknown_handler_probe` 400 `-1`,
  `GET /wc-api/wc_stripe` 200 `-1`; `GET /wp-json/wp/v2/types` 404, so the bridge is not a proxy.
- the backend on its own hostname: `/wp-login.php`, `/wp-admin/`, `/wp-admin/admin-ajax.php`,
  `/wp-json/`, `/wp-json/wc/store/v1/products` and product media all 200.
- anonymous `GET /api/admin/catalog` and `/api/admin/orders` refused with 401.
- browser QA on the public domain at 1440×900 and 390×844: no console errors, every static chunk
  200, the shelf panel reading "Online ordering is temporarily unavailable", and no add-to-cart
  control anywhere.

### Rollback

Delete the two routes — nothing else:

```bash
node .freebuff/cutover.mjs revert    # removes himalayankoh.com/* and www.himalayankoh.com/*
```

or from the API, `DELETE /zones/<zone>/workers/routes/<id>` for each id above. The apex returns to
WordPress as soon as the last route is gone, because its `A 162.0.209.25` record was never touched.

### Still open after the cutover

- **The hosting renewal** (owner action): `Stellar Plus` for `himalayankoh.com` expires
  **Oct 17, 2026**, auto-renew not set. The storefront keeps working without it, but the WordPress
  backend, `wp-admin`, the WooCommerce API and the legacy callback do not.
- **The backup stays FAIL** until a scratch restore is recorded (see the table above).
- **`scripts/check-production-gate.mjs` now fails by design** — it asserts that no Worker route and
  no custom domain serve the apex, which was the pre-cutover condition this document recorded.
- **The new Stripe endpoint and live checkout** are deliberately not configured.

A Workers custom domain can still be attached later if the owner prefers one; it would only be
done by first replacing the apex `A` record, which is why the route form was chosen for the launch.
