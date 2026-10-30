# LeadOS 2.0 implementation boundary

Extend the existing HK admin, WordPress LeadOS library and project tables. Do not
change storefront routes, commerce, WooCommerce records, payment/shipping secrets
or customer accounts. Preserve Freebuff's 384d961 Overpass headers and mirrors.

## Discovery and evidence

Use bounded Overpass queries for supported local categories. Public Nominatim is
geocoding only, never a keyword POI directory. An operator-configured, authenticated
SearXNG JSON endpoint supplies broader distributor and nationwide searches. Missing
providers return explicit diagnostics, not invented leads or public-instance fallbacks.
Persist search definitions/history and source URLs/retrieval dates. Search snippets
are inferred candidates; company-page observations are verified from source. Email
verification means visibly published, not deliverability or consent.

Company research runs through WordPress safe HTTP transport, with DNS destination
validation, no automatic redirects, response limits, robots rules and a four-page
budget. A separate authenticated rendering service may be configured later; browser
runtime never belongs in a Cloudflare request. Respect site terms and stop on access
restrictions. Private consumers and unsupported personal mailboxes are excluded.

Qualification uses a visible deterministic rubric and actual current product IDs.
Private label is an opportunity requiring capability confirmation, never a promise.
Domain, normalized name and location form a conservative branch-aware identity.
Database locking prevents concurrent duplicate writes; discoveries preserve manual
notes, pipeline state, tags and contact edits, while retaining source references.

## Workflow

Add lead research/sales metadata, saved searches, persisted editable drafts and
approval state to the existing module. Approval covers the exact recipient and copy;
editing revokes it. Reserved dispatch IDs prevent blind duplicate retries. Send via
the existing n8n installation only, using an authenticated webhook. Provider acceptance
is queued/sent, not proof of delivery. Delivery, bounce, reply, opt-out and follow-up
events are authenticated and idempotent. Suppression is checked before every dispatch.
Unknown transport outcomes require review, never automatic resend.

Outbound defaults OFF and requires a verified sender, postal address, working opt-out,
daily limit and explicit reviewed draft. No unsolicited prospect sends during QA.
Keep prospects separate from WooCommerce customers and subscription opt-in lists.

## Release

Check isolated LeadOS diffs, security tests, typecheck/lint/unit/integration/build,
real source searches and admin browser flows. Install additive plugin migration and
test staging before safe production release. Missing external runtime/authentication
must be reported separately from implemented adapters. Never label compile success
as live workflow verification.
