# Final mobile storefront verification — 2026-10-11

Historical report for release `42d6227`, before the owner's subsequent literal preview replacement. Its product counts, 2/6 lb featured-card plan and inventory facts describe that earlier catalog. The current catalog and loading release is documented in `PREVIEW-CATALOG-REPLACEMENT-2026-10-11.md`.

The frontend release is live. Product prices, stock, published variants, listed weights, existing orders, payment secrets and DNS were not changed in this task. Performance and native-device acceptance remain incomplete; this report does not equate a passing build with full acceptance.

## Exact acceptance report

CURRENT PRODUCTION SHA: `42d6227fae8abdbcfcf9b5d4213af48a9b387b5a`

PREVIOUS SHA: `8e684d4ca55cc83ac6e1e5859dfcf925eea5cbd8`

ALREADY FIXED ITEMS: Genuine 2/6 lb cards first; WooCommerce variation mapping; original-media URL normalization; responsive product cards; compact footer; consent and floating-control coordination; mobile navigation; listed weights; Shippo child lookup. These existing fixes were preserved.

NEWLY FIXED ITEMS: Server-selected variant on first render; direct gallery photo navigation and horizontal pointer dragging; keyboard photo controls; delayed hidden-photo probes; product specifications; deferred genuine related products; removal of speculative homepage/catalog prefetches; image-origin preconnect; optional console-only INP diagnostics.

| Required item | Result | Evidence / qualification |
| --- | --- | --- |
| PRODUCT DATA | PASS | Eight genuine sellable IDs read before and after release and again after browser QA; prices, SKU, weight, stock and publication preserved |
| 2 LB SALT LICK | PASS | Parent 281, child 1549; $19.95; correct cart and unpaid reservation line |
| 6 LB SALT LICK | PASS | Parent 281, child 1548; $17.95; correct cart and unpaid reservation line |
| OTHER VERIFIED WEIGHTS | PASS | 3/6/30/45 lb and 16 oz = 1 lb; Woo store units remain kg |
| SHIPPO INTEGRATION | PASS | Eleven quote scenarios: HTTP 200, eight carrier options each; expected multi-box counts |
| 30 LB PRODUCT IMAGE | PASS | Product 2520; genuine two-photo gallery inspected in production |
| 18 LB PRODUCT IMAGE | PASS for retained originals | Product 291 remains draft under the owner's earlier preview-only decision; all nine original image URLs return 200; no public card was restored |
| PRODUCT GALLERIES | PASS for tested controls and originals | Six parent galleries contain 21 selectable original-photo slots; the shared 2/6 lb parent makes 27 slots across seven card destinations. Counters and navigation were exercised; an image captured before its download completed was rechecked loaded rather than called missing |
| MOBILE PRODUCT CARDS | PASS | First cards are 2/6 lb; responsive images, price, quantity and purchase controls; no page overflow at six viewport sizes |
| MOBILE PRODUCT DETAIL | PASS | Genuine variant price/SKU/stock, photo selection, quantity, specs, description, shipping/returns links and real related catalog |
| COMPACT FOOTER | PASS | Accessible newsletter/support accordions open/close; business contact and policies retained; newsletter QA address confirmed stored in WordPress |
| COOKIE CONSENT | PASS | Decline persists after reload; privacy link remains usable; floating controls suppressed while banner is open |
| MOBILE HEADER | PASS | Menu opens/closes at mobile/tablet widths; search returns six genuine parent products; Escape closes search; category navigation and sign-in form open |
| CART FUNCTIONALITY | PASS | 2/6 lb additions, cart quantity 2 → 1, correct totals, checkout navigation and removal of only QA lines; QA cart ended empty |
| CHECKOUT PRESERVED | PASS without payment | USPS-verified public QA address; eight carrier options; Stripe card, Afterpay, Affirm, bank, Cash App and Klarna controls loaded. No payment or shipping label bought |
| PREVIEW PARITY | PASS for approved catalog mapping | Matching genuine SKU/price/stock mapping; intentional ID, variation, unit and design differences retained; photo ambiguity below remains |
| MOBILE PERFORMANCE | Actual measurements below | Warm shop meets the LCP target; detail and cold-origin observations do not. No Lighthouse or field percentile invented |
| BROWSER QA | PASS for available Chromium viewport interactions; FAIL for full native-device coverage | 360×800, 375×812, 390×844, 430×932, 768×1024, 1440×900. Physical Android Chrome/iOS Safari are unavailable; pointer drag is not represented as physical touch testing |
| TYPECHECK | PASS | Standalone and production-build checks |
| LINT | PASS | Existing image-element warnings; no lint errors |
| TESTS | 2,101 PASSED / 0 FAILED | 196 passed suites; five suites / 19 gated tests skipped; final run used two workers |
| BUILD | PASS | Next production build and Cloudflare artifact build; production-origin/configuration and private-credential scans passed |
| DEPLOYMENT | PASS | Established guarded workflow; domain source SHA and Cloudflare deployed version read back |

FINAL PRODUCTION SHA: `42d6227fae8abdbcfcf9b5d4213af48a9b387b5a`

BEFORE/AFTER SCREENSHOTS: Saved locally under `qa-visual-artifacts` and the existing parent workspace screenshot directory; see artifact list below. Documentation commits after this release do not change the runtime source SHA.

REMAINING ISSUES: Dedicated owner-confirmed 3 lb package photograph; homepage/detail and cold-origin performance; physical Android/iPhone swipe/browser coverage. One first post-deploy Stripe-config read returned 503; a repeat and three further reads returned 200, live/configured/webhook-present. No fault was concealed by reporting only the successful read.

OWNER ACTION REQUIRED: Supply the confirmed photo for `HK-ESF-3lbs`; perform physical Android/iPhone checks. Checkout QA left unpaid reservation 2522; it must not be fulfilled as a paid customer order. Existing orders were not edited, and no cancellation/deletion was performed to hide this reservation.

FINAL VERDICT: PARTIALLY READY — verified frontend improvements are deployed and commerce checks pass, with the stated media, performance and native-device limits.

## Root causes and changes

- Variant-specific links previously selected their child after a client effect, allowing a parent range/unchosen state on the first render. The server now validates the requested child against the real public option list and seeds the initial selection. Invalid/private 1547 is not promoted. Cart behavior continues using genuine child IDs.
- The gallery's fade-to-zero/wait transition left a blank interval while switching photos during QA. Direct keyed images remove that transition and the gallery's motion dependency. No claim is made that automation stalls prove a universal production animation failure.
- Photo probes began alongside the critical image. They now start after the hero loads. Responsive-candidate fallback and rejection of failed originals remain intact; original product photos were not generated or substituted.
- Product lookup supplied an empty related list, so no related section appeared. The existing shared public catalog reader now runs when that section approaches the viewport; unavailable/unpriced/duplicate/current-parent items are excluded. Failures do not hide the purchasable product.
- Plain homepage and shop links could speculate WooCommerce-backed renders during detail loading. They now wait for navigation. Private routes remain unprefetched and private responses retain no-store behavior. The commerce freshness boundary was not extended.
- Product specifications now show known category/selected SKU/size without guessing shipping units. Only the existing public image origin receives a preconnect. Lab INP diagnostics are opt-in, console-only and do not transmit or store telemetry.

## Product mapping, preserved after browser QA

| Parent | Sellable ID | SKU | Price USD | Listed weight | Woo kg | Stock |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| 281 | 1549 | HK-LFH-2lbs | 19.95 | 2 lb | 0.907185 | 10 |
| 281 | 1548 | HK-LFH-6lbs | 17.95 | 6 lb | 2.721554 | 10 |
| 2461 | 2466 | HK-ESF-3lbs | 19.95 | 3 lb | 1.360777 | 10 |
| 2446 | 2450 | HK-ESF-16oz | 9.95 | 16 oz / 1 lb | 0.453592 | 10 |
| 2321 | 2322 | HK-ESF-6lbs | 19.95 | 6 lb, fine | 2.721554 | 10 |
| 2321 | 2323 | HK-ESF-6lbs | 19.95 | 6 lb, coarse | 2.721554 | 10 |
| — | 2520 | HK-LB-30LBS | 49.95 | 30 lb | 13.607771 | 10 |
| — | 271 | HK-LFC-45lbs | 49.95 | 45 lb | 20.411657 | 10 |

The genuine 4 lb child 1547 remains draft, as previously approved; it was not renamed into 6 lb. The retired 18 lb parent 291 and other previously retired/unpriced choices were not deleted or republished.

Preview uses six simple products and a separate staging Woo database with pound units. Production retains historical parent/variation IDs and kg units. Preview IDs 2721/2752/2716/2710/2704/2653 map by genuine SKU to the live items above; owner-published 6 lb lick 1548 has no separate preview product. Its established $17.95 price is preserved. Production has seven cards and eight sellable IDs, not duplicate fake WooCommerce products.

Twenty-one live original media URLs were read and returned HTTP 200; the private QA mapping records product/media IDs and source URLs. Nine retained 18 lb originals also returned 200. Previously corrected `/staging/` routing and source-media priority were preserved. The 3 lb SKU's retained preview images show or refer to 6 lb packaging: an authoritative 3 lb package photo is needed, not an invented replacement.

## Commerce and deployment evidence

The domain `/api/version` returns the source SHA above. Cloudflare Worker version `14229f2f-1641-4d2d-965f-24f91c8752db` is deployed at 100%. All 35 binding names/types and both order-pause flags match the pre-release snapshot; paused flags remain false. No DNS, payment configuration or secret was written.

Rollback is ready to the prior Worker version `0c645c34-eca7-437c-81be-33fae334395d`, using the established Wrangler rollback workflow. A source rollback does not require resetting inventory, products or orders. The deploy script's historical statement that the apex remains WordPress is outdated; the actual live domain version was verified independently.

Eleven live Shippo quote checks cover all eight sellable IDs, 7×2 lb, 5×6 lb and the mixed order. Every scenario returned eight rates. Combined service IDs represent two/two/four parcels for the split/mixed cases. Existing packing tests assert six 2 lb pieces or four 6 lb pieces per 10×10×6 inch carton, no mixed lick carton, and actual parcel weights. No label fulfillment/purchase claim is made.

Woo readback of unpaid QA reservation 2522 confirms parent 281 with child 1549/SKU HK-LFH-2lbs at $19.95 and child 1548/SKU HK-LFH-6lbs at $17.95, quantity one each. Status is pending, date_paid absent, total $59.09 including selected shipping. No pay/confirm action was invoked. Only the agent's own cart lines were removed; existing orders and other customer carts were not edited.

Anonymous admin orders return 401/no-store. Version, cart and Stripe configuration retain no-store. Final catalog readback after browser QA confirms all eight stock quantities still 10 and every listed price/weight unchanged. The newsletter QA address is present exactly once in WordPress; this verifies storage, not outbound delivery.

## Measurements

Opt-in console observations, not Lighthouse scores or field percentiles. Throttled reads configured a 390×844 viewport, 150 ms network latency, 204,800 B/s down, 96,000 B/s up, 4× CPU and disabled browser cache. Edge-cache state remains separate from browser cache.

| Page / observation | LCP | CLS | TTFB |
| --- | ---: | ---: | ---: |
| Earlier release warm shop, same configured throttling (historical comparison) | 2.264 s | 0.0040 | 0.054 s |
| New release warm shop, throttled | 2.028 s | 0.00288 | 0.045 s |
| Earlier release warm detail, configured throttling (historical comparison) | 3.628 s | 0.0017 | 0.084 s |
| New release warm 6 lb detail, throttled | 3.252 s | 0.00169 | 0.107 s |
| New release cold homepage, throttled | 7.728 s | 0.02003 | 4.775 s |
| Old production detail, initial unthrottled observation in this task | 10.116 s | 0.00645 | 8.795 s |
| New detail, unthrottled repeat with six observed interactions | 1.936 s | 0.000383 | 1.766 s |

The unthrottled repeat recorded provisional INP 104 ms from six observed interactions. A separate exploratory automation/scroll/consent run logged INP 904 ms and CLS 0.664; it is recorded rather than represented as a clean controlled benchmark. No-interaction reads report INP null, never an invented zero. Automation viewport/screenshot resizing and tab stalls limit comparisons; these single samples do not establish a percentage speed improvement.

The clean throttled shop transfer captured 322,959 encoded script bytes across 75 script responses and 131,035 encoded image bytes across seven image responses. The debugger event capture was neither truncated nor paginated, and recorded no public HTTP errors for that load. The earlier task baseline's critical detail image response transferred 88,860 encoded bytes. These are browser transfer observations, not uncompressed bundle totals.

Cold page latency remains dominated by Woo/origin reads. The 60-second commerce freshness boundary was preserved. Warm detail still exceeds the approximate 2.5-second LCP aim; full performance acceptance is not passed.

## Validation, artifacts and files

`npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2`, `npm run build` and the guarded Cloudflare build passed. The final suite reports 196 passed / five skipped suites and 2,101 passed / 19 skipped tests. An earlier concurrent run hit four existing 5-second source-scan test timeouts; the final reduced-worker run passed. Gated staging write tests were not pointed at production. Existing lint warnings and Vite chunk warnings are retained as warnings.

Real Chromium interactions cover the six requested viewport sizes, mobile menu, header search/Escape, category navigation, sign-in form opening, photo controls and pointer drag, variant/quantity selection, cart update/removal, live address/rate/payment-form rendering, footer accordions and newsletter storage. Physical touch injection was unavailable; no native Safari/Android coverage is claimed. The final UI console read returned no errors; the transient first Stripe HTTP health failure remains documented above.

Screenshots in `C:\Users\basco\Downloads\hk\himalayan-koh\qa-visual-artifacts`: `pdp-before.png`, `mobile-live-360.png`, `mobile-live-375.png`, `mobile-live-390.png`, `mobile-live-430.png`, `mobile-live-768.png`, `mobile-live-1440.png`, `home-after.png`, `footer-after.png`, `consent-after.png`, gallery screenshots and the final loaded `lick-6.png`. Some initial high-level screenshot captures scaled a desktop capture into a mobile-sized file; those captures are not used as responsive visual proof. Final proof uses the debugger's actual viewport capture. Earlier full Phase 2 before screenshots remain in the parent workspace (`mobile-shop-before.png`, `mobile-footer-before.png`).

Private QA JSON/logs remain ignored under `qa-visual-artifacts`; no secrets, subscriber lists, customer fields or test artifacts were committed. The existing unrelated untracked `himalayan-koh-leados.zip` was preserved.

Source files changed in the release:

- `src/app/(main)/products/[slug]/page.tsx`
- `src/app/layout.tsx`
- `src/components/ProductDetailView.tsx` and `.test.tsx`
- `src/components/ProductImageGallery.tsx`
- `src/features/catalog/relatedProducts.ts` and `.test.ts`
- `src/lib/images/galleryImages.ts` and `.test.ts`
- `src/lib/performance/labMetrics.ts` and `.test.ts`
- `src/lib/products/flickerElimination.test.ts`
- `src/lib/router/prefetchPolicy.ts` and `.test.ts`
- `src/views/ProductDetailPage.tsx`

```text
PROJECT: Himalayan Koh
REPOSITORY: https://github.com/himalayankoh/himalayankoh.git
LOCAL PATH: C:\Users\basco\Downloads\hk\himalayan-koh
BRANCH: integration/cloudflare-workers-migration
CHANGES: Verified frontend gallery, initial variant, specs, related catalog and prefetch improvements; earlier commerce/mobile fixes preserved.
TESTS: 2,101 passed / 0 failed / 19 skipped; 196 passed suites.
BUILD: Next and Cloudflare builds passed; origin/configuration/credential scans passed.
COMMIT: 42d6227fae8abdbcfcf9b5d4213af48a9b387b5a (runtime source)
PUSH STATUS: Pushed to active origin development branch; main was not force-pushed.
DEPLOYMENT: Live domain SHA verified; Worker 14229f2f-1641-4d2d-965f-24f91c8752db at 100%; rollback ready.
BLOCKERS: Confirmed 3 lb photo; native-device coverage; remaining cold/home/detail performance.
NEXT ACTION: Provide package evidence and finish native/performance acceptance. Preserve commerce freshness, prices, stock and payments.
```
