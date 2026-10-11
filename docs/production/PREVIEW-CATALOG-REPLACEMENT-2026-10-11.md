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

Full tests: 198 suites passed, 5 skipped; 2,111 tests passed, 19 skipped. Typecheck and lint passed (existing lint warnings remain). Final Next.js build and Cloudflare build/deployment results will be recorded after the frozen-source release checks finish.

Private ignored evidence: `qa-visual-artifacts/preview-replacement-backup.json`, `preview-replacement-journal.json` (verified), `preview-replacement-verified.json`, `preview-original-photos.json`, `preview-import-shippo-quotes.json`, release logs and browser screenshots. These are not committed.

Rollback: prior Worker version `14229f2f-1641-4d2d-965f-24f91c8752db`, source `42d6227fae8abdbcfcf9b5d4213af48a9b387b5a`. Worker rollback does not undo catalog data: restore prior parent/child statuses and slugs from the saved backup after retiring the six copies, preserving SKU uniqueness and order references. Do not rerun the verified import journal or permanently delete old records.

Files: catalog import operator/helper and safety tests; CatalogAdmin; progressive loading helper/tests; catalog mapping/read tests; merchant schema/tests; WooCommerce text decoder/tests; this report.
