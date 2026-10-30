# Listed shipping weights and Woo variation quote repair

The owner instructed on 2026-10-11 to use the weights shown on listings. This supersedes the earlier 3 kg packed-weight approval for 6 lb variation 1548. WooCommerce's store unit remains kg; converted values represent the listed pound weights.

## Live product weights

| Sellable ID | Parent | SKU | Listed lb | Woo kg |
| --- | --- | --- | ---: | ---: |
| 1549 | 281 | HK-LFH-2lbs | 2 | 0.907185 |
| 1548 | 281 | HK-LFH-6lbs | 6 | 2.721554 |
| 2466 | 2461 | HK-ESF-3lbs | 3 | 1.360777 |
| 2450 | 2446 | HK-ESF-16oz | 1 (16 oz) | 0.453592 |
| 2322 | 2321 | HK-ESF-6lbs | 6 | 2.721554 |
| 2323 | 2321 | HK-ESF-6lbs | 6 | 2.721554 |
| 2520 | — | HK-LB-30LBS | 30 | 13.607771 |
| 271 | — | HK-LFC-45lbs | 45 | 20.411657 |

Only three weight fields required writes: variation 1548 (3 kg → 2.721554 kg), jar variation 2450 and uniform-size jar parent 2446 (empty → 0.453592 kg). The mixed-size parent 281 retains an unset weight. Other records already matched. Prices, SKU, stock, status, title, slug and attributes were checked before and after each write and preserved. No stock replenishment scripts were reapplied. A second dry run reported zero changes.

## Root cause and fix

Woo `/wc/v3/products?include[]=1548&include[]=1549` returns no variations. The shipping reader consequently had neither weight nor product identity and production quotes returned HTTP 422, “Unknown product.” Actual individual `/wc/v3/products/1548` and `/1549` reads return the genuine variation and its own weight.

The reader now fetches only IDs absent from the collection through that verified individual endpoint, with a concurrency cap of ten. A real 404 remains absent; the reader does not substitute a parent or sibling. Simple products already returned by the batch incur no extra requests. No cache, payment, order creation, shipping-rate fallback or label-purchase logic was changed.

## Tests and production evidence

- Typecheck and lint passed. Lint retains existing unrelated warnings.
- Full Vitest run: 193 suites passed, 5 skipped; 2,091 tests passed, 19 skipped.
- Shipping-focused run: 77 tests passed. Eight added regressions cover omitted variation IDs, a real missing ID, kg conversion, genuine child identity and the per-box Shippo requests.
- `npm run build` passed, including public-origin and secret scans.
- Cloudflare production artifact build passed with private environment loading disabled; public-origin, production-target and credential scans passed.
- Production `/api/version` reports source commit `8e684d4ca55cc83ac6e1e5859dfcf925eea5cbd8`.
- Eleven production quote scenarios returned HTTP 200 with eight carrier options each: all eight sellable IDs plus multi-box 2 lb, multi-box 6 lb and mixed licks.
- 7 × 2 lb: two rate IDs per combined service; 5 × 6 lb: two; mixed 7 × 2 lb + 5 × 6 lb: four. Tests independently assert corresponding parcel weights 12/2, 24/6 and 12/2/24/6, with 10 × 10 × 6 in dimensions.
- Mobile Chromium at 390 × 844: 6 lb option selected, SKU HK-LFH-6lbs, price $17.95, Add to Cart successful; cart displays genuine 6 lb line. Checkout accepted a public QA address, verified it with USPS, and displayed live USPS/UPS prices and carrier estimates. No horizontal overflow.
- Stripe config: HTTP 200, live, configured, webhook configured. Cart: HTTP 200 with no-store. Anonymous admin orders: HTTP 401 with no-store.
- All 35 Worker binding names/types and ordering flags were preserved; ordering flags remain false for paused status. No DNS or payment configuration was changed.
- No paid checkout or shipping-label purchase was executed. Only the agent's QA cart item was removed.

## Deployment and rollback

Established guarded workflow: safe production artifact build, then `node scripts/deploy-production.mjs --skip-build`. Version `0c645c34-eca7-437c-81be-33fae334395d` is deployed at 100%. Previous production version `50e3a436-63a3-48d1-864d-12a305f7122f` was recorded before release for rollback. Weight-only backups are private under `.git`; restoring source or inventory broadly is not a rollback step.

## Limits

This verifies listed weights, quote generation and the PDF's 2/6 lb parcel behavior, not physical packed weights or label fulfillment. Other products retain their existing packing rules; no new carton dimensions were invented. The earlier catalog report's 3 kg entry is historical and superseded by this report. Existing 3 lb product photos have the previously reported package-label ambiguity; this shipping change does not replace them. The historical owner-selection script guards the old 3 kg decision and must not be reapplied to reset current weights or stock.

```text
PROJECT: Himalayan Koh
REPOSITORY: https://github.com/himalayankoh/himalayankoh.git
LOCAL PATH: C:\Users\basco\Downloads\hk\himalayan-koh
BRANCH: integration/cloudflare-workers-migration
CHANGES: Variation shipping reader, 8 regressions, guarded weight-only maintenance script, updated 6 lb parity-report weight
TESTS: Typecheck/lint PASS; 2,091 tests PASS, 19 skipped; live quote and mobile checkout QA PASS
BUILD: Next.js and Cloudflare production artifact PASS; credential scans PASS
COMMIT: 8e684d4ca55cc83ac6e1e5859dfcf925eea5cbd8 (deployed source)
PUSH STATUS: Source pushed to active origin
DEPLOYMENT: Production SHA verified; Worker version 0c645c34-eca7-437c-81be-33fae334395d at 100%
BLOCKERS: None for listed-weight and variation-quote repair; label purchase and physical packing untested
NEXT ACTION: No further action required for this fix; confirm other product carton measurements separately
```
