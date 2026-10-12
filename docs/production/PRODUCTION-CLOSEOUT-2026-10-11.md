# Production closeout — 2026-10-11

Everything in this document was measured today. Each row names where its evidence lives, so any
claim can be re-derived rather than taken on trust. Companion documents:
`BACKUP-RESTORE-EVIDENCE-2026-10-11.md`, `GIT-HISTORY-EXPOSURE-2026-10-11.md`,
`REVENUE-RECONCILIATION-2026-10-11.md`, `CUSTOMER-CLEANUP-BATCH-1-2026-10-11.md`,
`REGISTRATION-SURFACES-2026-10-11.md`, `BACKUP-RESTORE-VERIFICATION.md`.

---

## 0. One correction that changes the shape of this work

**The apex `himalayankoh.com` is served by the Cloudflare Worker, not by WordPress.**

Measured, not assumed: `GET https://himalayankoh.com/api/version` answers
`{"sha":"ed575eba…","builtAt":"2026-10-12T04:56:40Z"}`; the response carries
`X-Vinext-Build-Id` and `Server: cloudflare`; `https://himalayankoh.com/wp-login.php` answers
**404**; and `?post_type=product` renders **zero** WooCommerce product titles. The **cutover has
already happened**, so the deploy in §4 was not a preview-only exercise — it went live to the
store's real visitors, and the WordPress installation is reached at its own hostname,
`wp.himalayankoh.com`.

Consequences, kept explicit below: "WordPress native registration is open" is a statement about the
**backend host**, not the store front; and the storefront routes in §4 were tested on the live apex.

---

## 1. Final report

```text
WORDPRESS REGISTRATION:   FAIL      — wp-login.php?action=register still serves the form
                                      (backend host). Not closable from this machine; owner action.
STOREFRONT SIGNUP:        PASS      — route alive, refuses reserved/duplicate/reserved-domain
                                      addresses, two budgets (Worker + durable in WordPress).
GIT HISTORY DATA EXPOSURE:FAIL      — 2,704-row per-record export public at commit 1140cc2.
                                      Contained, not undone. Owner decision required.
BACKUP VERIFIED:          PASS*     — *for the 2026-10-08 state: dump + archives + wp-config all
                                      verify by digest, off the hosting account.
RESTORE TEST:             PASS      — fresh isolated restore today: 320 tables, exit 0, 27.4s.
CUSTOMER CLEANUP STATUS:  BLOCKED   — batch of 6 prepared outside git; deletion withheld.
PRODUCTION SHA:           ed575eb   — deployed and verified live (was e4a1c8d).
CUSTOMERS DASHBOARD:      BLOCKED   — no admin session obtainable; API correctly refuses anon.
ORDERS:                   PASS      — 14 orders, identical live and in the dump; API refuses anon.
REVENUE RECONCILIATION:   PASS      — $1,095.24 = $815.71 + $279.53 exactly; $279.53 BLOCKED
                                      on gateway credentials.
STRIPE:                   PASS      — live publishable + live secret + webhook present,
                                      configured, mode live, charging not blocked.
SHIPPO:                   PASS      — 8 live carrier rates returned for a real 30 lb parcel.
TESTS:                    PASS      — typecheck 0 · lint 0 · 2,227 unit tests · build clean ·
                                      secret scan clean · privacy gate 0.
DEPLOYMENT:               PASS      — ed575eb live, read back from Cloudflare, no domain attached.
OWNER ACTION REQUIRED:    see §7.
```

---

## 2. Task 1 — the WordPress registration abuse path

| Surface | State | How it was measured |
| --- | --- | --- |
| **WordPress native** — `wp-login.php?action=register` | **OPEN (FAIL)** | serves `<form name="registerform">` with `user_login`/`user_email`, no "registration is disabled" notice |
| **WooCommerce My Account** — `/my-account/` | **CLOSED** | `woocommerce_enable_myaccount_registration = "no"`, read live with the read-only key; `/my-account/` renders no register form |
| **Storefront sign-up** — `POST /api/auth/customer/register` | **OPEN — required, working** | empty body → `400 {"error":"Enter your email address."}`; nothing created |

**The dependency the mission asked to re-verify, verified in code rather than behaviour:** the
storefront does not use either legacy form. `createWordPressCustomer()`
(`src/lib/auth/wordpressCustomerAuth.ts`) is called from exactly one route
(`src/app/api/auth/customer/register/route.ts`), which calls the plugin's
`hk_storefront_customer_register()`; that function validates the address, checks the durable budget,
refuses a duplicate and calls `wc_create_new_customer()`. The plugin references
`users_can_register` in **one** place — inside `hk_storefront_close_legacy_registration()`, whose
whole purpose is to set it to `0`. Nothing on the sign-up path reads it, so closing the legacy form
**cannot** break storefront sign-up, checkout, logins or existing accounts.

**Why it could not be closed from here — all four write routes refused, with evidence:**

1. **WP-CLI / cPanel / phpMyAdmin**: the stored hosting pair is a Namecheap *account* login, and
   cPanel issues no session for it. No database or filesystem access exists from this machine.
2. **XML-RPC**: every method answered `403`.
3. **Core REST**: an application password was tried against `/wp/v2/settings` and
   `/wp/v2/users/me` — both **401**. (The credential in `.freebuff/owner-secrets.live.local` is
   `len=11`, not in application-password format: it is a login password, which WordPress does not
   accept over Basic auth.)
4. **WooCommerce REST**: the read/write pair authenticates but is refused `401
   woocommerce_rest_cannot_view` on reads — i.e. it is not a usable path for the WordPress option
   either.

**The dependency that has already been closed** is the WooCommerce half (`= no`), and the fix for
the WordPress half needs one click in wp-admin. Because the plugin's closer runs on a *version
change*, uploading the current plugin file (**1.5.4 → 1.5.5**, bumped in the same commit that added
the closer) closes the option automatically on the next request — see §7.1.

---

## 3. Task 2 — the backup, and the contradiction in the documents

Re-verified independently today, in full in `BACKUP-RESTORE-EVIDENCE-2026-10-11.md`:

- **Digests recomputed**: dump, both archives and `wp-config.php` all match; `sha256sum -c` → OK.
- **Fresh restore performed**: isolated local MariaDB 11.4.13, new schema `hk_restore_check_20261011`,
  import **exit 0 in 27.4 s**, **320 tables**.
- **Install identity established from the data**: the dump holds three installations — `wp_` is the
  **live apex** (`https://himalayankoh.com`, 2,707 users, 14 orders), `stg_` is `/staging`,
  `afk_` is an abandoned default install. The live install's own settings confirm WooCommerce 7.7.0,
  theme `farmagrico`, **HPOS never enabled** (orders in `wp_posts` + `wp_woocommerce_order_items`,
  both present), and `users_can_register = 1` on 2026-10-08.
- **Coverage against live, same day**: orders **identical** (14/14, same ids/statuses/totals);
  accounts **identical** (2,704 customers + 3 administrators); published products **not covered** —
  the five live listings were created after the backup, and the eighteen in the dump are the
  superseded catalogue.

**The two documents disagree; here is which is right.** `BACKUP-RESTORE-VERIFICATION.md`'s FAIL was
correct when written and its rule is sound; `CUTOVER-READINESS.md`'s PASS was correct for the
artefacts that then existed, and its own note explains the earlier FAIL — the verifier had been run
without `--restore-evidence` against a restore record already on disk. Today the three conditions of
the rule (a dump of the live installation, a files backup, and a restore into a scratch location
verified against counts) are met **for the 2026-10-08 state**, and both documents have been updated
to say so. The honest sentence is: *a verified, restorable backup of the live installation as it was
on 2026-10-08 exists, and production has moved past it in the catalogue only.*

**A fresh backup is still required** — the current five listings and any WordPress-side change after
2026-10-08 are in no verified backup — and it needs database access this machine does not have.

---

## 4. Task 4 — the deploy

| Step | Result |
| --- | --- |
| Difference deployed | **one commit**: `ed575eb` (29 files: docs, scripts, admin API/UI, customer activity, sales engine, the WordPress plugin, tests, `package.json`, `.gitignore`). No rewrites, no reversions of others' work |
| typecheck | **`tsc --noEmit` → 0** |
| lint | **0 errors**, pre-existing `<img>` advisories only |
| tests | **208 files passed · 2,227 tests passed · 24 skipped** (integration tests needing live credentials) |
| build + guards | production build passed; `assert-production-config` refused nothing; secret scan of 1,191 files found no server-side credential |
| deploy | `himalayan-koh-ecommerce-prod` uploaded, **read back from Cloudflare**: 7 production variables verified |
| DNS | **no record created, no custom domain attached** |
| live SHA after | **`ed575eba4a06aa577ca0a3d6d42b239a39a2100d`** (`builtAt 2026-10-12T04:56:40.530Z`) |

**Smoke tests, run against the live apex** (token or none, never a payment):

| Surface | Result |
| --- | --- |
| Homepage | `200`, 80,834 bytes |
| Products | `200`, 85,101 bytes |
| Product page (id 2544) | `200` |
| Product image | `200 image/webp` |
| `/api/catalog` | `200`, **5 products** (2544, 2543, 2539, 2536, 2526) |
| `/api/cart` | `200` — empty-cart shape, no issues |
| Cart page | `307 → /products` (empty-cart redirect, expected) |
| Checkout page | `200` |
| `/signup` | `200` |
| Customer registration | route alive; empty body refused `400`; **no account created** |
| Stripe config | `configured: true`, **mode live**, publishable+secret+webhook present, `chargingBlockedReason: null` |
| Shippo rates | **8 live rates** (USPS/UPS) for a 30 lb parcel |
| Admin APIs | `/api/admin/customers`, `/orders`, `/sales`, `/integrations` **all `401`** without a session |

**What was deliberately not done:** no paid transaction and no order was created (the mission
forbids it), and no account was created during QA. **What could not be verified:** the Customers,
Orders and Sales & Profit **screens** were not render-tested — a locally minted admin token is
refused `401` by the deployed Worker, whose `ADMIN_SESSION_SECRET` is its own (correct) value, and
no working administrator credential exists on this machine. The APIs behind those screens are
protected exactly as designed; their *rendering* remains unverified.

---

## 5. Task 3 — the exposure

Full detail in `GIT-HISTORY-EXPOSURE-2026-10-11.md`. In one paragraph: a **2,704-row per-record
customer export** (`docs/production/customer-cleanup-manifest-2026-10-11.csv`, blob
`59d6bbfb…`) was committed in **`1140cc2`** to a repository that answers **HTTP 200 to an
anonymous GitHub API call — it is public** — and sits on `origin/integration/cloudflare-workers-migration`,
**not** on `main`. Each row carries the address's **domain in clear text** beside a **40-bit
unsalted SHA-256 of the local part**, which is brute-forceable for guessable local parts. It is
contained (deleted from the tree, four `.gitignore` patterns, and a **build gate** —
`scripts/check-tracked-customer-data.mjs`, in `prebuild`, exit 0 today) but not undone. **No history
rewrite, force-push or branch deletion was attempted**; choosing between a GitHub Support branch
purge and a coordinated rewrite is an owner decision.

---

## 6. Tasks 5 and 6 — cleanup and money

**Cleanup: BLOCKED, nothing deleted.** 2,707 accounts = 2,704 customers + 3 administrators. Batch 1
is exactly **six** accounts (ids `37, 1099, 1106, 1107, 1393, 1394`), all `@example.com`, none with
a name, none with an order — the only proof-grade class. The manifest was written to
`C:\Users\basco\Downloads\hk\.freebuff\customer-cleanup-batch-1-2026-10-11.csv`, **outside the
repository** so it cannot be committed, and every one of the six is restorable from the verified
2026-10-08 dump. The other 2,701 accounts are untouched and explicitly out of scope; the 731
"suspicious" and 1,963 "unclassified" rows are not deletion candidates on shape alone.

**Money: PASS.** `$1,095.24` (11 completed orders) = `$815.71` (the 5 charges Stripe can show) +
`$279.53` (6 historical gateway orders) — **exactly**, with the member order ids listed in
`REVENUE-RECONCILIATION-2026-10-11.md`. Failed orders `1772` ($0.49) and `2469` ($299.85) and pending
`2468` ($20.47) are excluded and must never be counted. Order `2110` is recorded as `stripe` yet
belongs in the unverified bucket — *why a gateway name is not evidence*. The six historical orders
must not be deleted. Closing the `$279.53` needs owner-side gateway credentials (Stripe's older
account, Amazon Pay, Square, PayPal legacy and PayPal Commerce).

---

## 7. Owner actions

1. **Close WordPress native registration (one click).** wp-admin → **Settings → General** → untick
   **"Anyone can register"** → Save. Reversible by re-ticking. *Alternative of equal effect:* upload
   the current `wordpress/himalayankoh-storefront.php` (**version 1.5.5**, bumped in the same commit
   that added `hk_storefront_close_legacy_registration()`), which also ships the durable sign-up
   budget. Then confirm with `node scripts/check-registration-surfaces.mjs` — it exits `1` while any
   surface is open.
2. **Decide the git-history exposure.** GitHub Support branch purge (recommended: the commit is not
   on `main`, no rewrite needed) or an authorised, coordinated history rewrite. Nothing further will
   be attempted here without that decision.
3. **Take a fresh production backup** and restore-test it, so the current five listings and the
   post-2026-10-08 state are protected. Requires cPanel/phpMyAdmin/WP-CLI access.
4. **Approve (or reject) batch 1** — the six `example.com` accounts, and only after (3).
5. **Supply gateway credentials** for the `$279.53` reconciliation, or confirm it should stay
   unreconciled.
6. **Renew the hosting subscription** — `himalayankoh.com` (Stellar Plus) expires **Oct 17, 2026**
   with auto-renew off, and the WordPress backend the storefront reads from lives there.

---

## 8. What is still open, in one line each

- WordPress native registration is open; storefront sign-up is not affected (verified in code).
- A public repository still contains a 2,704-row pseudonymous customer export at `1140cc2`.
- No verified backup covers the current catalogue; the 2026-10-08 set covers all people and orders.
- The six batch-1 accounts are pre-cleared and reversible but undeleted.
- Admin dashboards are protected but their rendering is unverified without a session.
- `$279.53` of historical gateway payments await provider records.
- Hosting renewal (Oct 17) is required for the backend to remain up.
