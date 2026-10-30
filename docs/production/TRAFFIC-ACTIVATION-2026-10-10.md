# Traffic activation and Hermes research — October 10, 2026

## Observed starting state

- Production Marketing & Traffic showed no first-party events and GA4 was not configured.
- Authenticated WordPress reads returned HTTP 200, zero event rows, no GA4 Measurement ID and no encrypted Google refresh token.
- The existing event API and WordPress event store were available, but no storefront page-view recorder was mounted after the Next.js migration. Product/cart actions were also missing traffic calls.
- Marketing edits in the working tree had started replacing browser-only preview saves with authenticated WordPress settings saves. This change completes and verifies that existing work.

## Repair

- Mount one storefront recorder for initial loads and client-side navigation. Avoid hydration/StrictMode duplicate arrivals.
- Record public page views, product views and successful server cart additions using the existing same-origin event endpoint. Exclude private routes, local/preview visits and private query/referrer values.
- Preserve WordPress as the event store. Private reads require an admin session, avoid caching, bound the date window and disclose the 5,000-row cap.
- Add a traffic refresh action, correct UTC timestamp handling and replace obsolete Supabase/migration messages with the actual data source.
- Show actual Search Console results or the precise connection/processing state on the traffic dashboard. No search metrics are invented.
- Complete global marketing settings persistence, including placement controls and exclusions, through the existing settings API. Advertising remains disabled.
- Live save verification revealed that WordPress lowercases setting names with `sanitize_key`. The shared server adapter now maps stored names back to registered application names on reads, preserving collection/OAuth keys and preferring current lowercase values over legacy duplicates.
- Prepare GA4 loading with visitor consent and manual page views. Google Enhanced Measurement history-based page views must be disabled on the eventual web stream to prevent duplicate route events, per Google's page-view documentation.
- This does not backfill historical traffic or infer purchases from page visits. Browser-recorded traffic includes real verification visits and is not a complete sales ledger or Google search-impression count.

## Google activation limits

Google Analytics shows the Welcome/Start measuring screen in the current session. Automatic review rejected starting a new property because exact property-creation approval was absent. An explicit approval request is pending; no property or account was created. Google Terms and owner-private account selection/consent must be completed by the owner.

Search Console secrets and callback are already deployed. The encrypted refresh token remains absent; the owner still needs to complete read-only consent. Google's performance/indexing processing state cannot be changed by the storefront.

## Hermes report retained as draft evidence

Source: owner-supplied SoSAi/Hermes report, observed at `2026-10-10T09:01:17Z` and `2026-10-10T09:01:18Z`. These findings have not been ingested into Salman OS, independently recrawled in this task, or published as new content.

| Priority | Draft finding | Dedupe key | Next step |
|---|---|---|---|
| P1 | Old WordPress SEO roadmap does not match current public Next/Vinext routes | `himalayan-koh:source-of-truth:current-public-route-set` | Reconcile roadmap with active repo and public `/products/...` routes; WordPress remains retail backend |
| P1 | Current sitemap is `/sitemap.xml`; legacy sitemap paths reportedly return 404 | `himalayan-koh:seo:sitemap-endpoint-alignment` | Keep GSC pointed at the current sitemap and review legacy submissions |
| P3 | Homepage metadata/schema and server-rendered catalog baseline present | `himalayan-koh:seo:homepage-metadata-and-rendering-baseline` | Preserve baseline; audit individual products separately |
| P1 | Wholesale/export path not surfaced in observed navigation/sitemap | `himalayan-koh:content-gap:wholesale-export-path` | Verify existing module/routes before preparing a buyer brief |
| P2 | Buying-guide destinations not surfaced in observed sitemap | `himalayan-koh:content-gap:commercial-buying-guides` | Draft owner-reviewed factual content briefs after route audit |
| P2 | Internal links to bulk/export/guide destinations not observed | `himalayan-koh:internal-links:commercial-pathways` | Link approved, verified destinations only |

Hermes did not obtain authenticated GSC/GA4 metrics, reliable competitor/channel evidence or a successful Salman OS ingest. A preview health response or an OPTIONS failure does not prove successful ingest, production health or durable evidence storage. No ingest/campaign/advertising/price/stock action is claimed here.

Google reference: https://developers.google.com/analytics/devguides/collection/ga4/views

## Final verification and release

- Runtime commits: `648fc4c76577a703e93011cdb92ab208bd07cdf7` and `c1940ec439eb26306eb4670379aab55f9bd984e2`, pushed to active origin `himalayankoh/himalayankoh`, branch `integration/cloudflare-workers-migration`.
- Typecheck passed. Lint passed with warnings. Full test run: 181 passed / 5 skipped suites; 2,018 passed / 19 skipped tests. Next.js build and Cloudflare build both passed.
- Final build secret scans passed: Next output scanned against 27 server variables; Cloudflare output scanned against the same server variables. No saved server credentials were found in browser assets.
- Final deployed Worker version: `65e95cfc-8a07-4930-97a4-607ba2f2dd17`. Production `/api/version` reports runtime SHA `c1940ec439eb26306eb4670379aab55f9bd984e2`.
- Production smoke at `2026-10-10T10:06:14.414Z`: home, products and checkout returned HTTP 200; unauthenticated event and Search Console reads returned HTTP 401. Stripe reports live mode and webhook configured. This was a read-only configuration check, not a payment or order transaction.
- Before/after comparison confirmed unchanged Worker binding names/types, apex/www routes and production order gates. Advertising, Auto Ads and manual ads remain disabled.
- Normal live browser navigation to home and one product persisted 3 events: 2 page views and 1 product view, from 1 visitor / 1 session. Refreshing the private dashboard after the final release shows those counts. No serious console errors were captured. Counts include these verification visits; historical visits were not reconstructed.
- Desktop, mobile (375 px) and tablet (768 px) layouts were checked; mobile/tablet had no horizontal overflow. Temporary viewport overrides were cleared.
- Global settings save/readback is verified against WordPress. GA4 remains disabled with no Measurement ID; the Google refresh token remains absent. GA4 property approval and owner Search Console consent are the remaining Google activation steps.
- Hermes research remains draft evidence, not ingested into Salman OS.

Local evidence: `../traffic-tests-final-2026-10-10.log`, `../traffic-next-build-final-2026-10-10.log`, `../traffic-cloudflare-build-final-2026-10-10.log`, `../traffic-cloudflare-deploy-final-2026-10-10.log`, `../traffic-production-after-2026-10-10.json` and `../traffic-live-desktop-2026-10-10.png` (relative to the repository root).
