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
- Production still reports commit `8bb609dcc3008732f5a0bc4f44ca2faf6ad9257b` at the
  initial check. Ordering is enabled and Stripe/session secret bindings are present.
- Production Google client bindings and encrypted refresh token are absent.
- Automatic approval review rejected installing the two production Google secrets
  because approval named the callback but did not explicitly approve the secret
  installation. No upload executed; do not work around the rejection.
- Production release, exact secret-installation approval, owner-private Google
  account selection/consent and a genuine Search Analytics request remain pending.
- Existing unfinished AdminSection/marketing changes and plugin ZIP are preserved
  and excluded from this change. No plugin installation, campaign, payment or
  customer/catalog mutation is performed.

Google API reference: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
