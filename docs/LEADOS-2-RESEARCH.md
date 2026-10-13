# LeadOS engine research — 2026-10-12

GitHub API metadata was read on 2026-10-12; all four repositories were unarchived.
Licenses permit commercial use subject to their terms; licenses do not authorize
data access or override source-site policies. No code was copied from these apps.

| Engine | License / last repository push | Decision and runtime |
|---|---|---|
| [SearXNG](https://github.com/searxng/searxng) | AGPL-3.0 / Oct 11 15:55 UTC | Selected as a separate self-hosted search service. JSON must be enabled; upstream engine limits and availability still apply. Keep AGPL notices/source obligations for service modifications. HTTPS authentication is required for Worker access; no unlimited public-instance fallback. |
| [Crawlee](https://github.com/apify/crawlee) | Apache-2.0 / Oct 12 11:41 UTC | Suitable optional JS rendering on a separate Node/Chromium host. Playwright browsers require memory and patch maintenance. Neither Apify paid hosting nor proxy rotation is required for a bounded public-page service. Never embed browsers in the storefront Worker. |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Apache-2.0 / Oct 12 16:52 UTC | Alternative Python/Chromium service; not installed alongside Crawlee. Adds another runtime and offers no discovery database by itself. Review NOTICE/attribution when adopting a release. |
| [OpenOutreach](https://github.com/eracle/OpenOutreach) | GPL-3.0 / Oct 12 12:14 UTC | Not the core: current README uses licensed BetterContact data, paid email lookup credits, LLM credentials and mailbox access. Its automatic sending and independent Django database would duplicate HK’s approved review workflow. |

[SearXNG API documentation](https://docs.searxng.org/dev/search_api.html) confirms
`/search?format=json`, and that disabled formats return 403. Protect the service;
enabling JSON does not guarantee upstream search availability.

Existing HK Overpass adapters remain the local map-data foundation. Public
[Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
does not allow systematic POI collection: the public keyword finder is gated off.
Use geocoding sparingly with shared pacing and caching, and preserve OSM attribution.

[FTC CAN-SPAM guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
applies to commercial B2B email too. Truthful identity/subjects, postal address,
clear working opt-out and suppression are prerequisites; the sender remains
responsible when an external automation sends mail. Do not confuse a published
business mailbox with opt-in consent.

## Prior code actually found

Requested private `8002salman-ai/leados` was not accessible through the connector.
The existing local clone at `C:/Users/basco/Downloads/Leados/leados` points to
`salmanbashir80/leados`, clean `main` at `c0d91db`. Source and history contain OSM
providers; Google matches in source history do not establish a Google lead finder.
No Leadora clone was found in the inspected Downloads directories/registered
projects. Access failure is not evidence that an inaccessible repository is absent.
Current HK scoring/library/persistence were reused; old billing/auth/Supabase were not.

## Costs and credentials

No new paid API subscription is necessary for local map discovery or public HTTP
research. Existing WordPress/Worker hosting still has its normal plan/resource costs.
Self-hosted SearXNG and a browser need host RAM, CPU, bandwidth, uptime and maintenance;
there is no verified incremental dollar quote for this owner’s hosting plan.
The existing Windows n8n service answered `/healthz` 200. Salman OS’s saved n8n API
credential can read workflow metadata; no existing Himalayan Koh outreach workflow
or SMTP sender credential was found. Other projects’ workflows/credentials remain
untouched. Optional premium providers stay disabled.
