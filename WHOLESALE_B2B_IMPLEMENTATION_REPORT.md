# Himalayan Koh — Wholesale B2B Portal: Implementation Report

**Date:** 22 October 2026
**Repository:** `https://github.com/himalayankoh/himalayankoh`
**Local path:** `C:\Users\basco\Downloads\hk\himalayan-koh`
**Branch:** `integration/cloudflare-workers-migration`
**Trade plugin:** `hk-wholesale` **v1.3.2**, schema **v8** (live on `wp.himalayankoh.com`)

> **Read this first.** The wholesale portal is implemented and verified end to end in
> both the HTTP layer and a real browser. The one thing this pass could **not** observe
> is live email delivery, because the cPanel SMTP secret is a deployed Worker secret that
> was deliberately not read from the deployment (§21). Everything else has test evidence.

---

## 1. Existing wholesale system audit

The repository already contained a substantial, isolated B2B module; this work extends it
rather than replacing it.

| Layer | What existed | Evidence |
| --- | --- | --- |
| Storage | WordPress plugin `wordpress/hk-wholesale.php`, 13 tables behind one allowlisted REST namespace (`hk-wholesale/v1`) | plugin header, `hk_wholesale_schema()` |
| Buyer API | `/api/wholesale/{apply,login,session,catalog,quote,quotes,orders}` | `src/app/api/wholesale/**` |
| Buyer UI | landing, apply, login, portal, catalog, quote builder, quotes, orders, account | `src/app/(main)/wholesale/**`, `src/views/wholesale/**` |
| Admin | one workspace at `/admin/wholesale` with 15 tabs and 9 admin API routes | `src/views/admin/wholesale/**` |
| Pricing | pallet / mixed pallet / container engine, EXW–CIF landed cost, FX snapshots, tiers, MOQ | `src/lib/wholesale/engine.ts`, `pricing.ts`, `plan.ts` |
| Auth | separate signed wholesale session (`WHOLESALE_SESSION_SECRET`) | `src/lib/wholesale/session.ts`, `requireBuyer.ts` |
| Security tests | source-level checks that every plugin route is capability-gated and every statement prepared | `src/lib/wholesale/security.test.ts` |

**Gaps against the brief:** no header/mobile entry; no U.S. address fields or resale
certificate capture; no certificate storage/verification/review; no admin Wholesale
Customers / Wholesale Products pages; no applicant email verification; no inquiry
notification to `ws@`; no wholesale allocation ceiling.

## 2. Reused modules and preserved functionality

* The existing plugin, its tables, REST namespace, record types and `dbDelta`
  self-verifying installer are unchanged in shape — only additive columns and one filter.
* Session, gate, buyer projection, quote lifecycle, pricing engine and console snapshot are
  reused untouched.
* Inquiry submission reuses `POST /api/wholesale/quotes` (the existing RFQ path). No second
  inquiry subsystem.
* Emails use the existing cPanel SMTP sender (`sendEmail`), extended with a `Reply-To`.
* The admin pages reuse `AdminUI`/`adminTheme` primitives and the existing
  `/api/admin/wholesale/*` session check.

## 3. New features implemented

| Area | Change |
| --- | --- |
| Header | `Wholesale` in the desktop nav and the mobile drawer |
| Landing | “Approved trade accounts only” block: verified businesses, mandatory certificate, inquiry-first, invoice/payment after approval |
| Registration | U.S. business address, DBA, shipping address, resale certificate (state, number, type, holder, expiry, PDF/JPG/PNG ≤5 MB), declaration and typed signature |
| Verification | Pure state-aware engine (51 jurisdictions) with evidence, advisory format checks and mandatory manual review |
| Email verification | Single-use 48-hex token, `/wholesale/verify`, token cleared on use, certificate checks re-run after confirmation |
| Admin | New **Wholesale Customers** and **Wholesale Products** sidebar pages |
| Certificates | Queue, detail, authenticated file streaming, recheck, request info, renewal request, notes, audit timeline |
| Products | Wholesale price (1-unit tier), MOQ, allocation, visibility, volume breaks, bulk update, inquiry count, retail link |
| Inventory | `available_units` allocation exposed to buyers; server-side ceiling on inquiries; no deduction on inquiry |
| Email | Inquiry notification to `ws@himalayankoh.com` with `Reply-To` buyer, buyer acknowledgement, audit row on failure |

## 4. Admin Wholesale Products

`/admin/wholesale/products` — search, filter (offered / not offered / no retail link / all),
inline availability toggle, per-product editor, volume-break editor, bulk update, counts for
unlinked and unpriced products, inquiry reference count, and a link to retail products. The
wholesale unit price is the `min_units = 1` tier, so there is no second price field. **Retail
prices are never read or written by this screen.**

**Status: PASS** — renders, lists the QA products, desktop + mobile, browser-verified.

## 5. Admin Wholesale Customers

`/admin/wholesale/customers` — application list with filter and search; detail with
business/contact/address, certificate number/type/holder/expiry/file metadata, declaration,
email verification, per-check outcomes, missing items, official authority link, reviewer note
and audit timeline. Actions: approve, reject, request information, suspend, recheck, request
renewal, save note; the certificate opens in a new tab from an authenticated blob fetch.

**Status: PASS** — the browser journey registers an applicant, finds them in the queue, opens
the certificate detail, sees the official verification link and the audit timeline, and
approves them via the on-screen button (dialog handled).

## 6. Certificate verification architecture

```
src/lib/wholesale/resaleCertificate/
  states.ts   registry: authority, official URL, lookup URL, sales-tax status,
              accepted document types, documented number format (TX only), notes
  verify.ts   pure engine: structural number check, documented-format advisory,
              magic-byte file check, size limits, name similarity, expiry,
              declaration, email status, official-automation record
```

The engine returns `ADDITIONAL_INFO_REQUIRED`, `PENDING_CERTIFICATE_REVIEW` or
`AUTOMATED_CHECKS_COMPLETED` plus a list of checks. It **cannot** return `APPROVED`,
`REJECTED` or `SUSPENDED`; `requiresManualReview` is always `true` and
`officialAutomationAvailable` is always `false`, stated in the payload itself.

Certificate bytes are stored on the application row, never in a web-accessible directory.
Every list projection strips the bytes; the only read is
`GET /api/admin/wholesale/certificates/[id]/file`, behind the console session, with
`no-store`, `nosniff` and a CSP. A token/row equality check in `/api/wholesale/verify-email`
prevents an older plugin from verifying the wrong application.

## 7. States supported by automated official checks

**None.** No U.S. state publishes a public machine-readable resale-certificate verification
API, and the brief anticipated this. What runs automatically for all 51 jurisdictions:
document presence/type/size, number presence and structural sanity, holder-vs-business name
similarity, expiry, declaration, email verification, and a recorded “no official automation”
check. The reviewer is given the authority’s own lookup URL.

## 8. States requiring manual review

**All 51.** Additionally:

* **Texas** — the only documented number format in the registry (11-digit Comptroller number).
  A mismatch is a **warning**, never a rejection.
* **Alaska, Delaware, Montana, New Hampshire, Oregon** — no state sales tax; route to
  `PENDING_CERTIFICATE_REVIEW` and accept a signed exemption statement.
* **Louisiana, Hawaii, New Mexico, Washington, Florida** — notes record the state-specific
  document or expiry rule a reviewer must apply.

## 9. Buyer authentication and approval flow

Registration → stored `PENDING` + certificate status → verification email (single use) →
console review (manual authority check) → `APPROVED`/`REJECTED`/`MORE_INFO_REQUIRED`/
`SUSPENDED` → approval creates/links the WordPress user → buyer signs in → signed session
scoped to the account id. Every decision writes an audit row. Suspension is re-checked per
request, so it applies before the token expires.

## 10. Wholesale catalog and stock handling

Shared product facts stay in WooCommerce (`woo_product_id`); the trade master adds price
tiers, MOQ, packaging, lead time and `available_units`. The buyer catalog returns
`availableUnits` (“Available to trade”, or “Confirmed per inquiry” when zero = unset). The
inquiry route refuses a quantity above a **configured** allocation, naming the ceiling; an
unset allocation is uncapped. **An inquiry never deducts stock.**

**Status: PASS** — catalog shows the two QA products with price 7.5, 400 units available and
MOQ 20; the ceiling refuses 4,000 units with the correct message.

## 11. Inquiry generation and totals

`POST /api/wholesale/quotes` stores the request with status `SUBMITTED`, **no** `sell_total`,
line snapshots (`units`, `cartons`, `pallets`, `unitPriceIndicative`) and buyer notes. The
reference `HK-WS-Qxxxxx` is written back after insert. Totals are computed server-side from
stored tiers; the browser never supplies a price — a client-supplied `unitPrice: 0.01` is
ignored and the stored line keeps the server price (7.5 / 16).

## 12. Email notification implementation

`src/lib/email/wholesaleInquiry.ts` builds HTML + text for the trade desk and a buyer
acknowledgement. Sent **from** `ws@himalayankoh.com` with `Reply-To` the buyer. Recipient
overridable with `WHOLESALE_INQUIRY_EMAIL`. Delivery failure writes `inquiry_email_failed` to
the audit table and the response reports the flags; the stored inquiry is never rolled back.

`sales@himalayankoh.com`, the existing inbox exclusions, HubSpot, cPanel and DNS were **not
touched**.

**Status: NOT TESTED (live delivery)** — see §21. The builder is covered by 13 unit tests and
the route wiring is exercised in the trial (the failure path is verified: when SMTP is absent
the inquiry is still stored and the failure is audited).

## 13. Admin quotation / invoice workflow

Unchanged and still manual, as required: RFQ → review → quotation in the existing console →
document download → external payment link → admin records payment evidence. No payment is
collected inside the wholesale portal.

## 14. Security test results

| Check | Result |
| --- | --- |
| Catalogue / inquiry / certificate endpoints without a session | **401** (live) |
| Certificate file / review POST without a session | **401** (live) |
| Invalid confirmation token | **400** (live) |
| Confirmation token reused after use | **410** (live) — see §18, this was a real bug |
| Token filter ignored by an older plugin | Row token equality re-checked before any write |
| Certificate bytes in list responses | Stripped; only the authenticated file route serves them |
| Certificate file headers | `no-store`, `private`, `nosniff`, restrictive CSP |
| Buyer prices | Server-computed; a client-supplied price cannot lower the stored line |
| Allocation ceiling | Server-side, refuses over-allocation naming the number |
| Suspension | Mirrored to the account row; a suspended buyer gets **403** on the catalogue |
| Rate limits | Apply 5/hour/IP, verify 20/hour/IP |
| WordPress capability gate | Every `hk-wholesale/v1` route `manage_options`; existing source-level test passes |
| Secret scan | `check-build-secrets.mjs` found no server credential in the build |

## 15. Browser test screenshots

Captured with headless Chrome over CDP at true CSS viewports (the desktop browser panel could
not draw because its window was minimised). **22 PNGs in `qa-wholesale/`, all from the final
run against the deployed staging site.**

| Surface | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Wholesale landing | `wholesale-landing-1440.png` | `wholesale-landing-768.png` | `wholesale-landing-390.png` |
| Registration form | `wholesale-apply-1440.png` | `wholesale-apply-768.png` | `wholesale-apply-390.png`, `wholesale-apply-360.png` |
| Confirmation page | `wholesale-verify-1440.png` | | |
| Applied / reference | `wholesale-applied-1440.png` | | |
| Wholesale sign-in | `wholesale-login-1440.png` | | |
| Mobile nav | `wholesale-mobile-nav-360.png`, `home-header-360.png` | | |
| Admin Wholesale Customers | `admin-wholesale-customers-1440.png` | | `admin-wholesale-nav-390.png` |
| Admin certificate detail | `admin-wholesale-customer-detail-1440.png` | | |
| Admin approval confirmed | `admin-wholesale-approved-1440.png` | | |
| Admin Wholesale Products | `admin-wholesale-products-1440.png` | | `admin-wholesale-products-390.png` |
| Approved buyer dashboard | `wholesale-portal-1440.png` | | |
| Wholesale product catalogue | `wholesale-catalog-1440.png` | | `wholesale-catalog-390.png` |
| Inquiry list | `wholesale-inquiries-1440.png` | | |

![Wholesale landing desktop](qa-wholesale/wholesale-landing-1440.png)
![Registration mobile 390](qa-wholesale/wholesale-apply-390.png)
![Admin certificate detail](qa-wholesale/admin-wholesale-customer-detail-1440.png)
![Buyer catalogue](qa-wholesale/wholesale-catalog-1440.png)

## 16. Desktop / mobile QA

No horizontal overflow at any width (inner width = document width at 1440 / 768 / 390 / 360).
Form fields present and labelled at every width. The mobile drawer renders the Wholesale
entry; the admin sidebar shows Wholesale, Wholesale Customers and Wholesale Products at 390.

## 17. Test and build results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run lint` | **PASS** (exit 0; warnings only — pre-existing `<img>`/hook-deps, none introduced) |
| `npm test` | **PASS** — 234 files, 229 passed / 5 skipped; **2,464 tests passed** / 24 skipped |
| New unit tests | 38 verification/registry + 13 inquiry-email = **51** |
| API end-to-end trial | **PASS — 71 / 71 checks** (`scripts/qa-wholesale-e2e.mjs`) |
| Browser end-to-end trial | **PASS — 35 / 35 checks** (`scripts/qa-wholesale-browser.mjs`) |
| `npm run build` | **PASS** — Next build completes; post-build public-origin + secret scans clean |

**Where the trials ran:** first against the local app deployment (`http://127.0.0.1:3100`),
then — after the staging deploy — both trials against the **deployed
`https://preview.himalayankoh.com`** and its staging WordPress, where they pass 71/71 and
35/35 (§20). The preview run is what exposed the three staging-only defects recorded in §21.

The API trial (`qa-wholesale-e2e.mjs`) covers registration (incl. refusals), certificate
storage, email confirmation and token single-use, admin queue + file + review actions,
wholesale products + tiers, approval + buyer account creation, buyer login, catalogue prices/
allocation/MOQ, allocation refusal, price-tamper rejection, two-line inquiry with reference +
stored snapshots + no committed price, buyer/admin inquiry visibility, and suspension → 403.

The browser trial (`qa-wholesale-browser.mjs`) drives the real forms: header button → landing,
mobile nav, full registration with certificate upload via the file input, submit, then the
console queue → certificate detail → official link → audit timeline → on-screen Approve, then
Wholesale Products, then the buyer portal dashboard → catalogue → inquiry list, at desktop and
mobile widths.

## 18. Database changes and two security fixes the trial uncovered

WordPress plugin `hk-wholesale` **→ v1.3.2**, schema **v8**. Additive only; no column dropped,
no row rewritten. `dbDelta` plus the plugin’s own verification applies it on first load.

`applications` added: `dba`, `address_line1`, `address_line2`, `city`, `state`, `zip`,
`shipping_address`, `resale_state`, `resale_number`, `resale_type`, `resale_holder`,
`resale_expires`, `certificate_file_name`, `certificate_file_type`, `certificate_file_size`,
`certificate_data`, `certificate_status`, `certificate_checks`, `certificate_official_url`,
`certificate_reviewed_at`, `certificate_reviewed_by`, `certificate_notes`, `declaration_name`,
`declaration_at`, `email_verified_at`, `email_verification_token`; index on `certificate_status`.
`products` added: `available_units`.

**Fix 1 — a single-use token was reusable.** The trial caught that a cache in front of
WordPress answered the `?email_verification_token=…` lookup from a *stale* copy, so the
confirmation link worked three times. Two defences now: the plugin sends
`Cache-Control: no-store` on every `hk-wholesale/v1` response, and the store client appends a
unique cache-buster to every trade read so correctness never depends on a middlebox honouring
a header. Verified: second and third uses return **410**.

**Fix 2 — suspension did not reach the account.** A rejection/suspension only moved the
*application* row, so an approved buyer kept catalogue and inquiry access. The plugin now
mirrors `REJECTED`/`SUSPENDED` onto the linked `accounts` row (the row every buyer route
authorises against), and the decision response reports `accountSuspended`. Verified: a
suspended buyer gets **403** on the catalogue.

**Fix 3 — the registration form omitted `country`.** The form is U.S.-only but never sent
`country`, so every *browser* submission was refused with “Please complete: country” (the HTTP
trial did not catch it because it posted the field directly). The form now states
`country: 'United States'`. Verified: a browser submission returns a reference and appears in
the admin queue.

## 19. Git branch and commit SHA

Branch `integration/cloudflare-workers-migration`, base `f54daa0`. The commit SHA is recorded
in the end-of-task message and `git log -1`.

## 20. Staging deployment URL and version

Deployed to staging/preview only — production untouched.

| Item | Value |
| --- | --- |
| URL | `https://preview.himalayankoh.com` (trigger also on `himalayan-koh-ecommerce.himalayankoh-pk.workers.dev`) |
| Git SHA | `e3ec273` — `integration/cloudflare-workers-migration` (pushed to `himalayankoh/himalayankoh`) |
| `/api/version` | `sha e3ec273109fc7d48c104a749c679365f026ac44e`, `builtAt 2026-10-22T20:16:55Z` — matches the commit |
| Worker Version ID | `fb2a63fd-21af-4182-ac65-732e4338a254` (Worker `himalayan-koh-ecommerce`) |
| Build | `npm run build:deploy` (vinext artifact) → `npm run deploy:staging`; pre- and post-deploy secret scans clean |

**The wholesale journey runs on the deployed staging environment.** Both trials were pointed
at `https://preview.himalayankoh.com` and its staging WordPress:

* HTTP trial — **71 / 71 checks** (`node scripts/qa-wholesale-e2e.mjs https://preview.himalayankoh.com`):
  registration and its refusals, certificate storage, single-use confirmation, admin queue,
  certificate file and review actions, products and tiers, approval + buyer account, buyer
  catalogue with price/MOQ/allocation, allocation refusal naming the ceiling, price-tamper
  refusal, two-line inquiry `HK-WS-Q00086` with stored snapshots and no committed price,
  buyer/admin inquiry visibility, suspension → 403, re-approval → 200.
* Browser trial — **35 / 35 checks** (`node scripts/qa-wholesale-browser.mjs https://preview.himalayankoh.com`):
  header → landing → registration with a real certificate upload (`HK-WS-A00035`) → console
  queue → certificate detail with the official Texas lookup and audit timeline → on-screen
  **Approve** → Wholesale Products → approved-buyer portal → catalogue (price 7.5, MOQ 20,
  400 available) → inquiry list (`HK-WS-Q00090`), at desk and phone widths. Screenshots in
  `qa-wholesale/` are of this deployed staging run.

Also verified on the deployed URL: `/wholesale` and `/wholesale/apply` render with the
approval/certificate/inquiry/invoice copy; `/api/wholesale/catalog` and
`/api/wholesale/session` refuse anonymous callers with **401**; the retail catalogue still
answers.

## 21. Blockers — resolved and remaining

**Resolved this session (was blocking wholesale on preview):**

1. *Trade store not at schema v8 for the deployed Worker* — the staging WordPress
   (`wp.himalayankoh.com/staging`, the backend behind `preview.himalayankoh.com`) had an
   older `hk-wholesale`. With the owner-supplied WordPress administrator login the plugin
   was updated in place to **1.3.2 / schema 8** (its own `dbDelta` verified the tables), and
   the Worker's `WORDPRESS_ADMIN_USER` / `WORDPRESS_ADMIN_APP_PASSWORD` secrets were
   refreshed to a **new application password created on that install**. Wholesale writes
   now pass the schema gate on preview.
2. *A two-line inquiry was refused with "timed out after 20000ms"* — `loadWholesaleData`
   prices from four parallel store reads and gave three of them the 45s aggregate ceiling
   while the heavy `/catalog` read kept the 20s single-record one; on the slower staging
   host the read its siblings were given time for failed. It now uses the aggregate ceiling
   (commit `e3ec273`).
3. *The trial's own negative fixtures were blocked at the edge* — they forged a
   `cf-connecting-ip` header to keep the 5/hour application rate limit away from the real
   applicant (a loopback-only trick), and Cloudflare refuses the forged header with a 403
   HTML page before the app sees it. The harness now sends those headers only against
   loopback targets.

**Remaining:**

1. **Live `ws@` email delivery not observed.** The trial reports
   `tradeDeskNotified:false` — the cPanel SMTP secret is a deployed Worker secret that was
   **not** read from the deployment (it would enter the transcript), and it is not in local
   `.env.local`, so the sender could not be exercised end to end. The route, the HTML/text
   builders, the `Reply-To`, the "stored even if the mail fails" behaviour and the
   `inquiry_email_failed` audit row are all covered by 13 unit tests and the live failure
   path. **Owner action:** from the staging portal submit one synthetic inquiry and confirm
   it reaches `ws@himalayankoh.com`, or set `WHOLESALE_INQUIRY_EMAIL` to a staging sandbox
   and re-run the HTTP trial.
2. **Rotate every credential pasted into the chat** (GitHub token, WooCommerce consumer
   key/secret, Cloudflare tokens, WordPress administrator password, Namecheap password).
   None were written into this repository; the WordPress administrator password was used
   only to update the staging plugin and create an application password.

## 22. Requirement status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Audit and reuse existing module | PASS | §1–2 |
| Header + mobile Wholesale button | PASS | browser, screenshots |
| Public landing with required disclosures | PASS | browser copy checks |
| U.S. business registration fields | PASS | browser form fill + submit |
| Resale certificate upload + private storage | PASS | browser file input, engine tests |
| State-aware verification engine | PASS | 38 tests, 51-jurisdiction registry |
| Official automation claimed honestly | PASS | payload flags, UI copy |
| Admin certificate queue/detail/actions | PASS | browser: queue, detail, link, audit, approve |
| Admin Wholesale Customers sidebar page | PASS | browser, screenshots |
| Admin Wholesale Products sidebar page | PASS | browser, screenshots |
| Buyer portal + catalog | PASS | browser: dashboard, catalogue, prices, MOQ, allocation |
| Allocation display + server ceiling | PASS | e2e: 4,000 refused naming 400 |
| Inquiry-first, no online payment | PASS | no checkout; copy |
| Inquiry stored with reference/snapshots | PASS | e2e: HK-WS-Q ref, 2 lines, no `sell_total` |
| Price tamper rejected | PASS | e2e: client `0.01` ignored |
| `ws@` notification with Reply-To + logging | PASS (builder) / **NOT TESTED (live)** | 13 tests; §21 blocker |
| Manual quotation/invoice workflow | PASS (preserved) | no change |
| Security: no public prices / certs | PASS | 401s, projections, tests |
| Token single-use | PASS | 410 on reuse (Fix 1) |
| Suspension blocks access | PASS | 403 (Fix 2) |
| Responsive desktop/tablet/mobile | PASS | CDP viewport measurements + 22 screenshots |
| Typecheck / lint / tests / build / secret scan | PASS | §17 |
| Staging deploy | **DONE** | Worker `fb2a63fd`, SHA `e3ec273` on `/api/version` (§20) |
| Wholesale journey on the deployed preview | **PASS** | 71/71 HTTP + 35/35 browser against `preview.himalayankoh.com` (§20) |
| Production deploy | NOT ATTEMPTED (by instruction) | — |

---

## Mandatory owner-side follow-ups

1. **Rotate every credential that was pasted into the chat** (GitHub token, WooCommerce
   consumer key/secret, Cloudflare tokens, WordPress administrator password, Namecheap
   password). None were written into this repository, but they must be considered exposed.
2. Confirm one synthetic inquiry from the staging portal reaches `ws@himalayankoh.com` (or
   point `WHOLESALE_INQUIRY_EMAIL` at a sandbox and re-run).
3. Decide what happens to the synthetic QA rows left in the staging trade store
   (applications `HK-WS-A000xx`, inquiries `HK-WS-Q000xx`, `QA-*` products, and the
   `hk_wholesale_buyer` WordPress users the trials created).
4. After staging is fully verified, request owner approval before any production deploy.
