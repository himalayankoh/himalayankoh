# AdSense readiness, SEO cleanup, content quality and production verification — 2026-10-11

Implementation mission. Everything below was verified against live production
(`https://himalayankoh.com`) after the deploy described in §10. Nothing was
fabricated: where a fact could not be established, the item is reported as
unverified or as an owner-review blocker instead of being asserted.

## 1. Codex handover

| Item | Value |
| --- | --- |
| Repository | `https://github.com/himalayankoh/himalayankoh.git` (remote `origin`) |
| Local path | `C:\Users\basco\Downloads\hk\himalayan-koh` |
| Branch | `integration/cloudflare-workers-migration` |
| Commit at handover | `b3edb9c` (documentation-only commit on top of the deployed build) |
| Production SHA at handover | `5bd49e221ce1beaa9fb43e955150818e3918936f`, built 2026-10-11T18:43Z |
| Delta between them | one file, `docs/production/PREVIEW-CATALOG-REPLACEMENT-2026-10-11.md` — no runtime source difference |
| Uncommitted work found | none. The only untracked file was the pre-existing `himalayan-koh-leados.zip`, preserved and not committed |

**Codex fixes preserved (verified, not re-done):** WooCommerce variation lookup
through the individual endpoint, listed weights in kg at the store's unit,
the six-product owner-approved catalogue replacement, original binary-identical
media, admin lb/in ↔ native-unit conversion, mobile galleries and navigation,
compact footer, cookie-consent behaviour, the six-shelf taxonomy, and the
guarded production build/deploy workflow itself.

No competing implementation was created and no existing runtime behaviour was
replaced. This work adds to the same branch.

## 2. Already resolved before this work (VERIFIED PASS, unchanged)

These were reported by the earlier audits and are already correct in the live build:

| Item | Evidence |
| --- | --- |
| `ads.txt` publisher record | live `google.com, pub-5473713135927706, DIRECT, f08c47fec0942fa0`; not recreated |
| Stripe live configuration and webhook | `/api/stripe/config` → 200, `mode: live`, `configured: true`, `webhookConfigured: true` |
| Anonymous admin API is closed | `/api/admin/orders` → 401 |
| Legacy WordPress template pages | theme-demo URLs, `/home-2`, `/shop`, `/about-us`, `/contacts`, `/terms-conditions`, `/return-policy` all 308 to a real, 200 page |
| Legacy product URLs | `/product/:slug` catch-all maps to real product slugs or a shelf, never to a 404 |
| Return window consistency | FAQ and the Returns policy both state **30 days** (FAQ: "within 30 days of your order date" / Returns: "within 30 days of delivery"). No contradiction found; no copy changed |
| Empty shelves are not offered as filters | the filter pills are derived from the products on the page, so `cooking-serving`, `bulk` and `lamps-decor` — which hold no product — never appear as pills, and the XML sitemap already excluded them |
| XML sitemap contents | `/sitemap.xml` lists the blog, the article, the three populated shelves and all six products; no staging host, no redirecting URL |

## 3. Newly fixed

| # | Defect (with evidence) | Fix |
| --- | --- | --- |
| F1 | **Culinary/workshop copy on an animal salt lick.** Live `/products/himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh` served "Larger pieces for kitchens, workshops and volume buyers" and a usage paragraph naming "*cooking slabs*: heat gradually in stages". | `src/lib/products/productContent.ts` `licks-blocks` and `live-stock` copy rewritten to describe the salt, its listed weight, the animal named on the product, and the fresh-water requirement. `ProductDetailSections.tsx` now renders a shelf-specific note via `nicheSectionKeyFor` instead of one paragraph naming both an animal lick and a cooking slab. Live re-check: all three strings now absent; the animal note present |
| F2 | **Unsupported disease testimonial live on `/about`.** "…horses that were prone to chronic colic. After about 2 months the horses had less digestive issues." | Testimonial removed rather than reworded (rewording would misquote the customer). Source comment records why. Live re-check: `colic` and `chronic` both absent. A revised non-medical quotation is an owner-review item (§11) |
| F3 | **Unmapped legacy URL 404'd.** `/whole-sale/` → 308 → `/whole-sale` → **404**. | Added `/whole-sale → /wholesale` (permanent). Live: `/whole-sale/` now ends at `/wholesale` 200 |
| F4 | **Livestock-intent legacy URLs pointed at shelves with no products.** `/why-do-dairy-cows-need-trace-minerals`, `/services/fresh-dairy-products`, `/services/salt-for-live-stock`, `/services/salt-lick-for-horses`, `/services/salt-lumps-for-cattle`, `/product/salt-licks-for-horses`, `/product/bag-of-salt-for-livestock-45-lbs` all targeted `bulk`, `edible-pink-salt` or `cooking-serving` — verified empty (0 products each) while the store really does sell horse licks and cattle rock. | Retargeted to the shelves that hold those products (`licks-blocks`, `live-stock`). Live: each ends at a 200 shelf that renders products (licks-blocks 3 product links, live-stock 4) |
| F5 | **`Salt that Heals` in the header logo `alt` on every page** — an unsupported healing claim in indexed, read-aloud text. | Alt text is the brand name. Live: absent |
| F6 | **`/about` metadata advertised lamps** the storefront does not sell. | Description now names only the ranges the catalogue carries. Live: `lamps` absent from the page including `<head>` |
| F7 | **Header and footer had no Guides link.** `/blog` was indexed and live but linked from nowhere in navigation. | `Guides` added to the desktop/mobile header menu and `Guides & Articles` to the footer. Live: present |
| F8 | **HTML sitemap omitted the blog and the article.** `/sitemap` had zero `/blog` links: the guides block shipped behind `false &&` for the retired `/resources` library. | Real guides section rendering the published posts, plus an Editorial Policy entry; route now fetches posts server-side. Live: `/sitemap` links `/blog` and `/blog/how-to-cook-with-himalayan-pink-salt` |
| F9 | **Outdated label `Live Stock`.** | Shelf label is `Livestock` (the WooCommerce category name is untouched and still matches). Live: the shop pill and the footer link both read `Livestock`; no visible `Live Stock` remains |
| F10 | **Fabricated editorial authority.** `src/data/authors.ts` published a "Technical & Agricultural Advisory Board", "Livestock Mineral Nutrition Specialists", "Codex Alimentarius & ASTM Standards", and `/images/authors/*.jpg` avatars that do not exist on the site. | Rewritten as organisation-level attributions of the company teams that actually write, source and support the products — no invented credentials, no advisory panel, no broken avatars. Retired slugs kept so indexed `/author/*` URLs do not 404 |
| F11 | **No editorial policy existed.** `/editorial-policy` → 404 while the footer, `NAV_PATHS` and the update-date map all referenced it. | New page at `/editorial-policy` covering who writes, how sources are chosen, AI use and human editing, the claims we refuse, corrections and update dates, and the commercial interest (we sell what we write about). Live: 200, all six sections present |
| F12 | **"Reviewed by" implied independent vetting.** | Byline label is `Cross-checked by`, and the reviewer is now obviously a second company team |
| F13 | **Disclaimer referenced the preview host and promised affiliate links that do not exist.** `https://preview.himalayankoh.com` appeared in the legal text, and an "Affiliate Links" section said links "may occasionally be affiliate links" while the site publishes none. | Preview host removed; affiliate section now states the truth and links the Editorial Policy. Live: both absent |
| F14 | **Shipping page told customers 45 lb bags "exceed standard parcel limits".** Shippo returns eight live parcel rates for that exact product. | Corrected: individual bags and blocks ship by parcel at live carrier rates; pallet and multi-bag wholesale orders are LTL freight. No shipping calculation touched. Live: new wording present, and `/api/shippo/rates` still returns 8 rates for the 45 lb bag |

Also corrected as a consequence: three unit tests that asserted the old
`Live Stock` label and the old redirect targets were updated to the verified
behaviour, and two regression tests were added (the `/whole-sale` 404, the
livestock redirect targets, and the HTML sitemap's blog link).

## 4. AdSense readiness (independent editorial estimate — not a Google approval probability)

| Dimension | Score | Basis |
| --- | --- | --- |
| Originality | 4/10 | One substantial original article; the rest of the site is commerce. No mass-produced filler was added |
| Usefulness | 7/10 | Product copy is now accurate to the SKU, the six shelves and their sizes are described truthfully, and the guides are reachable from the header |
| Trustworthiness | 7/10 | Unsupported disease claim gone, invented advisory board gone, real editorial policy published, affiliate claim corrected. Still limited by the unverifiable sourcing/testing claims on `/about` (§11) |
| User Experience | 8/10 | Codex's mobile work was preserved; this work added navigation, a sitemap entry and one new page without changing layout |
| Content Quality | 6/10 | Product content is now honest and useful; educational depth remains thin (one article) |
| AdSense Readiness | 5/10 | No mandatory policy violation now found in the reviewed surfaces, but approval depends on Google's own review, and the consent/CMP question in §8 is unresolved |

## 5. Product content

Live catalogue as read from `/api/catalog` (unchanged by this work: ids, SKUs,
prices, stock, weights):

| ID | SKU | Title | Price | Woo category | Shelf |
| --- | --- | --- | --- | --- | --- |
| 2544 | HK-LB-30LBS | Himalayan Koh 30 lb Red Rock Salt Lick for Cattle | 49.95 | Salt Blocks | licks-blocks |
| 2543 | HK-LFH-2lbs | Himalayan Pink Salt Licks for Horses 2 lb | 19.95 | Salt Licks | licks-blocks |
| 2539 | HK-LFC-45lbs | Himalayan Rock Salt for Livestock (45 lb) | 49.95 | Live Stock | live-stock |
| 2536 | HK-ESF-6lbs | Himalayan Pink Salt for Livestock – 6 lb Fine or Coarse Grain Pouches | 19.95 | Live Stock | live-stock |
| 2531 | HK-ESF-3lbs | Himalayan Koh Pure Natural… Edible Pink Cooking Salt, Fine Grain (0.5–1mm) | 19.95 | Live Stock | live-stock |
| 2526 | HK-ESF-16oz | Himalayan Edible Pink Salt – 16 oz Jar \| Fine Grain | 9.95 | Edible Pink Salt | edible-pink-salt |

- **Animal-use descriptions:** no culinary, workshop or cooking-slab instruction remains; the animal range describes the piece, its weight, the animal from the product name, and the water requirement. It makes no health or nutrition outcome claim.
- **Culinary descriptions:** unchanged apart from the removal of the shared cooking-slab sentence from non-culinary pages; no culinary page lost its own guidance.
- **Product specifications:** no weight, dimension, SKU, price or stock value was changed. Shipping weights remain as Codex verified.
- **Unsupported claims:** the one unsupported animal-health claim found on a public page (the colic testimonial) is removed; `Salt that Heals` is removed from the header alt text. The claim scanner in `src/lib/products/claims.ts` still treats `Himalayan Koh — Salt that Heals` as acceptable (asserted by `claims.test.ts:99`) — left as-is deliberately, since that module's job is scanning admin-generated copy, but the tagline should not be reintroduced as branding.
- **Testimonials:** two remain, both about product quality, consumption and service. They were not edited.
- **Packaging images:** no image was added, replaced or regenerated. The 3 lb SKU's retained photos still show 6 lb packaging — an owner-supplied photo is required (§11).
- **Not changed, flagged:** product **2531**'s title reads "…for Livestock… Edible Pink **Cooking** Salt" and it is filed under the live-stock shelf. The SKU (`HK-ESF-3lbs`) and the title describe different uses; the title came from the owner's confirmed preview list, so it is an owner decision (§11). The shared site logic now treats it as livestock, so no culinary instruction is shown for it.

## 6. Technical SEO

| Item | Result |
| --- | --- |
| Legacy redirects | All previously-broken livestock and wholesale targets corrected and verified live (§3 F3, F4) |
| Broken links | No 404 or redirect loop found in the checked legacy set. Every destination is a route or shelf this app serves, asserted by `legacyRedirects.test.ts` |
| Categories | Pills are derived from products; `cooking-serving`, `bulk`, `lamps-decor` hold no product and are not offered. `Live Stock` renamed to `Livestock` publicly |
| HTML sitemap | Now lists `/blog` and the published article plus `/editorial-policy` |
| XML sitemap | Unchanged, verified valid and current: 12 static routes, `/blog`, 3 populated shelves, 6 products, 1 article, 3 author pages |
| Robots | `/robots.txt` 200. Preview hosts are refused `noindex` by the middleware and `@/lib/seo/indexing` |
| Canonicals | Unchanged; spot-checked on `/about`, `/blog/:slug`, `/products/:slug`, `/editorial-policy` — self-referencing, apex host, no staging URL |
| Structured data | Product, Offer, FAQPage, Breadcrumb, Organization, WebSite and Article JSON-LD unchanged. The `LocalBusiness` description still reads "for livestock and the kitchen … licks and blocks, and bulk bags" — accurate for the current catalogue |
| Search Console | Not available in this session. `Couldn't fetch` / deindexing status cannot be confirmed and is not claimed |

## 7. Editorial content

- **Existing article improved:** none rewritten. `/blog/how-to-cook-with-himalayan-pink-salt` was read in full; it is genuinely useful kitchen guidance and its claims are supportable. It is now reachable from the header, the footer and the HTML sitemap.
- **New guides published:** none. No article was generated to fill a quota — that is the failure mode the mission warns against.
- **New drafts requiring review:** none written. A content plan is recommended (§11) rather than mass-published.
- **Editorial policy:** created and live (§3 F11).
- **Author information:** now accurate organisation-level attribution (§3 F10). No person is invented.
- **Internal linking:** `/blog` added to header, footer and HTML sitemap; `/editorial-policy` linked from the footer, the disclaimer, the About team block and the sitemap.

## 8. Compliance

| Surface | Status |
| --- | --- |
| About | Unsupported colic testimonial removed; team block renamed to the real editorial team and linked to the editorial policy |
| Contact | Unchanged, live 200 |
| Privacy | Unchanged. Substantial AdSense disclosure already present and accurate about Consent Mode defaults |
| Disclaimer | Preview-host reference and non-existent affiliate promise removed; veterinary and "not a complete mineral program" sections retained |
| Terms | Unchanged |
| Shipping | 45 lb parcel claim corrected |
| Returns | Unchanged; 30-day window consistent with the FAQ |
| Consent | Unchanged (Codex's implementation preserved). **Not re-tested interactively this session** |
| Ads.txt | Correct and unchanged |
| Ad exclusions | No ad code was added or enabled. Existing rules are covered by `src/lib/seo/adsenseSafety.test.ts` (25 tests, passing) |
| CMP | **Unresolved.** The custom consent banner is not asserted to be a Google-certified CMP. Per the mission, ad serving should stay disabled for EEA/UK/CH visitors until that is verified |

## 9. Performance & QA

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0). Only pre-existing warnings: `no-img-element` and `exhaustive-deps` |
| `npm test` | **2120 passed, 19 skipped, 0 failed** (200 suites passed, 5 skipped). Baseline before this work was 2115 passed; the +5 are the new and extended assertions |
| `npm run build:production` | PASS, including the production-config assertion, the public-origin scan and the 28-variable credential scan |
| Mobile browser tests | **NOT re-run this session.** No layout was changed, and Codex's 2026-10-11 viewport verification (360/375/390/430/768/1440, no horizontal overflow, consent and footer behaviour) stands for the untouched surfaces. The one new page uses the same container classes as the other policy pages |
| Performance measurement | **NOT measured this session.** No claim is made. The last measured figures stand: mobile lab LCP 3.068 s, TTFB 2.518 s in the stated throttled conditions — the LCP target is not met, and Codex reports hosting CPU/memory/IO pressure on the WooCommerce origin |

## 10. Production

| Item | Value |
| --- | --- |
| Pre-deployment SHA | `5bd49e221ce1beaa9fb43e955150818e3918936f` |
| Deployed SHA | `1d75aaed8fcbff22f598199473027744c8dae3a6`, verified from the apex `/api/version` |
| Cloudflare version | `5bbe892c-e492-4eb9-a38e-3274992941b3`, deployed and read back: the production Worker name exists and carries all 7 expected public variables |
| Production smoke tests | `/`, `/products`, `/about`, `/blog`, the article, `/editorial-policy`, `/sitemap`, `/sitemap.xml`, `/robots.txt`, `/ads.txt`, `/faqs`, `/shipping`, `/returns`, `/terms`, `/privacy`, `/disclaimer`, `/contact`, `/checkout` — all 200 after the deploy settled. A transient 503 burst during propagation was observed and **re-checked until it cleared**; it is reported here rather than hidden |
| Stripe preserved | `/api/stripe/config` → 200, live, configured, webhook configured |
| Shippo preserved | `/api/shippo/rates` read-only: 2 lb lick, 45 lb bag and 30 lb rock each return 8 carrier rates. No label purchased |
| Checkout preserved | `/checkout` 200; `/api/cart` 200 with `no-store`; no paid order created |
| Rollback ready | YES. Prior Worker version `01e86bd1-3128-4f85-af62-77f5c6ada494` (`7a56f65`) and before that `5bd49e2`'s version are both available. No inventory, product, order or DNS change was made, so a Worker rollback is sufficient |

The one deployment-related risk worth naming: the 503 burst immediately after
the upload. It cleared within about 20 seconds and every route was re-verified
200. If it recurs on a future deploy, treat it as propagation of the new Worker
version rather than a broken build.

## 11. Remaining blockers

| # | Page / area | Reason | Required from the owner | Site functionality affected |
| --- | --- | --- | --- | --- |
| B1 | `/about` testimonials | A genuine testimonial tied salt licks to a chronic-colic improvement and was removed. A replacement must be the customer's own words | An accurately revised, non-medical quotation from the customer, or confirmation to leave it off | No |
| B2 | `/about` claim density | Statements about licensed mining partners, fair compensation, chain of custody, facility auditing and "sheltering the salt from surface pollutants, microplastics" are business assertions this work could not verify from any document | Certificates of Analysis, supplier audit documents, or approval to soften/remove each specific claim | No |
| B3 | Product 2531 | Title says "for Livestock … Edible Pink Cooking Salt"; SKU is the 3 lb edible fine salt. Title and SKU describe different uses | A corrected title, or confirmation to keep the owner's preview title | No — it sells and ships correctly |
| B4 | `HK-ESF-3lbs` imagery | Retained photos show 6 lb packaging (carried over from Codex's report) | A confirmed 3 lb packaging photograph | No |
| B5 | `src/data/resources.ts` | ~40 legacy resource articles carry citations that read as invented ("Culinary Institute of America Reference Notes", "Culinary Science Digest"). The `/resources` hub is live but orphaned — absent from the nav, the sitemap and the HTML sitemap | Approval to remove the fabricated references, or to retire the library and 410 the URLs | No |
| B6 | EEA/UK/CH advertising | The custom consent banner is not asserted to be a Google-certified CMP | Confirmation of a certified CMP, or agreement to keep personalized ads disabled in those regions | No |
| B7 | AdSense account status | Only Google's own dashboard can confirm review outcome | Check the account | No |
| B8 | Performance | Hosting CPU/memory/IO pressure on the WooCommerce origin; LCP above target | Hosting capacity work | Yes — slower pages under load |
| B9 | Preview subdomain | `preview.himalayankoh.com` is a stale build (reported previously). Its `noindex` is intact | Deploy or retire it | No |
| B10 | Native devices | No physical Android/iOS testing is possible from here | Physical device pass | No |
| B11 | Announcement bar | Reads "Himalayan salt for horses, cattle and deer"; there is no deer product in the catalogue. Not a claims problem, but a market statement | Confirm or reword | No |

## 12. Final verdict

```text
AdSense readiness:  PARTIALLY READY
Production health:  PASS
```

Partially ready because the defects that were found are fixed and verified, but
AdSense approval is Google's decision, the CMP requirement for EEA/UK/CH
advertising is unresolved, and the `/about` sourcing claims still rest on
business assertions the owner has not yet documented. Production health is
PASS with the caveat that catalogue reads run against a WooCommerce origin under
CPU/memory/IO pressure, and no mobile or performance test was re-run this
session because no layout or data path was changed.

```text
PROJECT: Himalayan Koh
REPOSITORY: https://github.com/himalayankoh/himalayankoh.git
LOCAL PATH: C:\Users\basco\Downloads\hk\himalayan-koh
BRANCH: integration/cloudflare-workers-migration
CHANGES: Animal-lic copy and shelf-aware usage note; colic testimonial and "Salt that Heals" removed; /about metadata; livestock legacy redirect targets; /whole-sale redirect; Livestock label; HTML sitemap guides section; honest author registry; /editorial-policy; Guides nav; disclaimer and shipping copy; 2 regressions + 3 updated tests
TESTS: typecheck PASS; lint PASS (pre-existing warnings only); 2120 passed / 19 skipped / 0 failed; production build and all guards PASS
BUILD: Next/vinext production artifact PASS; origin and 28-variable secret scans PASS
COMMIT: 7a56f65 (content/SEO/editorial), 1d75aae (footer label) — both pushed to active origin
PUSH STATUS: pushed to origin/integration/cloudflare-workers-migration
DEPLOYMENT: apex /api/version = 1d75aaed8fcbff22f598199473027744c8dae3a6; Cloudflare version 5bbe892c-e492-4eb9-a38e-3274992941b3 read back with 7/7 public variables
BLOCKERS: /about sourcing claims (B2); product 2531 title (B3); 3 lb photo (B4); fabricated citations in the retired /resources library (B5); CMP not certified (B6); LCP and origin resource pressure (B8)
NEXT ACTION: Owner review of B1–B5 decisions, then a measured performance pass on the WooCommerce origin and a mobile re-verification after the next layout change
```
