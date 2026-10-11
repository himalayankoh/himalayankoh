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

Production build, deployment SHA/version and post-release acceptance results will be recorded after their checks finish.
