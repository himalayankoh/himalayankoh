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
| Deployed Worker, after the post-cutover fixes | version `a2dbefd7-cb7c-49cb-8a8a-2b1e876cb9bb`, built from commit `9a45a8288acc79bbae2c4c0afe1e10f8f77fdb45` — `/api/version` reads back that `sha`, which is the invariant this document defines |
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
| BACKUP | **PASS** | `node scripts/verify-backup.mjs --db ../hk-backups/2026-10-08/himaljpz_dbigyg59kmwnws.sql.gz --files ../hk-backups/2026-10-08/ --restore-evidence docs/production/backup-restore-evidence-2026-10-09.txt` → **16 passed, 0 failed, 0 partial**: the dump (320 tables, 257 INSERTs, orders present), both archives, `wp-config.php` and the checksums verify, and the restore into an isolated local MariaDB 11.4.13 is recorded (§4.5). The FAIL this row carried was the check being run **without** `--restore-evidence` while the evidence file was already on disk — the verifier reports a missing record, not a failed restore. |

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
- `www` 200 over verified HTTPS, **served rather than redirected** — the state as measured on the
  day. The application now collapses `www` onto the apex with a 301 instead (see "Superseded on
  2026-10-09" below), so this line describes an earlier build.
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

### Superseded on 2026-10-09 (later the same day)

- **The backup is PASS**, not FAIL: the restore is recorded in
  `docs/production/backup-restore-evidence-2026-10-09.txt`, and the verifier was simply being run
  without `--restore-evidence`. With it: **16 passed, 0 failed** (see the table above).
- **`www` now redirects to the apex.** The "served rather than redirected" measurement above was of
  the build deployed at the cutover. Serving one storefront on two hostnames meant two URLs for
  every page — the canonical tag pointed at the apex while the response itself was 200 on `www`,
  which is the duplicate-content shape a crawler acts on. The app now answers `www` with a 301 that
  preserves path and query (`src/lib/http/canonicalHost.ts`, applied in `src/middleware.ts`).
  Verified against the live origin: `www/`, `www/products`, `www/products?category=live-stock`,
  `www/products/pouches`, `www/?utm_source=…` and `www/blog?page=2&sort=Date` all 301 to the same
  path and query on the apex, and following the redirect ends at a 200 with no loop.

## Post-cutover defects, found and closed (2026-10-09)

### 1. The sign-in route answered with the deployment's own configuration — FIXED

`POST /api/auth/customer/login` is unauthenticated by necessity: a shopper reaches it before they
are a customer. It was answering

```json
{"error":"WordPress is not connected for the app: set WORDPRESS_ADMIN_USER and WORDPRESS_ADMIN_APP_PASSWORD in the server environment (create the password under Users → Profile → Application Passwords)."}
```

HTTP `503`, to anyone who asked, and the login modal rendered it to the shopper. The cause was real —
the production Worker held 17 secrets and neither of those two — but the *message* was written for an
operator and the boundary did not distinguish the two audiences.

Fixed in two places:

- **The cause:** the two variables are now set on `himalayan-koh-ecommerce-prod` (19 secret
  bindings; presence verified, values never printed).
- **The class:** `src/lib/http/publicError.ts` — a server module may hand a route operator-facing
  text, and `publicMessage` logs it under a context label and returns a sentence about the
  shopper's situation instead. Applied at every publicly-reachable boundary that could carry a
  configuration name: customer auth (`wordpressCustomerAuth.ts`), the wishlist routes and the
  address routes, `/api/cart` and `/api/orders/create`. Admin-only surfaces are deliberately left
  alone: their audience is the operator, which is the same reason LeadOS "fails loudly".

Sweeping the class found a second instance in the same two routes, which the first fix had not
touched: sign-in and sign-up refuse *before* WordPress is reached when `CUSTOMER_SESSION_SECRET` is
unset, and both answered with that variable's name. They now return the same sentence the
WordPress-failure branches use (`customerAccountsUnavailable`), so a shopper cannot tell the two
causes apart and learns neither. `src/app/api/auth/customer/register/route.test.ts` is new — that
route had no test — and asserts the **response body**, which is what a stranger sees.

Tests: `src/lib/http/publicError.test.ts` (the rule), and the auth, wishlist and address routes now
assert the variable names reach the **log** and not the response body — including the two
unauthenticated auth routes, through the route handler rather than the module.
`npm run typecheck` clean; `npm test` **1972 passed, 19 skipped, 0 failed**.

Live, against `himalayankoh.com` after the redeploy: `POST /api/auth/customer/login` and
`POST /api/auth/customer/register` both answer `503` and neither body matches
`WORDPRESS_ADMIN_(USER|APP_PASSWORD)|CUSTOMER_SESSION_SECRET`.

What is **not** proven live: the sanitizing branch itself, because the condition it guards has been
fixed. Removing `WORDPRESS_ADMIN_USER` from the Worker to force it did not change what the running
deployment served — deleting a secret through the raw API does not roll the live version — so the
branch is verified by the route-level tests above, not by a network probe.

### 2. Customer accounts, wishlist, saved addresses and password reset are down — OWNER ACTION

With the credential in place, the next honest failure surfaced: the production backend has **no
`hk-storefront/v1` namespace**. Measured directly against the backend the Worker uses:

```
GET https://wp.himalayankoh.com/wp-json/     → 200, 25 namespaces, wc/store/v1 present
                                            → hk-storefront/v1 ABSENT
POST https://wp.himalayankoh.com/wp-json/hk-storefront/v1/customer/login → 404 rest_no_route
```

So `himalayan-koh-storefront.php` (which provides customer login, registration, password reset, the
wishlist and saved addresses) is not active on the live WordPress install. Every one of those
features is therefore unavailable in production, and the app says so honestly rather than blaming
the shopper's password.

### 3. The application password installed for production does not authenticate there — OWNER ACTION

`WORDPRESS_ADMIN_USER` / `WORDPRESS_ADMIN_APP_PASSWORD` from `.env.local` were minted for the
**staging** install: `WORDPRESS_BASE_URL` in that file is still `https://himalayankoh.com/staging`,
which now answers **404** because the apex is the Worker. Against the production backend:

```
GET https://wp.himalayankoh.com/wp-json/wp/v2/users/me  → 401 rest_not_logged_in
```

Token-driven probes were used to rule out the obvious alternative — an `Authorization` header that
never arrives would fail for every credential, and it does not (the WooCommerce consumer key draws a
WooCommerce-level error from the same host). So the production Worker needs an application password
minted **on the live install** (`wp.himalayankoh.com` → Users → Profile → Application Passwords).

This is recorded rather than fixed in place because it changes a live store's backend: minting the
credential and activating the plugin are the owner's call, and until they are done the two failures
above are the honest, non-leaking answers a shopper gets.

### 4. Confirmed deliberate: ordering is paused, and the Stripe secret does not exist anywhere

The deployed Worker carries `STOREFRONT_ORDERS_PAUSED=true` and `NEXT_PUBLIC_ORDERS_PAUSED=true`,
which is what renders "Ordering unavailable" on every card. Consistently, the missing secret
inventory is exactly the ordering half: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are absent
from the Worker **and from every local and owner file** — only the live *publishable* key is present.
So ordering cannot be enabled from this machine; it needs the owner's Stripe secret key.

### 5. A stale staging base in the local env

`himalayankoh.com/staging` — the address in `.env.local`, `.dev.vars` and
`scripts/install-wordpress-plugins.mjs`'s fallback — no longer serves WordPress at all (404, served
by the Worker). Local tooling that defaults to it cannot reach a WordPress install; the live backend
is `https://wp.himalayankoh.com`. Not a production defect, but it is why the credential in those
files looked correct and was not.

### Also found: the wp-admin automation cannot read this host

`scripts/install-wordpress-plugins.mjs` reports "cannot read the plugin list" against
`wp.himalayankoh.com`. The page it receives is a ~745-byte *"Checking your browser…"* gate that sets
an `hc_js_gate` cookie in JavaScript and reloads. curl does not run the script, so the installer
reads the gate as the plugin list. It is not a permissions problem, and it did not block anything
here — it is why the plugin state in item 2 was settled by the REST namespace index instead.

### Still open after the cutover

- **The hosting renewal** (owner action): `Stellar Plus` for `himalayankoh.com` expires
  **Oct 17, 2026**, auto-renew not set. The storefront keeps working without it, but the WordPress
  backend, `wp-admin`, the WooCommerce API and the legacy callback do not.
- **The storefront plugin and the production application password** (items 2 and 3 above).
- **`scripts/check-production-gate.mjs` now fails by design** — it asserts that no Worker route and
  no custom domain serve the apex, which was the pre-cutover condition this document recorded.
- **The new Stripe endpoint and live checkout** are deliberately not configured.

A Workers custom domain can still be attached later if the owner prefers one; it would only be
done by first replacing the apex `A` record, which is why the route form was chosen for the launch.
