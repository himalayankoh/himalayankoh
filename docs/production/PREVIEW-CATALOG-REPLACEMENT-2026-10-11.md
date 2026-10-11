# Owner-approved preview catalog replacement

The owner's final instruction replaces the earlier matching/2-and-6-lb merchandising plan: copy all six published preview products as new products and retire the previous production listings. No order/customer/payment records were edited. Old products were moved to recoverable WooCommerce Trash, never permanently deleted.

| Preview ID | New production ID | SKU | Listed weight | USD price | Stock |
|---|---|---|---|---|---|
| 2752 | 2544 | HK-LB-30LBS | 30 lb | 49.95 | 10 |
| 2721 | 2543 | HK-LFH-2lbs | 2 lb | 19.95 | 10 |
| 2716 | 2539 | HK-LFC-45lbs | 45 lb | 49.95 | 10 |
| 2710 | 2536 | HK-ESF-6lbs | 6 lb pouch | 19.95 | 10 |
| 2704 | 2531 | HK-ESF-3lbs | 3 lb | 19.95 | 10 |
| 2653 | 2526 | HK-ESF-16oz | 16 oz jar | 9.95 | 10 |

All six are genuine simple WooCommerce products, exactly like preview; no variation IDs or duplicate child cards were invented. The public order is preview's order above. The former separate 6 lb horse-lick and 18 lb bag are absent from this final preview catalog. Retired parent IDs: 2520, 2461, 2446, 2372, 2367, 2352, 2321, 271, 281. Existing order references remain intact.

## Source and media

Names, source descriptions, prices, SKUs, categories, source slugs, active status and stock were checked against the live preview WooCommerce API. All 21 original photo slots returned HTTP 200 and matched the original preview photograph bytes using SHA-256. New upload media IDs differ between installations; identical existing originals were reused only after complete byte verification. No generated or unrelated photographs were used.

Necessary operational differences: production stores kg/cm while preview stores lb/in, so physical weights/dimensions were converted rather than changing global store units. Preview's 2 lb native weight contradicted a stale 6 lb specification: the copied specification is 2 lb/32 oz. Preview left the 16 oz jar's native weight blank; the owner-confirmed 1 lb equivalent was stored. Fixed delivery min/max metadata was excluded at the owner's request. Source photos for the 3 lb item include 6 lb pouch packaging; they were preserved as requested, but a correct 3 lb package photograph still needs owner confirmation. The 2 lb source description references both 2 and 6 lb sizes; its original prose was retained, without inventing a second SKU.

## Loading and cache causes

External WooCommerce import writes did not invoke the storefront's cache invalidation. The API refreshed before the rendered listing, leaving an old seven-card page while WooCommerce already held the six new products. A same-name save through the authenticated existing product API invoked its established purge; the actual mobile browser then displayed the six new listings. No public caching of admin, carts or checkout was introduced.

The admin products screen waited for category and promotion reads before displaying a successful product response. The fix renders products as soon as their own request completes and loads optional filters independently. Request-generation and mounted guards prevent stale asynchronous results from overwriting a later reload. WooCommerce's numeric dash entities in cart product names are now decoded as display text.

The hosting Resource Usage dashboard reported CPU, physical-memory and I/O limits within the preceding 24 hours. Origin JSON requests intermittently timed out while static media remained healthy. This is a confirmed remaining performance limitation, not proof that a particular request caused those resource faults. Measured catalog API cache hit: 111 ms; fresh search read: 3,181 ms; direct WooCommerce read: 7,897 ms. Seven new-ID Shippo quotes returned HTTP 200 with eight options each, taking 2,902–17,824 ms. No universal 2.5-second LCP claim is made.

## Delivery and commerce

Delivery Min Days / Delivery Max Days were removed from both product editor forms, save payloads, listing mapping and merchant delivery-time schema. Address-specific Shippo responses remain the source of delivery estimates. Existing shipping fee and return-policy schema were preserved. Seven pieces of the new 2 lb lick produced two parcels, confirming the approved six-per-box boundary. No shipping label or paid transaction was created.

Stripe readiness returned HTTP 200, live mode, configured and webhook configured. Guest admin orders returned 401/no-store. The previous unpaid QA reservation 2522 remains pending, unpaid and references original variation IDs 1548/1549; it was not changed by this replacement.

## Release evidence

Catalog release: `c6bf95dff33184a18fb61b1d4c07ff323c5d0a2e`, Cloudflare version `d02a77f7-38ba-4e60-a823-b1cff0529069`, deployment `284a7f90-0bf0-48de-94b1-165e6ae6ed35`. The actual apex `/api/version` returned that SHA. Full tests: 198 suites passed, 5 skipped; 2,111 tests passed, 19 skipped. Typecheck, lint, final Next.js production build and guarded Cloudflare build passed. All 35 production binding names/types and both order-pause flags were preserved; orders remain enabled.

Post-deployment authenticated admin browser showed six public products with stock 10. Shipping tab no longer contains Delivery Min/Max Days. The live 2 lb cart added genuine product 2543, changed quantity from one to two and recalculated $19.95 to $39.90. Cart titles correctly decode the original dash entity. Checkout navigation displayed the contact/address form; no address or payment was submitted. Browser inspection temporarily stalled, then recovered. Only the agent's test line was removed; the recovered browser confirmed the cart empty. Temporary QA viewport overrides were reset. No paid transaction was performed.

All six detail galleries were exercised in the real Chromium browser: 21/21 selectable original images loaded. Catalog layouts were checked at actual 360×800, 390×844, 375×812, 430×932, 768×1024 and 1440×900 viewport dimensions, without horizontal overflow. Consent Decline persisted, floating controls were suppressed while the banner was open, and footer accordion links expanded. These are viewport tests, not physical Android/iPhone tests.

Post-release mobile lab catalog measurement: LCP 3,068 ms, CLS 0, TTFB 2,517.6 ms; INP unavailable because no measured interaction occurred. Conditions: 390×844, DPR 1, Chromium, 150 ms network latency, 204,800 bytes/sec download, 96,000 bytes/sec upload, 4× CPU slowdown, existing browser cache. This is one laboratory sample, not field Core Web Vitals. LCP exceeds the requested 2.5-second target.

Final browser inspection also caught a pre-existing admin measurement contract defect: raw native kg/cm values were labelled lb/in. The follow-up fix normalizes authenticated admin product DTOs to lb/in and converts admin saves back into verified native store units. Unknown units refuse a save; settings are deduplicated and cached for five minutes. No WooCommerce database weight, global unit setting or Shippo calculator is changed by this code fix. Its round-trip tests cover the imported 30 lb product (13.607771 kg) and 8.5×7.5×6.5 in box (21.59×19.05×16.51 cm).

The owner reconfirmed preview titles for every listing. Fresh preview and original Woo source both call product 2752 “Himalayan Koh 30 lb Red Rock Salt Lick for Cattle”; production 2544 retains that title. Existing shared storefront title/unit normalization is the same in preview and production.

Private ignored evidence: `qa-visual-artifacts/preview-replacement-backup.json`, `preview-replacement-journal.json` (verified), `preview-replacement-verified.json`, `preview-original-photos.json`, `preview-import-shippo-quotes.json`, release logs and browser screenshots. These are not committed.

Rollback: prior Worker version `14229f2f-1641-4d2d-965f-24f91c8752db`, source `42d6227fae8abdbcfcf9b5d4213af48a9b387b5a`. Worker rollback does not undo catalog data: restore prior parent/child statuses and slugs from the saved backup after retiring the six copies, preserving SKU uniqueness and order references. Do not rerun the verified import journal or permanently delete old records.

Files: catalog import operator/helper and safety tests; CatalogAdmin; progressive loading helper/tests; catalog mapping/read tests; merchant schema/tests; WooCommerce text decoder/tests; this report.

## Final measurement release and acceptance

Deployed code SHA: `5bd49e221ce1beaa9fb43e955150818e3918936f`. Cloudflare version: `cf2e8aef-0cca-486a-ad5c-a733f4124e72` at 100%; deployment: `f5b9dd1e-ca7e-472a-84f9-2b9682bcaa66`. The apex version endpoint confirms this SHA. All 35 binding names/types and order-pause flags still match the pre-release snapshot. Stripe remains configured/live/webhook configured; unauthenticated admin orders return 401 with no-store. Final tests: 199 suites passed, 5 skipped; 2,115 tests passed, 19 skipped. Typecheck, lint, Next.js production build and Cloudflare production build passed. Both build outputs passed origin and 28-variable secret scans.

Authenticated live read verified all six admin weights as 30/2/45/6/3/1 lb, original prices and stock 10. Final browser verified 30 lb and 8.5×7.5×6.5 in in the Shipping editor, with no fixed delivery-day fields. No Save action or material database write was used for that check. Final mobile catalog had six products, no horizontal overflow, and a working menu open/close cycle. Newsletter accordion expanded its input and collapsed again. Final shop console error log was empty. Original media/raw Woo verification passed after the catalog release; the measurement follow-up touches only authenticated admin product APIs, preserving storefront, cart, checkout and Shippo code.

Immediate code rollback is now catalog release version `d02a77f7-38ba-4e60-a823-b1cff0529069` (`c6bf95d`); the pre-catalog Worker/data restoration path above is retained separately. Both catalog backups and previous versions are available.

| Acceptance | Result |
|---|---|
| PRODUCT VARIATIONS | PASS: final preview uses six genuine simple products; obsolete 4 lb offering retired |
| 2 LB SALT LICK | PASS: 2543, HK-LFH-2lbs, $19.95, 10 pieces |
| 6 LB SALT LICK | Superseded: final preview has 6 lb pouch 2536, not a separate 6 lb horse lick |
| 30 LB PRODUCT IMAGE | PASS: both original photos verified |
| 18 LB PRODUCT IMAGE | Superseded: absent from owner-selected final preview; retired |
| PRODUCT GALLERIES | PASS: 21 original photo slots, HTTP 200, byte identity, real browser display |
| MOBILE PRODUCT CARDS / PRODUCT DETAIL UX | PASS in tested Chromium viewports |
| COMPACT FOOTER / COOKIE CONSENT / MOBILE NAVIGATION | PASS in browser checks; Decline persisted |
| ADD TO CART | PASS: 2543, quantity and subtotal recalculation; test item removed |
| PERFORMANCE | LCP 3.068 s, CLS 0, TTFB 2.518 s in stated lab conditions; LCP target not met |
| MOBILE BROWSER QA | PASS for stated viewport checks; physical Android/iOS and exhaustive device matrix remain unverified |
| TYPECHECK / TESTS / BUILD | PASS |
| DEPLOYED SHA | 5bd49e221ce1beaa9fb43e955150818e3918936f |
| PRODUCTION VERIFICATION | PASS for catalog, media, admin units, cart/navigation and payment-readiness checks |
| STRIPE AND ORDERS | Preserved; live readiness and webhook configuration verified, no paid test |
| ROLLBACK READY | YES |

Remaining: hosting CPU/memory/I/O saturation and variable fresh-origin latency; correct original 3 lb packaging photo requires owner confirmation. Native device testing and paid settlement are not claimed.

```text
PROJECT: Himalayan Koh
REPOSITORY: https://github.com/himalayankoh/himalayankoh.git
LOCAL PATH: C:\Users\basco\Downloads\hk\himalayan-koh
BRANCH: integration/cloudflare-workers-migration
CHANGES: Six preview copies; old listings soft-trashed; original media; progressive admin loading; delivery days removed; cart entity decoding; admin lb/in conversion
TESTS: Typecheck/lint passed; 2115 passed / 19 skipped; browser and API evidence above
BUILD: Next.js and guarded Cloudflare production builds passed
COMMIT: c6bf95d catalog release; 5bd49e2 final code release
PUSH STATUS: Both code commits pushed to active origin; report-only commit follows
DEPLOYMENT: Actual apex SHA 5bd49e221ce1beaa9fb43e955150818e3918936f verified
BLOCKERS: LCP goal unmet; hosting limits; source 3 lb photo ambiguity; physical mobile hardware unavailable
NEXT ACTION: Resolve hosting resource capacity/latency and obtain confirmed original 3 lb packaging photo; then repeat performance/device measurements
```
