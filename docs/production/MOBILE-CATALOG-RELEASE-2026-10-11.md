# Catalog and mobile storefront release — 2026-10-11

## Scope and authorization

Active repository: `https://github.com/himalayankoh/himalayankoh.git`.
Local checkout: `C:\Users\basco\Downloads\hk\himalayan-koh`.
Branch: `integration/cloudflare-workers-migration`.

The owner authorized using preview's six active products, retiring unmatched live listings, stocking each valid sellable record with 10 pieces, publishing genuine 6 lb variation 1548 with its confirmed 3 kg packed shipping weight, and deploying verified storefront changes. Retirements use draft status, preserving product IDs and historical order lines. No customer/order deletion, payment configuration, webhook, DNS or credential changes are included.

## Root causes

- Parent 281 advertised only 2/4 lb options, while genuine 6 lb child 1548 existed privately with a 3 kg packed weight. Child 1547 is a real 4 lb record, not a mislabeled 6 lb item. It was drafted under the preview-only decision; 1548 was published.
- WooCommerce's internal 6 lb term slug is `6lbs-round-block`. Sending its REST display label alongside a child ID caused cart validation to reject it. Cards and detail views now send the verified variation ID alone, allowing WooCommerce to resolve the attributes.
- Retired children and stale parent summaries could set the displayed price floor. Only published children now determine the range and selectable options.
- Live and preview were separate WooCommerce databases with different IDs, catalog selections, units and media records. Live weights are kg; preview weights are lb. Existing live IDs/slugs were preserved wherever a genuine matching SKU/variation existed.
- Twenty-one preview media URLs still used the apex `/staging/` origin, which returned 404. Their original files were accessible at `wp.himalayankoh.com/staging/`. Media normalization preserves the staging path and corrects the host. Imports use original URLs rather than foreign media IDs.
- App photo overlays could override genuine WooCommerce originals. Galleries counted failed slides and retained placeholders. Original WooCommerce media now leads; inaccessible slides are removed and indices/counters are clamped.
- Narrow two-column cards crowded titles and controls. Below 400 px, cards place a 112 px image beside the content; wider phones use two columns. Controls retain 44 px touch targets.
- The long footer and independent floating-button positions crowded mobile content. Footer sections now collapse on mobile; the 126 px analytics banner reserves space, suppresses floating buttons and preserves consent choices.

## Verified WooCommerce mappings

| Preview source | Live parent | Sellable ID | SKU | Price | Packed/source shipping weight (kg) | Stock |
|---|---:|---:|---|---:|---:|---:|
| 2721 | 281 | 1549 | HK-LFH-2lbs | $19.95 | 0.907185 | 10 |
| Owner-confirmed existing child | 281 | 1548 | HK-LFH-6lbs | $17.95 | 3 | 10 |
| 2752 | 2520 | 2520 | HK-LB-30LBS | $49.95 | 13.607771 | 10 |
| 2704 | 2461 | 2466 | HK-ESF-3lbs (parent SKU) | $19.95 | 1.360777 | 10 |
| 2653 | 2446 | 2450 | HK-ESF-16oz (parent SKU) | $9.95 | Unspecified in source | 10 |
| 2710 | 2321 | 2322, 2323 | HK-ESF-6lbs (parent SKU) | $19.95 each | 2.721554 each | 10 each |
| 2716 | 271 | 271 | HK-LFC-45lbs | $49.95 | 20.411657 | 10 |

Retired without deletion: 291 (18 lb bag), 1547 (4 lb lick), 2467 (duplicate legacy 6 lb grain choice), 2451 (unpriced coarse jar choice). New product 2520 is the genuine preview 30 lb SKU, created only after checking no live duplicate existed. Variable parents retain stock management at child level.

Source/destination media IDs, original URLs, attributes and inventory readbacks are in [catalog evidence](CATALOG-MEDIA-EVIDENCE-2026-10-10.json).

## Preview/production differences that remain intentional

- Production preserves historical IDs, variable parents and established URLs; preview has six simple products. Production presents seven cards because genuine 2/6 lb children share parent 281.
- The owner-confirmed 6 lb child has no separate preview product. Its $17.95 price is preserved; its confirmed 3 kg packed weight is not replaced with a guessed 6 lb conversion.
- Production retains fine/coarse 6 lb pouch choices under existing genuine child IDs.
- The 18 lb product is retired by explicit owner choice. Its nine original photos were checked and accessible before retirement; no replacement was fabricated.
- Preview's 3 lb SKU/weight are clear, but its photo filenames refer to 6 lb pouches and its title/copy differ about use. Original preview photos were retained as requested. A dedicated, owner-confirmed 3 lb package photo is still needed to resolve that ambiguity.
- Preview's 16 oz jar has no shipping-weight value. No packed weight was guessed.

## Implementation

Changes cover the existing Woo mapper/variation normalizer, variant-specific listing helper, card/detail/gallery components, header/category navigation, footer, consent and floating controls, original-media normalization and responsive sizing. Three guarded catalog scripts default to dry run. Optional `?hk-performance=1` diagnostics report real LCP/CLS/TTFB to the browser console only, with no storage or external telemetry.

Cart API, checkout, Stripe webhook and order-writing implementation are unchanged. Buying still validates current price and stock directly in WooCommerce; public browsing retains the existing 60-second cache window. Private/customer/admin responses are not newly cached.

## Pre-release verification

- Typecheck: PASS. Lint: PASS with existing image-element warnings.
- Vitest: 193 suites passed, 5 skipped; 2,083 tests passed, 19 skipped.
- Responsive browser QA: 360×800, 390×844, 375×812, 430×932, 768×1024 and 1440×900; no document horizontal overflow; first two cards are genuine 2/6 lb links.
- Native Woo cart probe: child 1548 accepted at $17.95, SKU HK-LFH-6lbs, quantity limit 10. Browser quantity change to two totaled $35.90; checkout displayed the same 6 lb line. QA cart cleared; no paid order submitted.
- Consent: 126 px height at 390 px, both buttons/privacy link have 44 px targets; floating buttons hidden; Decline persisted after reload.
- Footer support expand/collapse exposed the retained email/phone. Invalid newsletter email was rejected without submitting a subscription. Menu, guest sign-in, search and chat opened/closed.
- Original media were checked through Woo source HTTP reads and browser galleries. Final fresh-release gallery verification follows deployment; initial development navigation could display cached old pouch data and images still loading.
- Physical Android/iOS devices were not available. Chromium viewport interaction was exercised. In-app browser rejected raw touch-event injection, so a physical swipe test must not be claimed.
- PageSpeed API measurement was unavailable (HTTP 429 quota). Final release uses browser PerformanceObserver measurements; no score is invented.

## Release and rollback

Previous production Worker version: `d8ef3178-5850-4c00-9924-22fdb7b0ed30` (100% deployment confirmed by Cloudflare before release). Established guarded production workflow is used, preserving existing server-only bindings and custom domains. Runtime order flags were verified `false` before release.

Rollback command, only if needed: `npx wrangler rollback d8ef3178-5850-4c00-9924-22fdb7b0ed30 --name himalayan-koh-ecommerce-prod --config dist/server/wrangler.json`. Catalog before-images are private ignored `.git` backups; any inventory rollback requires checking intervening orders and must not overwrite stock blindly.

## Production release and acceptance

Deployed code commit: `d47610c6ac5fd8267c9678b87f6eb7123d6e0bf1`.
Cloudflare version: `50e3a436-63a3-48d1-864d-12a305f7122f`, 100% traffic.
The actual apex `/api/version` returned the deployed commit. Cloudflare readback confirmed all existing binding names/types were preserved and both order-paused flags remain `false`. The script's historical wording about the domain still being WordPress is outdated; the actual domain/version readback is authoritative. No DNS or domain-binding change was made.

| Acceptance check | Result | Evidence/limits |
|---|---|---|
| PRODUCT VARIATIONS | PASS | Genuine live children; draft/private options excluded; retired price floors excluded |
| 2 LB SALT LICK | PASS | First card and homepage position, ID 1549, $19.95, stock 10 |
| 6 LB SALT LICK | PASS | Second card and homepage position, ID 1548, $17.95, confirmed 3 kg, stock 10 |
| 30 LB PRODUCT IMAGE | PASS | Original two-photo gallery, genuine product 2520 |
| 18 LB PRODUCT IMAGE | PASS | Nine originals accessible; product 291 intentionally drafted by owner |
| PRODUCT GALLERIES | PASS | All 27 selectable slides across seven live card URLs loaded original product photos; no placeholder/overflow failures |
| MOBILE PRODUCT CARDS | PASS | Seven image-bearing cards, appropriate one/two-column layout, six viewport sizes |
| PRODUCT DETAIL UX | PASS for verified controls | Variant selection, price, stock, images, quantity, description and policy links; touch gesture coverage remains unverified |
| COMPACT FOOTER | PASS | 390 px closed footer reduced from 1069.75 px to 493 px; support accordion retains contact details |
| COOKIE CONSENT | PASS | 126 px banner; floating controls suppressed; decline/reload persistence; explicit accept loads Analytics; withdrawal removes script |
| MOBILE NAVIGATION | PASS | Menu opens/closes with Escape at each mobile/tablet size, restored focus; category links and catalog search work |
| ADD TO CART | PASS | Live 1549/1548 lines priced $19.95/$17.95; subtotal $37.90; checkout shows the same sizes; all QA items removed |
| PERFORMANCE | FAIL against the universal 2.5 s LCP target | Warm shop reaches target; homepage/detail and cold origin misses remain above it. Actual measurements below |
| MOBILE BROWSER QA | FAIL for complete coverage | Six real Chromium viewport interaction checks pass, including Android UA emulation; native Android/iOS and injected touch swipe coverage are not verified |
| TYPECHECK | PASS | `npm run typecheck` and build checks |
| LINT | PASS | Existing image-element warnings, no lint errors |
| TESTS | PASS | 193 passed suites / 2,083 passed tests; 5 suites / 19 tests skipped |
| BUILD | PASS | Next production build and guarded Cloudflare build; origin/secret scans passed |
| DEPLOYED SHA | VERIFIED | `d47610c6ac5fd8267c9678b87f6eb7123d6e0bf1` |
| PRODUCTION VERIFICATION | PASS for tested commerce/UI | Domain/version, 14 public routes, all galleries, responsive controls, cart and checkout navigation |
| STRIPE AND ORDERS | PRESERVED / VERIFIED WITHOUT PAYMENT | Live Stripe configuration and webhook presence unchanged; no payment submitted or existing order altered |
| ROLLBACK READY | YES | Previous Worker version retained; no rollback needed for the verified release |

No claim of complete mobile/performance acceptance is made while the listed coverage and performance limits remain.

### Measured browser performance

Chromium at 390×844, DPR 1, Android Chrome user-agent emulation. Throttled measurements used 150 ms configured network latency, 204,800 B/s download, 96,000 B/s upload, 4× CPU slowdown and disabled browser cache. Edge-cache state is distinguished from browser cache. These are single lab observations, not field percentiles or Lighthouse scores.

| Page / condition | LCP | CLS | TTFB |
|---|---:|---:|---:|
| Shop, first load, unthrottled | 6.492 s | 0 | 5.906 s |
| Shop, repeat, unthrottled | 0.240 s | 0 | 0.041 s |
| Shop, edge warm, throttled | 2.264 s | 0.0040 | 0.054 s |
| Homepage, edge cold, throttled | 8.804 s | 0.0200 | 5.822 s |
| Homepage, edge warm, throttled | 3.184 s | 0.0200 | 0.032 s |
| 6 lb detail, first measured load, throttled | 5.228 s | 0.0017 | 2.048 s |
| 6 lb detail, edge warm, throttled | 3.628 s | 0.0017 | 0.084 s |

Cold responses are dominated by WooCommerce/origin latency. The existing 60-second commerce freshness boundary was preserved rather than extending price/inventory staleness to improve a score. During the wider navigation run, one browser cart read hit the existing 12-second WooCommerce timeout; reload recovered, and three subsequent anonymous cart API reads returned 200 in 1136/750/823 ms. This isolated error is recorded rather than described as an error-free run. The final browser QA cart was empty, and no new errors occurred on the recovery reload.

Unauthenticated admin catalog/order APIs returned 401, with `no-store, must-revalidate`. Version, Stripe configuration and cart APIs also retain `no-store, must-revalidate`. All existing Worker bindings were preserved. No paid transactions were attempted.

### Screenshots and QA artifacts

Screenshots are saved outside the repository under `C:\Users\basco\Downloads\hk`: `mobile-shop-before.png`, `mobile-footer-before.png`, `mobile-live-360.png`, `mobile-live-390.png`, `mobile-live-375.png`, `mobile-live-430.png`, `mobile-live-768.png`, `mobile-live-1440.png`, `mobile-live-footer.png`, `mobile-production-cart.png` and `mobile-consent-after.png`. Private/raw QA logs remain ignored under `.git` and contain no committed credentials.

Remaining: owner-confirmed 3 lb package photo; missing source packed weight for the 16 oz jar; native device/swipe verification; further homepage/detail and cold-origin performance work. These cannot be represented as passed by a successful build.

## Workflow report

PROJECT: Himalayan Koh storefront

REPOSITORY: https://github.com/himalayankoh/himalayankoh.git

LOCAL PATH: C:\Users\basco\Downloads\hk\himalayan-koh

BRANCH: integration/cloudflare-workers-migration

CHANGES: Preview/live catalog alignment, guarded stocking/retirement, original media mapping, native variation cart IDs, mobile cards/detail/footer/consent/navigation and optional measured diagnostics.

TESTS: Typecheck/lint and 2,083 tests passed; browser gallery/cart/viewport/category/consent checks as above.

BUILD: Next and Cloudflare production builds passed, including origin and credential-value scans.

COMMIT: Runtime d47610c6ac5fd8267c9678b87f6eb7123d6e0bf1; subsequent documentation-only commit records these post-deployment results.

PUSH STATUS: Runtime branch pushed to active origin; acceptance documentation is pushed on the same branch.

DEPLOYMENT: Apex reports verified runtime SHA; Cloudflare version 50e3a436-63a3-48d1-864d-12a305f7122f at 100%.

BLOCKERS: Missing/ambiguous source asset and packed-weight evidence; unavailable native swipe/device coverage; LCP/origin limits described above.

NEXT ACTION: Confirm missing product evidence and complete native-device and remaining performance acceptance checks. Keep the established 60-second freshness boundary and payment/order protection.

## Files changed in the runtime release

- `docs/production/CATALOG-MEDIA-EVIDENCE-2026-10-10.json`
- `docs/production/MOBILE-CATALOG-RELEASE-2026-10-11.md`
- `scripts/apply-owner-catalog-selection.mjs`
- `scripts/set-active-catalog-stock.mjs`
- `scripts/sync-preview-catalog.mjs`
- `src/app/globals.css`
- `src/components/AIChatWidget.tsx`
- `src/components/Footer.tsx`
- `src/components/Layout.tsx`
- `src/components/ProductCard.tsx`
- `src/components/ProductDetailView.tsx`
- `src/components/ProductImageGallery.tsx`
- `src/components/ScrollToTop.tsx`
- `src/components/StorefrontTraffic.tsx`
- `src/components/category/CategoryFilterNav.tsx`
- `src/data/products.ts`
- `src/features/catalog/homeFeatured.ts`
- `src/features/catalog/listingCards.test.ts`
- `src/features/catalog/listingCards.ts`
- `src/lib/backend/catalogVariations.test.ts`
- `src/lib/backend/woocommerce.ts`
- `src/lib/catalog/catalogPolicyRegression.test.ts`
- `src/lib/catalog/niche.test.ts`
- `src/lib/catalog/niche.ts`
- `src/lib/consent.ts`
- `src/lib/images/galleryImages.ts`
- `src/lib/images/responsiveImage.ts`
- `src/lib/images/wordpressMediaUrl.test.ts`
- `src/lib/images/wordpressMediaUrl.ts`
- `src/lib/performance/labMetrics.test.ts`
- `src/lib/performance/labMetrics.ts`
- `src/lib/seo/adsenseSafety.test.ts`
- `src/lib/woo/productPayload.ts`
- `src/lib/woo/variationOptions.test.ts`
- `src/lib/woo/variationOptions.ts`
- `src/views/HomePage.tsx`
- `src/views/ProductsPage.tsx`
