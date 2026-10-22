# Wholesale — production audit (2026-10-22)

Decision: **NOT RELEASED. Production Worker was not changed.** Two critical release gates fail
(email delivery, no staging WordPress admin access for a fresh trial). Details below.
No secret appears in this file. Statuses: PASS / FAIL / BLOCKED / NOT VERIFIED.

## 1. Live architecture (verified)

| Fact | Evidence | Source |
| --- | --- | --- |
| Apex `himalayankoh.com/*` and `www/*` are routed to Worker `himalayan-koh-ecommerce-prod` | zone route list | Cloudflare API |
| Apex serves the Next.js storefront, not WordPress (`/`, `/products`, `/wholesale` HTTP 200, `/api/version` JSON) | live HTTP | HTTP |
| Live build is `d1780bb` (built 07:51 UTC); it does NOT contain the order-trash fix `f54daa0` or any wholesale work | `/api/version` vs git | HTTP + Git |
| `preview.himalayankoh.com` is Worker `himalayan-koh-ecommerce` (custom domain), build `e3ec273` | Cloudflare + HTTP | Cloudflare/HTTP |
| Production backend = `https://wp.himalayankoh.com` (A record, proxied, 162.0.209.25); live Worker vars point at it; orders not paused; live Stripe publishable key | Worker settings | Cloudflare |
| Staging WordPress is a separate install at `wp.himalayankoh.com/staging` (different plugin set, different credentials) | REST namespaces, 401/200 matrix | HTTP |
| `docs/PRODUCTION-CUTOVER-PLAN.md` and the comments in `deploy-production.mjs` ("himalayankoh.com is still WordPress") are **stale** | contradicted by routes | Cloudflare |

Scenario A applies (apex already runs the production Worker). No domain change is needed or was made.

## 2. Previous agent claims

- "Staging only, production untouched" — **INCORRECT.** The production WordPress holds the
  wholesale plugin `hk-wholesale` 1.3.2 / schema 8 (REST `settings`: `db_version 8`, `installed_db_version 8`,
  no missing tables/columns) and held synthetic QA data (below). Earlier trial runs used `.env.local`,
  whose `WORDPRESS_BASE_URL` is the production backend, and `qa-wholesale-e2e.mjs` defaulted to it.
- "On-screen Approve verified" — **INCORRECT** (section 6).
- 2,464 unit tests / typecheck — **CONFIRMED** again this session (2464 passed, 24 skipped, 0 failed; `tsc --noEmit` clean).
- Wholesale diff scope (65 files, retail untouched apart from header link + admin nav) — **CONFIRMED** from `git diff --stat f54daa0 HEAD`.

## 3. Production data incident and remediation

Found on `wp.himalayankoh.com` (every row created today from 16:26 server time; the first row of each table):
39 applications, 16 buyer accounts (each with a WordPress user of role `hk_wholesale_buyer`, i.e. a working
login), 28 products, 26 price tiers, 18 quotes, 0 orders. All were synthetic (`@example.com`, "SYNTHETIC QA",
"Basalt Ridge", "Test LLC", blank-name fixtures). No real wholesale record existed.

Actions (owner rule: synthetic only, back up first):
1. Exported every wholesale table (accounts, applications, products, price_tiers, quotes, orders, suppliers,
   origins, cost_profiles, freight_rates, port_charges, container_profiles, audit) to
   `brain/.../scratch/prod-wholesale-backup-20261022/*.json` (outside the repository: it contains synthetic
   certificate files and tokens). The plugin also writes a snapshot of each deleted row to its audit table.
2. The cleanup script refuses to delete anything that does not match a synthetic marker; dry run first
   (127 rows, 0 non-synthetic, 16 of 16 buyer-role users synthetic), then applied.
3. Result (cache-busted reads): applications 0, accounts 0, products 0, price_tiers 0, quotes 0.
   WordPress users went 23 → 7; the 7 remaining are real (4 `customer`, 3 `administrator`) and were not touched.
   Seed rows `origins` (2) and `container_profiles` (3) were left in place.

**PASS** (data removed, backup kept). **NOT VERIFIED:** a full database dump — no database/cPanel access was
used; only the plugin's own tables were exported through REST. Restorability of that JSON was not exercised.

## 4. Release gates

| Gate | Status | Evidence / blocker |
| --- | --- | --- |
| Production routing confirmed | PASS | section 1 |
| Correct backend identified | PASS | `wp.himalayankoh.com` |
| Plugin / schema compatible | PASS | 1.3.2 / 8 installed, matches `wordpress/hk-wholesale.php` |
| Full DB backup verified | BLOCKED | no DB access; wholesale tables exported only |
| Production secrets configured | FAIL | Worker has no `SMTP_*`/`NAMECHEAP_SMTP_*`, `WHOLESALE_INQUIRY_EMAIL` or `WHOLESALE_FROM_EMAIL` secret (secret names read from Cloudflare) |
| No test data on production | PASS (after cleanup) | section 3 |
| Wholesale email delivery to `ws@himalayankoh.com` | BLOCKED | no SMTP credentials on the production Worker; mailbox/DNS must not be created or changed by this task |
| Fresh staging trial | BLOCKED | no staging WordPress admin credential available (the one in `.env.local` is production; the staging one was not recorded) |
| Rollback verified | NOT VERIFIED | `docs/PRODUCTION-ROLLBACK.md` exists; no rollback exercised |

Because the email and staging-trial gates fail, activation must stay off. Wholesale inquiries would still be
stored if mail failed (design, 13 unit tests) but the team would not be notified.

## 5. Production release strategy (when the gates pass)

`npm run deploy:production` (builds with the production overlay, asserts config before reading credentials,
deploys `--name himalayan-koh-ecommerce-prod --skip-build`, reads the Worker back). No route or DNS change.
Do not run it until the email secrets exist and a fresh staging trial is green.

## 6. Duplicate screenshots — root cause and fix

The three files are byte-identical (same SHA-256). Viewing them shows:
- They all show the application as **Application: PENDING / Certificate: Pending email verification**. The
  "approved" shot therefore shows a state that never happened.
- The browser trial's assertion `/approved|decision recorded/i` matched the **"Approved" filter tab**, so
  "Approval is confirmed on screen" passed without any approval. The claim that the on-screen Approve worked
  is unsupported; the buyer used later was approved through the API by the HTTP trial.
- All 1440px console screenshots (including the unaffected Products page) show the sidebar drawn over the left
  ~240px of the page (heading and list clipped). Whether this is a real layout defect at 1440 or an artefact of
  `Page.captureBeyondViewport` after a viewport resize was **not determined**: **NOT VERIFIED**, treat as FAIL for QA purposes.

Fixes committed in `scripts/qa-wholesale-browser.mjs`: the approval check now requires the status badge to read
"Application: APPROVED"; every screenshot is hashed and the run fails if two files with different names are
byte-identical. Screenshots were **not** regenerated (blocked, section 4). The three duplicated PNGs and the
1440px console screenshots must not be used as evidence.

## 7. Harness safety fixes

`qa-wholesale-e2e.mjs` no longer defaults `QA_WP_BASE` to production; it requires it and refuses the production
backend. `qa-wholesale-browser.mjs` refuses the production host and an unconfirmed local dev server.
`qa-wholesale-deep.mjs` refuses a production `WORDPRESS_BASE_URL`. Override only with
`QA_ALLOW_PRODUCTION=yes-write-synthetic-data-to-production`.

## 8. Quality gates this session

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 2464 passed / 24 skipped / 0 failed |
| lint, build, secret scan, production config guard | NOT RERUN (only QA scripts changed after the last verified run) |
| API trial 71/71, browser trial 35/35 (previous agent) | NOT VERIFIED here; the browser trial's approval check was a false pass |
| Security matrix, retail regression, live smoke, responsive screenshots | NOT VERIFIED |

## 9. Live verification

`himalayankoh.com/wholesale`, `/products`, `/api/version`: HTTP 200 (old build `d1780bb`). Production
admin/buyer/inquiry flows on the new code: NOT TESTED (not deployed).

## 10. Smallest next actions

1. Owner supplies (or approves creating) SMTP credentials for the sender that may send as
   `ws@himalayankoh.com`, set as Worker secrets with `wrangler secret put`; then one controlled test email.
2. Provide the staging WordPress application password (or run `QA_WP_BASE=https://wp.himalayankoh.com/staging`
   with it) and re-run the e2e and browser trials; inspect the new screenshots by eye.
3. Investigate the 1440px sidebar overlap in the admin console.
4. Then `npm run deploy:production`, post-deploy smoke, rollback readiness check.
5. Rotate every credential pasted into chat (GitHub, WooCommerce keys, Cloudflare tokens, WordPress, Namecheap).

Git: `integration/cloudflare-workers-migration`, base `6a6c640`; commit SHA recorded in the final message.
Worker version/deployment ID: unchanged — `himalayan-koh-ecommerce-prod` deployment `6a56a5c8-1362-4ff2-bd24-32ca3f288b00`.

