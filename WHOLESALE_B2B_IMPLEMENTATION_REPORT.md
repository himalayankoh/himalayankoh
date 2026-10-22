# Himalayan Koh — Wholesale B2B Portal: Implementation Report

**Date:** 22 October 2026
**Repository:** `https://github.com/himalayankoh/himalayankoh`
**Local path:** `C:\Users\basco\Downloads\hk\himalayan-koh`
**Branch:** `integration/cloudflare-workers-migration`
**Base HEAD:** `f54daa05da51984aaa14b69e9dd449ff5cc891ed`
**Scope delivered:** audit, certificate-backed registration, state-aware verification, admin review desks, allocation and inquiry notification, responsive QA.

> **Read this first.** The application code is complete and verified. The WordPress
> plugin upgrade it depends on could **not** be installed from this environment, so the
> production registration path deliberately fails closed until that one ZIP is uploaded
> (§21). Nothing was deployed to preview or production.

---

## 1. Existing wholesale system audit

The repository already contained a substantial, isolated B2B module; this work extends it
rather than replacing it.

| Layer | What existed | Evidence |
| --- | --- | --- |
| Storage | WordPress plugin `wordpress/hk-wholesale.php` v1.2.1, schema v7, 13 tables (`accounts`, `applications`, `products`, `price_tiers`, `suppliers`, `origins`, `cost_profiles`, `freight_rates`, `port_charges`, `container_profiles`, `quotes`, `orders`, `audit`) behind one allowlisted REST namespace (`hk-wholesale/v1`) | plugin header, `hk_wholesale_schema()` |
| Buyer API | `/api/wholesale/{apply,login,session,catalog,quote,quotes,orders}` | `src/app/api/wholesale/**` |
| Buyer UI | landing, apply, login, portal, catalog, quote builder, quotes, orders, account | `src/app/(main)/wholesale/**`, `src/views/wholesale/**` |
| Admin | one workspace at `/admin/wholesale` with 15 tabs and 9 admin API routes | `src/views/admin/wholesale/**`, `src/app/api/admin/wholesale/**` |
| Pricing | pallet / mixed pallet / container engine, EXW–CIF landed cost, FX snapshots, tiers, MOQ | `src/lib/wholesale/engine.ts`, `pricing.ts`, `plan.ts` |
| Auth | separate signed wholesale session (`WHOLESALE_SESSION_SECRET`, roles `wholesale_customer` / `wholesale_pending`) | `src/lib/wholesale/session.ts`, `requireBuyer.ts` |
| Security tests | 18 existing tests, including source-level checks that every plugin route is capability-gated and every statement prepared | `src/lib/wholesale/security.test.ts` |
| Docs | `docs/WHOLESALE.md` (architecture, pricing, schema self-verification) | present |

**Gaps against the brief:** no header/mobile entry for wholesale; no U.S. address fields
or resale certificate capture; no certificate storage, verification or review; no admin
“Wholesale Customers” or “Wholesale Products” pages in the sidebar; no applicant email
verification; no inquiry notification to `ws@`; no wholesale allocation ceiling.

## 2. Reused modules and preserved functionality

* The existing plugin, its tables, REST namespace, 13 record types and `dbDelta`
  self-verifying installer are unchanged in shape — only additive columns and one filter.
* Session, gate, buyer projection, quote lifecycle, pricing engine, console snapshot and
  document renderer are reused untouched.
* Inquiry submission reuses `POST /api/wholesale/quotes` (the existing RFQ path), which
  already stores the request with no committed price. No second inquiry subsystem.
* Emails use the existing cPanel SMTP sender (`sendEmail`), extended with a `Reply-To`
  header rather than a new mail provider.
* The admin pages reuse `AdminUI`/`adminTheme` primitives and the existing
  `/api/admin/wholesale/*` session check.

## 3. New features implemented

| Area | Change |
| --- | --- |
| Header | `Wholesale` added to the desktop nav and the mobile drawer; active state covers `/wholesale/*` |
| Landing | “Approved trade accounts only” block: verified businesses, mandatory certificate, inquiry-first, invoice/payment after approval |
| Registration | U.S. business address, DBA, shipping address, resale certificate (state, number, type, holder, expiry, PDF/JPG/PNG ≤5 MB), authorised-applicant declaration and typed signature |
| Verification | Pure state-aware engine (51 jurisdictions) with evidence, advisory format checks and mandatory manual review |
| Email verification | Single-use 48-hex token, emailed link, `/wholesale/verify`, token cleared on use, certificate checks re-run after confirmation |
| Admin | New **Wholesale Customers** and **Wholesale Products** sidebar pages under Wholesale |
| Certificates | Queue, detail, authenticated file streaming, recheck, request information, renewal request, internal notes, full audit timeline |
| Products | Wholesale price (1-unit tier), MOQ, allocation, visibility, volume breaks, bulk price/allocation/MOQ, inquiry count, retail link |
| Inventory | `available_units` allocation exposed to buyers; server-side ceiling on inquiries; no deduction on inquiry |
| Email | Inquiry notification to `ws@himalayankoh.com` with `Reply-To` buyer, buyer acknowledgement, audit row on failure |

## 4. Admin Wholesale Products

`/admin/wholesale/products` — search, filter (offered / not offered / no retail link / all),
inline availability toggle, per-product editor, volume-break editor, bulk update, counts
for unlinked and unpriced products, inquiry reference count, and a link to retail products.
The wholesale unit price is stored as the `min_units = 1` price tier, so there is no second
price field that could disagree with the pricing engine. **Retail prices are never read or
written by this screen.**

Status: **PASS (code + typecheck), NOT TESTED (browser)** — the page requires a console
session (§21).

## 5. Admin Wholesale Customers

`/admin/wholesale/customers` — application list with filter and search; detail with
business/contact/address, certificate number/type/holder/expiry/file metadata, declaration,
email verification, per-check outcomes, missing items, official authority link, reviewer
note, and the audit timeline. Actions: approve, reject, request information, suspend,
recheck, request renewal, save note; certificate file opens in a new tab from an
authenticated blob fetch.

Status: **PASS (code + typecheck), NOT TESTED (browser)** — no console session available in
this environment.

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
`officialAutomationAvailable` is always `false`, in the payload itself.

Storage: certificate bytes are base64 on the application row (`certificate_data`), never in
a web-accessible uploads directory. Every list projection strips the bytes and exposes
`has_certificate`; the only read is `GET /api/admin/wholesale/certificates/[id]/file`,
behind the console session, with `no-store`, `nosniff` and a CSP. A token/row equality check
in `/api/wholesale/verify-email` prevents an older plugin that ignores the token filter from
verifying the wrong application.

## 7. States supported by automated official checks

**None.** No U.S. state publishes a public machine-readable resale-certificate verification
API. The brief anticipated this; the implementation says so on every review screen and gives
the reviewer the authority’s own lookup URL.

What runs automatically for all 51 jurisdictions: document presence/type/size, number
presence and structural sanity, holder-vs-business name similarity, expiry, declaration,
email verification, and a recorded “no official automation” check.

## 8. States requiring manual review

**All 51.** Additionally:

* **Texas** — the only documented number format in the registry (11-digit Comptroller
  taxpayer number). A mismatch is a **warning**, never a rejection, because out-of-state
  numbers can legitimately appear on a Texas resale certificate.
* **Alaska, Delaware, Montana, New Hampshire, Oregon** — no state-level sales tax; no state
  resale certificate exists. These applications route to `PENDING_CERTIFICATE_REVIEW`
  without demanding a certificate, and accept a signed exemption statement.
* **Louisiana, Hawaii, New Mexico, Washington, Florida** — notes record the state-specific
  document or expiry rule a reviewer must apply.

## 9. Buyer authentication and approval flow

Registration → stored `PENDING` + certificate status → verification email (single use) →
console review (manual authority check) → `APPROVED`/`REJECTED`/`MORE_INFO_REQUIRED`/
`SUSPENDED` → approval creates/links the WordPress user (existing behaviour) → buyer signs
in through WordPress credentials → signed wholesale session scoped to the account id.
Every decision writes an audit row. Suspension is re-checked per request, so it applies
before the token expires.

## 10. Wholesale catalog and stock handling

Shared product facts stay in WooCommerce (`woo_product_id`); the trade master adds price
tiers, MOQ, packaging, lead time and now `available_units`. The buyer catalog returns
`availableUnits` and displays “Available to trade” (or “Confirmed per inquiry” when zero =
unset). The inquiry route refuses a quantity above a **configured** allocation with a
message naming the ceiling; an unset allocation is uncapped, because zero is not a claim
that nothing is available. **An inquiry never deducts stock.** Physical stock still moves
only through the confirmed-order flow.

Status: **PASS (code, typecheck)**; the live catalog requires an approved buyer.

## 11. Inquiry generation and totals

`POST /api/wholesale/quotes` stores the request with status `SUBMITTED`, no `sell_total`,
line snapshots (`units`, `cartons`, `pallets`, `unitPriceIndicative`) and the buyer's notes.
The reference `HK-WS-Qxxxxx` is written back after insert. Estimated merchandise value is
the engine's `totals.indicativeMerchandise`, labelled indicative. Totals are computed
server-side from stored tiers; the browser never supplies a price.

## 12. Email notification implementation

`src/lib/email/wholesaleInquiry.ts` builds HTML + text for the trade desk and an
acknowledgement for the buyer. Sent **from** `ws@himalayankoh.com` with `Reply-To` the buyer,
so replies reach the buyer and SPF/DKIM still pass. Recipient overridable with
`WHOLESALE_INQUIRY_EMAIL`, validated by shape with a fallback to `ws@`. Delivery failure
writes `inquiry_email_failed` to the audit table and the response reports the flags; the
stored inquiry is never rolled back.

`sales@himalayankoh.com`, the existing inbox exclusions, HubSpot, cPanel and DNS were **not
touched**.

Status: **PASS (builder, 13 tests), NOT TESTED (live delivery)** — no inquiry was submitted,
so SMTP to `ws@` was not exercised.

## 13. Admin quotation / invoice workflow

Unchanged and still manual, as required: RFQ → review → quotation in the existing console →
document download → external payment link → admin records payment evidence. No payment is
collected inside the wholesale portal, and no invoice is marked paid by entering a URL.
This work did not add any payment automation.

## 14. Security test results

| Check | Result |
| --- | --- |
| Admin certificate queue without a session | **401** (live) |
| Certificate file without a session | **401** (live) |
| Certificate review POST without a session | **401** (live) |
| Invalid confirmation token | **400** (live) |
| Unknown but well-formed confirmation token | **410** (live) |
| Token filter ignored by an older plugin | Row token equality re-checked before any write |
| Certificate bytes in list responses | Stripped in `consoleSnapshot`; only the authenticated file route serves them |
| Certificate file headers | `no-store`, `private`, `nosniff`, restrictive CSP, `inline` only for PDF/JPEG/PNG |
| Buyer prices | Server-computed; quantity ceiling enforced server-side |
| Applicable rate limits | Apply 5/hour/IP, verify 20/hour/IP (existing limiter) |
| WordPress capability gate | Every `hk-wholesale/v1` route still `manage_options`; no public endpoint added; existing source-level test passes |
| Secret scan | `check-build-secrets.mjs` found no server credential in the build |

## 15. Browser test screenshots

Captured with headless Chrome over CDP at true CSS viewports (the desktop browser panel
could not draw because its window was minimised, so a CDP-driven viewport was used).

| # | Surface | File |
| --- | --- | --- |
| 1 | Wholesale landing, desktop 1440 | `qa-wholesale/wholesale-landing-1440.png` |
| 2 | Wholesale landing, tablet 768 | `qa-wholesale/wholesale-landing-768.png` |
| 3 | Wholesale landing, mobile 390 | `qa-wholesale/wholesale-landing-390.png` |
| 4 | Registration, desktop 1440 | `qa-wholesale/wholesale-apply-1440.png` |
| 5 | Registration, tablet 768 | `qa-wholesale/wholesale-apply-768.png` |
| 6 | Registration, mobile 390 | `qa-wholesale/wholesale-apply-390.png` |
| 7 | Registration, mobile 360 | `qa-wholesale/wholesale-apply-360.png` |
| 8 | Confirmation page | `qa-wholesale/wholesale-verify-1440.png` |
| 9 | Wholesale sign-in | `qa-wholesale/wholesale-login-1440.png` |
| 10 | Storefront header, mobile 360 | `qa-wholesale/home-header-360.png` |

![Wholesale landing desktop](qa-wholesale/wholesale-landing-1440.png)
![Registration mobile 390](qa-wholesale/wholesale-apply-390.png)

**Not captured:** pending-approval screen inside the portal, admin Customers page, admin
Products page, approved-buyer dashboard, inquiry summary, admin inquiry detail — all require
an application, an approval and a console session, which the plugin blocker prevented.

## 16. Desktop / mobile QA

| Viewport | Inner width | Document width | Horizontal overflow |
| --- | --- | --- | --- |
| 1440 | 1440 | 1440 | none |
| 768 | 768 | 768 | none |
| 390 | 390 | 390 | none |
| 360 | 360 | 360 | none |

Form fields present and labelled at every width: 51 states + DC select, file input, date
input, declaration. Clicking Submit with an empty certificate state produced the inline
message “Choose the state that issued your resale certificate.” with no network write.
The mobile drawer renders the Wholesale entry (same `navLinks` array as desktop).

## 17. Test and build results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run lint` | **PASS** (exit 0; warnings only, none introduced by this change after the final fix) |
| `npm test` | **PASS** — 234 files, 229 passed / 5 skipped; 2,464 tests passed / 24 skipped |
| New tests | 38 verification/registry + 13 inquiry-email = **51** |
| `npm run build` | **PASS** — Next build completes; post-build public-origin and secret scans pass |
| Production build artifact | Not deployed |

## 18. Database changes and migrations

WordPress plugin `hk-wholesale` **1.2.1 → 1.3.0**, schema **v7 → v8**. Additive only; no
column dropped, no row rewritten. `dbDelta` plus the plugin’s own table/column verification
applies it on first load.

`applications` added: `dba`, `address_line1`, `address_line2`, `city`, `state`, `zip`,
`shipping_address` (json), `resale_state`, `resale_number`, `resale_type`, `resale_holder`,
`resale_expires`, `certificate_file_name`, `certificate_file_type`, `certificate_file_size`,
`certificate_data`, `certificate_status`, `certificate_checks` (json),
`certificate_official_url`, `certificate_reviewed_at`, `certificate_reviewed_by`,
`certificate_notes`, `declaration_name`, `declaration_at`, `email_verified_at`,
`email_verification_token`; new index on `certificate_status`.

`products` added: `available_units`.

No other table changed. No data migration was run, and no production record was read or
written destructively.

## 19. Git branch and commit SHA

Branch `integration/cloudflare-workers-migration`, based on `f54daa0`. The commit SHA for
this work is recorded in the end-of-task message and in `git log -1` after the commit.

## 20. Staging deployment URL and version

**Not deployed.** `preview.himalayankoh.com` still serves the previous build. The intended
sequence (plugin v1.3.0 first, then the Worker) is stated in §21.

## 21. Unresolved blockers

1. **Plugin upload could not be automated (blocking all registration flows).**
   `scripts/install-wordpress-plugins.mjs --update hk-wholesale` authenticated successfully
   (“login: OK”) but could not parse `wp-admin/plugins.php` (44,981 bytes, no recognised
   markers), so it **did not upload** — no partial change was made. No PHP binary or Docker
   is available here to lint the plugin, so uploading it unverified was not appropriate.
   The built artifact is `deploy/hk-wholesale.zip` (version 1.3.0, 18,096 bytes; SHA-256
   printed by `npm run pack:plugins`).

   **Owner action:** WordPress admin → Plugins → Add New → Upload Plugin →
   `deploy/hk-wholesale.zip` → “Replace current with uploaded”. The plugin reports schema
   `v8 (complete)` on `/settings` after the first load. Until then
   `POST /api/wholesale/apply` answers **503** with a clear email fallback and writes
   nothing — verified live against the current v7 staging store.

2. **Staging Worker deploy not attempted.** It requires a fresh `vinext` artifact and
   Cloudflare credentials; deploying the app before the plugin would put the code ahead of
   its schema and take applications offline on preview. Sequence: plugin → verify schema →
   `npm run build:deploy` → `npm run deploy:staging`.

3. **No console session for admin UI browser tests.** The environment had no admin session,
   and the owner’s WordPress password was deliberately not handled in automation. The pages
   compile, typecheck and their APIs return 401 without a session, but their rendered
   behaviour is unverified.

4. **Portal / inquiry browser tests not run.** They require an approved buyer, which
   requires the plugin upgrade and an admin approval.

5. **Live `ws@` delivery not exercised.** No inquiry was submitted, so the SMTP path and
   mailbox routing for `ws@himalayankoh.com` remain unproven in this pass. The mailbox was
   already listed in the inbox configuration; this work did not create or change it.

## 22. Requirement status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Audit and reuse existing module | PASS | §1–2 |
| Header + mobile Wholesale button | PASS | browser snapshot, screenshots |
| Public landing with required disclosures | PASS | screenshot; copy added |
| U.S. business registration fields | PASS | DOM field check, screenshot |
| Resale certificate upload + private storage | PASS (code) / BLOCKED (live) | engine tests, storage guard 503 |
| State-aware verification engine | PASS | 38 tests, 51-jurisdiction registry |
| Official automation claimed honestly | PASS | payload flags, UI copy |
| Admin certificate queue/detail/actions | PASS (code) / NOT TESTED (browser) | routes, typecheck, 401s |
| Admin Wholesale Customers sidebar page | PASS (code) / NOT TESTED | page + nav entry |
| Admin Wholesale Products sidebar page | PASS (code) / NOT TESTED | page + nav entry |
| Buyer portal + catalog (existing) | PASS (preserved) | build, route list |
| Allocation display + server ceiling | PASS (code) | route logic, typecheck |
| Inquiry-first, no online payment | PASS | no checkout added; copy |
| Inquiry stored with reference/snapshots | PASS (existing path, extended) | quote route |
| `ws@` notification with Reply-To + logging | PASS (builder) / NOT TESTED (live) | 13 tests |
| Manual quotation/invoice workflow | PASS (preserved) | no change |
| Security: no public prices / certs | PASS | projections, 401s, tests |
| Responsive desktop/tablet/mobile | PASS | CDP viewport measurements + screenshots |
| Typecheck / lint / tests / build | PASS | §17 |
| Staging deploy | BLOCKED | §21 |
| Production deploy | NOT ATTEMPTED (by instruction) | — |

---

## Mandatory owner-side follow-ups

1. Upload `deploy/hk-wholesale.zip` to the staging WordPress and confirm schema v8.
2. Rebuild and deploy the Worker to `preview.himalayankoh.com`; run one synthetic
   application through registration → email confirmation → console approval → buyer login →
   inquiry, then confirm `ws@` received the notification.
3. **Rotate every credential that was pasted into the chat** (GitHub token, WooCommerce
   consumer key/secret, Cloudflare tokens, WordPress administrator password, Namecheap
   password). None of them were written into this repository, but they must be considered
   exposed.
