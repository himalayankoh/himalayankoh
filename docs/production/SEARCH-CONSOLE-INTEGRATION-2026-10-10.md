# Search Console integration — October 10, 2026

The existing Google Cloud Search Console API is enabled. The owner approved saving
`https://himalayankoh.com/api/admin/google-auth/callback`; Google confirmed the client
was saved and a fresh read shows that callback alongside both existing n8n callbacks.

Google's live Search Console overview still says "Processing data, please check again
in a day or so" for performance and indexing. This is a provider processing state,
not evidence that ownership verification failed. No search metrics are invented.

## Implementation

- Reuses the secure existing admin OAuth flow, with an optional Search Console-only
  read scope. The combined Search Console/AdSense flow remains available.
- Adds authenticated, uncached `GET /api/admin/search-console?days=7|28|90`.
- Exchanges the existing encrypted refresh token server-side, verifies permission
  for `sc-domain:himalayankoh.com`, and queries Google's finalized query/page rows.
- Clearly distinguishes missing consent, settings outages, denied property access,
  provider errors, genuine rows and successful empty results. Top available rows
  are identified as such, not presented as complete site totals.
- Adds connection and real API test buttons to the existing Service Keys screen.
- Keeps provider error payloads and credential material out of client responses.

## Validation and remaining activation

- Full suite: 179 suites passed / 5 skipped; 1,995 tests passed / 19 skipped.
- Typecheck and lint pass; existing lint warnings remain.
- Next.js production build and public-origin/credential scans pass.
- Owner explicitly approved installing the two server-only Google client secrets
  on `himalayan-koh-ecommerce-prod` and deploying tested commit `60b62c2`.
  The earlier automatic-review rejection was resolved by that exact authorization.
- Both secrets are installed. The clean Cloudflare build and credential/origin
  scans passed, using committed source with unfinished edits excluded.
- Production reports commit `60b62c2f1ea1c0581e5edac94355bd6577968761`, Cloudflare
  version `a1693993-4213-45d0-ae83-c93c52720a19`.
- Homepage, products and checkout return HTTP 200. Admin API routes reject
  unauthenticated requests; an invalid OAuth callback returns HTTP 403.
- Ordering is enabled, Stripe reports live mode with its webhook configured, and
  the apex/www Worker routes and existing Stripe/session bindings are preserved.
- The production connection test correctly reports missing Google authorization.
  Search Console-only OAuth reaches Google's account chooser with the approved
  production callback, PKCE and `webmasters.readonly` scope.
- Owner-private account selection/consent and a genuine Search Analytics request
  remain pending. No encrypted refresh token is stored yet. The browser is handed
  to the owner at account selection, as required by the owner's mission prompt.
- Performance and indexing reports still require Google to finish processing.
- Existing unfinished AdminSection/marketing changes and plugin ZIP are preserved
  and excluded from this change. No plugin installation, campaign, payment or
  customer/catalog mutation is performed.

Google API reference: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
