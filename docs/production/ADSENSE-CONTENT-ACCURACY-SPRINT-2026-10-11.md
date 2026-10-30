# AdSense content and product accuracy sprint — 2026-10-11

Continues the verification recorded in `docs/production/ADSENSE-SEO-PRODUCTION-VERIFICATION-2026-10-11.md`.
Nothing in that report is repeated here as work; this one records the four accuracy items it left
open plus the six guide drafts, and it separates what was implemented from what the owner has to
decide.

## State at the start of this sprint

| | |
| --- | --- |
| Branch | `integration/cloudflare-workers-migration` |
| Git HEAD at start | `16c73e2` |
| Production source at start | `78613ae` |
| Undeployed work found | the blog-routing fix, the announcement rewrite and two new test files, uncommitted in the working tree |
| Git HEAD at end | `76310c1` |
| Production source at end | `76310c1` (Worker `himalayan-koh-ecommerce-prod`, deployed and read back from Cloudflare) |

The two commits between `78613ae` and `16c73e2` were documentation only, so no code was stranded —
but the uncommitted routing and copy changes were, and they are now committed, pushed and deployed.

---

## Priority 1 — the 3 lb product photograph: BLOCKED, owner asset required

**Finding.** The genuine 3 lb photograph does not exist anywhere in the store's media library, so
nothing can be mapped to it. The 3 lb SKU's retained images are the 6 lb pouch shots, exactly as the
three earlier reports describe. This is not a mapping bug that code can fix.

**Evidence gathered now, read-only:**

- WordPress media search for `3lb`, `3-lb` and `6lb` returns **zero** items. `3 lbs` returns only two
  unrelated 1 lb jars imported from another brand's assets (`Himalayan-Chef-...-Jar-1-lbs.jpg`, ids
  2188 and 2194). There is no media item whose name or slug refers to a 3 lb package.
- The image mapping module already handles this SKU honestly: `src/lib/products/curatedImages.ts`
  holds curated sets for the 30 lb block and the 6 lb pouch and no fabricated set for a 3 lb package.
- Prior evidence, unchanged: `docs/production/MOBILE-CATALOG-RELEASE-2026-10-11.md:44`,
  `docs/production/PREVIEW-CATALOG-REPLACEMENT-2026-10-11.md:20`,
  `docs/production/ADSENSE-READINESS-SEO-CONTENT-2026-10-11.md:177` (item B4).

**Exact asset required** (the only thing that unblocks this):

1. One original photograph of the **actual 3 lb package as shipped** for `HK-ESF-3lbs`
   (variation 2466 under parent 2461) — the pouch or jar the customer receives, not a 6 lb pack and
   not a stock image — with the package's own net-weight line legible in frame.
2. Useful companions, same shoot: a second angle, a grain close-up, and one shot with the package in
   hand for scale.
3. If the 3 lb and 6 lb packs carry different labels or artwork, an equivalent set for the 6 lb pouch
   so the two are not confused again.
4. Delivery: the owner supplies the files; they are uploaded to the WordPress media library and the
   product's gallery is pointed at them. Nothing is relabelled, cropped to hide a weight, or
   regenerated, and no image is invented to fill the gap.

Until that exists, the listing keeps the images it has and this report claims no fix.

---

## Priority 2 — blog routing: PASS

**What was wrong.** One lookup returned `null` for two different situations — WordPress answered "no
such published post", and the read itself failed. Both produced a thin HTTP 200 that crawlers could
index as an article.

**What it does now** (`src/lib/seo/server.ts`, `src/app/(main)/blog/[slug]/page.tsx`):

| Case | Answer |
| --- | --- |
| `found` — the store returned the published post | render the article, **200**, indexable |
| `missing` — the store answered with an empty list | **404**, decided in `generateMetadata` before anything is flushed; the not-found page carries `noindex` |
| `unavailable` — the read threw (timeout, HTTP error, HTML fatal) | the page renders the honest retryable client state under `noindex, nofollow`; **never** a 404, so a slow origin cannot deindex a real article |

The failure is logged with the slug, because that is the one state an operator has to see.

**Regression tests.** `src/lib/seo/blogLookup.test.ts` and
`src/app/(main)/blog/[slug]/page.status.test.ts` — 9 tests across the two files, including that a read
failure is not reported as a missing post.

**Live production evidence** (read after the deploy, SHA `76310c1`):

| URL | Status | Robots |
| --- | --- | --- |
| `/blog/how-to-cook-with-himalayan-pink-salt` | 200 | indexable |
| `/blog/himalayan-pink-vs-white-salt` | 200 | `noindex, nofollow` (off-niche, kept for its old URL) |
| `/blog/this-article-does-not-exist-12345` | **404** | `noindex`, body reads "Page Not Found — We could not find that page" |
| `/blog/another-missing-article` | **404** | `noindex` |
| `/blog/why-do-dairy-cows-need-trace-minerals` | 308 → `/blog` | 200 at the destination |

The `unavailable` branch cannot be produced against a live origin without breaking it; it is covered
by the unit tests and by the client state, and that is the honest limit of the live proof.

---

## Priority 3 — the sitewide announcement: PASS, implemented and deployed

**Before / after**, on every page:

- before: `All Natural` · *Himalayan salt for horses, cattle and deer*
- after: `All Natural` · *Himalayan salt for livestock and the kitchen*

The old line named deer, and the live catalogue (six published products: cattle red rock block, horse
licks 2 lb and 6 lb, 45 lb and 6 lb loose salt, edible fine grain, 16 oz edible jar) has no deer
product. The new line is true of the whole business, carries no health claim and promises nothing
that is not for sale.

**Three more app-owned statements carried the same two defects** — a species the catalogue does not
serve and an outcome a salt cannot deliver. They were on the deployed front page, so they were fixed
in the same release rather than left beside a corrected announcement:

| Location | Before | After |
| --- | --- | --- |
| `src/views/HomePage.tsx` hero | "Ensure your herd is healthy and happy." | removed; the paragraph now describes the shop |
| `src/views/HomePage.tsx` pasture section | "gives cattle, horses, deer, and other animals the quality NaCl they need to stay healthy and be more productive" | "supplies sodium and chloride, the two nutrients a livestock ration has to keep supplying every day" |
| `src/lib/seo/constants.ts` `DEFAULT_DESCRIPTION` (sitewide meta, OpenGraph and `og.png`) | "…for horses, cattle, deer, and edible cooking…" | "…for horses, cattle, and edible cooking…" — only `deer` removed |

These three are flagged for owner review below like any wording change; each is a removal of an
unsupported statement, not new positioning.

---

## Priority 4 — editorial claims: prepared, NOT applied (owner decision)

Nothing in this section was changed. The mission forbids silently rewriting the owner's articles and
testimonials, so each item below is the exact current wording, why it is a problem, and a replacement
the owner can paste. Two of the three are in WordPress, which is the retail source of truth.

### 4.1 Post 233 — "…for Purity and Nutrients" (slug `himalayan-pink-vs-white-salt`, id 233)

Read live from the WordPress REST API on 2026-10-11; 489 words, last modified 2023-03-28, currently
**noindexed** by the app because its title marks it as livestock-trade content, and excluded from the
sitemap and the blog listing.

| Current wording | Problem | Proposed neutral replacement |
| --- | --- | --- |
| Title: "Himalayan Pink Vs. White Salt – Why Farmers, Ranchers and Dairies Are Switching to Pink Himalayan for Purity and Nutrients" | "Purity and Nutrients" promises two properties the article does not measure, and "switching" is a trend claim | "Himalayan Pink Salt and White Salt: What Actually Differs" |
| Excerpt: "…have begun discovering the remarkable benefits of pink Himalayan rock salt." | "remarkable benefits" is an unmeasured benefit claim | "…have looked at pink Himalayan rock salt as an alternative to white salt. This article compares what the two salts are, not what they will do for an animal." |
| Body: "Pink Himalayan Rock Salt has the advantage of being the world's purest salt. And it contains up to 84 trace elements good for livestock health." | "world's purest salt" is unsubstantiated; the "84 trace elements" figure is not supported by the published analyses reviewed in the guides, and "good for livestock health" is a health claim | "Pink Himalayan rock salt is largely sodium chloride, like other rock salts. It contains trace elements from its deposit, in small and variable amounts that are not a substitute for a formulated trace-mineral supplement." |
| Body: "This higher quality sodium helps prevent severe performance issues. You get healthier fertility, improved milk production, faster growth, and improved overall health." | Five unsupported production and health promises in one sentence — the single clearest AdSense risk in the post | delete; if a closing line is wanted: "Salt supplies the sodium and chloride a ration needs every day. Other outcomes depend on the whole ration, not on the salt alone." |
| Body: "They will absorb more healing magnesium." | "healing" is a therapeutic claim | "Sodium and chloride are the nutrients salt is there to supply." |
| Body: "Illness and lower production could easily be caused by things in your livestock's salt." | Suggests competitive products cause illness — an unsupported safety allegation | delete |
| Body: "Try our best and premium quality Pink Himalayan Rock Salt today and see the improvement it can make in your herd." | Promises an improvement | "Try our Pink Himalayan rock salt and see how your animals use it." |

### 4.2 Post 2268 — "Why do dairy cows need trace minerals?" (id 2268)

209 words, last modified 2023-09-06, and — unlike post 233 — **currently indexable, with no
`noindex`**: it is the post a search engine can still surface. Its body (copper, zinc, manganese,
selenium, iodine and cobalt for dairy cattle) is broadly consistent with published extension
guidance. The defect is its closing call to action:

| Current wording | Problem | Proposed replacement |
| --- | --- | --- |
| "Try our premium-quality Himalayan rock salt, which contains 84 trace minerals — all the essential minerals your dairy cows need to stay healthy. Click here to order." | Factually wrong in a way that matters to a dairy producer: rock salt does not supply copper, zinc or selenium at requirement levels, and the "84 trace minerals" figure is unsubstantiated. It tells a farmer a salt purchase covers a mineral need it does not. | "A salt product supplies sodium and chloride. Copper, zinc, selenium, iodine and cobalt come from a trace-mineral supplement formulated for dairy cattle, given in the amount its label directs and as your nutrition adviser specifies." |

This is the highest-value single edit in the sprint: one paragraph, on an indexable page, that
currently misleads the audience the post was written for.

### 4.3 The YouTube reference — "Salt That Heals"

Live on `/blog/how-to-cook-with-himalayan-pink-salt` (WordPress post 2475) and mirrored in
`docs/content/how-to-cook-with-himalayan-pink-salt.html:39`:

> "Visit the <a href="https://www.youtube.com/@himalayankohsaltthatheals3451">Himalayan Koh Salt That
> Heals YouTube channel</a> for more from the brand."

The channel is not renamed, and the app's claim scanner deliberately treats
`Himalayan Koh — Salt that Heals` as allowed (asserted by `src/lib/products/claims.test.ts:99`) because
it is the owner's own tagline on the owner's own channel. The exposed wording is the **link text in
body copy**, on an indexable page, where it reads as the site asserting that salt heals.

| Proposed replacement (owner decides) |
| --- |
| "Visit the [Himalayan Koh YouTube channel](https://www.youtube.com/@himalayankohsaltthatheals3451) for more from the brand." |

The handle in the URL still carries the tagline; the page no longer states it as a claim. If the owner
prefers to keep the link text, that is a legitimate commercial decision — it is simply one an AdSense
reviewer can read as an unsupported health claim, which is why it is flagged rather than changed.

### 4.4 Related article headings and excerpts

The related-articles strip only lists on-niche posts, and there are none, so nothing is rendered from
the legacy posts' titles or excerpts. The exposure is therefore the two posts themselves (above) plus
the owner's product copy below, not a related-heading block.

### 4.5 Owner-authored copy found in this sweep, left exactly as it is

These are commercial statements about the products or the owner's own testimonials. They were not
touched. Proposed neutral wording is given so the decision is a paste, not a project.

| Where | Current wording (verbatim) | Proposed |
| --- | --- | --- |
| Woo short description, 45 lb bag | "…designed for livestock, including horses, cattle, and deer… The salt provides essential nutrients for animal wellness and growth." | "…designed for livestock, including horses and cattle. It supplies sodium and chloride; it is not a trace-mineral supplement." |
| Woo short description, 30 lb red rock | "Provides essential minerals for growth, health, and development. Supports all breeds." | "Unrefined rock salt for free-choice feeding. Supplies sodium and chloride; not a trace-mineral supplement." |
| Woo short description, 30 lb block | "It provides essential minerals and nutrients for proper growth, good health, and impressive development." | "Natural rock salt that animals use at their own pace in the pasture or paddock." |
| Woo short description, 2 lb horse licks | "…these natural salt licks support horse health and energy levels." / "…provides essential minerals, sodium, and electrolytes to support horse health and energy levels." | "Available in two weights. The salt supplies sodium and chloride, which horses need in the ration." |
| Woo short description, edible fine grain | "Elevate your cooking and wellness routines…" | "Hand-mined Himalayan pink salt for cooking, with the grain size stated on the listing." |
| `/about` testimonial (Darolyn Butler, TX) | "I believe my horses are the healthier and able to thrive in this Texas heat due to this change to Himalayan Koh salt." | owner's call — a customer's own belief, published with their name; the owner may keep it, attribute it more explicitly, or retire it |
| `/about` testimonial (James A. Brenek, TX) | "…the best salt blocks we have purchased for our deer ranch." | owner's call — same reasoning |
| `src/views/HomePage.tsx` `saltBenefits[2]` | "Solid rock salt licks withstand rain, wind, and pasture weathering significantly better than compressed salt blocks." | a comparative performance claim about another product type; no source supports "significantly better", and it is commercial positioning, so it needs the owner's approval. Proposal: "Solid rock salt licks are easy to see and check, and they do not blow away." |
| `src/views/HomePage.tsx` `healthCards` | "Essential Electrolyte Support" / "Weather-Resistant Durability… reducing waste in outdoor pastures" | Proposal: retitle to "Sodium and Chloride", "For Outdoor Placement", "Unrefined Rock Salt", keeping the factual body copy. |

---

## Priority 5 — six educational guides: DRAFTED 6, PUBLISHED 0

Written from the fact-and-source brief in `docs/content/GUIDE-AUTHORING-BRIEF.md`, which records every
figure with the extension, veterinary, standards or peer-reviewed source it came from. The guides
state no experiments, no laboratory results, no photographs, no veterinary endorsement, no customer
experience, no product specification and no author or credential; where a claim could not be verified
(block-versus-loose weather durability, a service life for an outdoor block, a universal rule that a
block belongs beside water, the current Codex contaminant text) the brief says so and the drafts write
only the verified part.

| # | Draft (`docs/content/`) | Proposed SEO title | Sources linked | Words |
| --- | --- | --- | --- | ---: |
| 1 | `horse-salt-licks-vs-loose-salt.html` | Salt Licks vs. Loose Salt for Horses and Cattle | 10 | 1,277 |
| 2 | `salt-vs-complete-livestock-minerals.html` | Salt vs. Complete Livestock Minerals: What Salt Can't Do | 7 | 1,142 |
| 3 | `fine-vs-coarse-himalayan-edible-salt.html` | Fine vs Coarse Himalayan Pink Salt: Which to Choose | 8 | 1,270 |
| 4 | `storing-himalayan-pink-salt.html` | Storing Himalayan Pink Salt: Kitchen and Livestock | 9 | 1,127 |
| 5 | `reading-a-salt-analysis-report.html` | Reading a Salt Analysis Report: What Each Number Means | 5 | 1,247 |
| 6 | `livestock-salt-handling-and-safety.html` | How to Handle Livestock Salt Safely: Water Before Salt | 11 | 1,294 |

Each file carries a header comment with its slug, SEO title, meta description, internal links and
`Status: DRAFT`, and nothing was published to WordPress: the owner's review is the gate, and the
mission is explicit that AI articles must not be mass-published. Publication, when the owner approves
one, is the existing route — paste the body into a WordPress post and set the title, slug and meta
fields from the header.

Internal links in the drafts were checked against the live site on 2026-10-11; all resolve 200, and
the redirect-only `/products/himalayan-edible-pink-salt` is deliberately not used.

**A guard test now enforces these rules on the files the guides are published from** —
`src/lib/content/guideDrafts.test.ts`, 34 tests: every `docs/content/*.html` is scanned paragraph by
paragraph with the store's own `hasProhibitedClaim` rule; a mineral count may only appear in
negation; every draft must carry its metadata header, stay inside 900–1,300 words, use 3–7 `<h2>`
headings, contain no `<h1>`, `<script>`, `<style>`, `<img>` or inline style, and link at least three
sources plus an internal page.

---

## Priority 6 — verification: PASS, with the limits stated

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; pre-existing `no-img-element` warnings only, none from this work) |
| `npm test` (full suite) | PASS — **205 files passed, 5 skipped; 2,171 tests passed, 19 skipped** (2,190 total) |
| SEO regression scope | PASS — 14 files, 140 tests (`src/lib/seo/*`, `src/lib/content/guideDrafts.test.ts`, `src/app/(main)/blog/[slug]/page.status.test.ts`, `src/middleware.test.ts`, `src/lib/catalog/nicheBlog.test.ts`) |
| `npm run build` | PASS, including the public-origin scan (1,891 files, no loopback origin) and the secret scan (1,731 files against 28 server-side variables) |
| Production artifact build + guard | PASS — `assert-production-config`, artifact assertions, pre- and post-deploy secret scans (1,191 files) |
| Deploy read-back | PASS — Cloudflare confirms `himalayan-koh-ecommerce-prod` exists and carries the 7 expected production public variables |
| Live `/api/version` | `76310c1e19528d06ee13faf32bd3e4873fe623c9`, built 2026-10-11T20:57:01Z |
| Blog HTTP statuses | PASS — table in Priority 2 |
| Announcement, hero, meta description | PASS — verified in the served HTML, not in the source |
| XML sitemap | PASS — 27 URLs; contains `/blog` and `/blog/how-to-cook-with-himalayan-pink-salt` only; no off-niche or nonexistent article |
| robots.txt | PASS — `Allow: /`, admin/account/orders/wishlist/checkout/api disallowed, sitemap declared |
| Internal links in the drafts | PASS — every target returned 200 |
| Browser QA, mobile 390×844 | PASS — home, a guide and a 404 page render with `scrollWidth` ≤ viewport (no horizontal overflow); the only console entry is the 404 document request itself; no failed network requests on the home page |
| Live checkout untouched | PASS — `/checkout` 200, `/api/cart` 200 with an empty cart, `/api/stripe/config` 200 live and configured; no order, price, stock, weight or secret was written by this sprint |
| 3 lb image | **BLOCKED** — no such asset exists; see Priority 1 |

Not run, and not claimed: a paid checkout or label purchase (none was needed), native iOS/Android
device testing, and a forced WordPress outage to watch the `unavailable` branch on a live origin.

---

## AdSense readiness

**No approval is claimed, and none can be claimed from this side.** What this sprint changes is the
content risk: the site no longer carries, on any page served by the app, an unsupported animal-health
or productivity promise; the sitewide announcement no longer sells a deer product that does not exist;
nonexistent article URLs return 404 instead of thin 200s; and six substantial, sourced guides are ready
to move the blog past a single article. What still counts against it, honestly:

- The owner's WooCommerce product descriptions and two `/about` testimonials still contain wellness,
  growth, energy and health-outcome language (§4.5). They are on indexable pages and are the largest
  remaining content risk.
- Post 2268 is indexable and its call to action asserts that rock salt supplies every essential mineral
  a dairy cow needs (§4.2).
- The 3 lb listing still shows 6 lb packaging.
- Guide count is 1 published article today; the six drafts are not published until the owner approves
  them.

## Owner review required

1. **Approve or decline the six guide drafts.** Nothing is published until you say so.
2. **Post 2268's closing paragraph** (§4.2) — the single highest-value wording edit.
3. **Post 233's title and five claim sentences** (§4.1).
4. **The YouTube link text** (§4.3) — keep the tagline or use the neutral text.
5. **WooCommerce short descriptions** for the five products in §4.5.
6. **The two `/about` testimonials** — keep, attribute, or retire.
7. **Home page durability bullets** (`saltBenefits[2]`, `healthCards`) — comparative claims left in
   place because they are commercial positioning.
8. **Review the three copy changes already deployed** (hero, pasture section, sitewide description).
   They remove unsupported statements; if you want any of the old wording back it is one revert.
9. **Supply the 3 lb package photograph** (Priority 1).

## Remaining blockers

| Blocker | Kind |
| --- | --- |
| 3 lb packaging photograph | owner asset — no code or image work can substitute for it |
| Owner decision on six drafts, the two legacy posts, the testimonials and the Woo descriptions | owner decision |
| `unavailable` (503-class) blog state proven only by unit tests, not by breaking production | verification limit |
| Ads/traffic readiness beyond content (hosting resource pressure, LCP, CMP certification) | carried from the earlier reports, untouched here |

```text
PROJECT: Himalayan Koh
REPOSITORY: https://github.com/himalayankoh/himalayankoh.git
LOCAL PATH: C:\Users\basco\Downloads\hk\himalayan-koh
BRANCH: integration/cloudflare-workers-migration
CURRENT GIT SHA: 76310c1 (origin in sync, 0 ahead / 0 behind before this report)
PRODUCTION SHA: 76310c1 — Worker himalayan-koh-ecommerce-prod, version 442eb900-… read back from Cloudflare
3 LB PRODUCT IMAGE: BLOCKED — no 3 lb asset exists in the media library (searches 3lb/3-lb/6lb return zero); retained photos are the 6 lb pouch; owner photograph specified in Priority 1
BLOG 404 FIX: PASS — nonexistent slug 404, valid article 200, read failure renders a retryable noindex page and never 404; live-verified after deploy
ANNOUNCEMENT: PASS — "Himalayan salt for livestock and the kitchen" live on every page; three further app-owned health/deer statements corrected in the same release
EDITORIAL CLAIMS: PREPARED, NOT APPLIED — post 233 (title + 5 claim sentences), post 2268 (closing 84-mineral claim, currently indexable), the "Salt That Heals" link text, five Woo short descriptions and two testimonials, each with exact pasted-ready alternatives and flagged for owner approval
NEW GUIDES DRAFTED: 6 (+1 authoring brief with sources)
NEW GUIDES PUBLISHED: 0 — deliberately; owner review is the gate
OWNER REVIEW REQUIRED: 9 items, listed above
SEO TESTS: PASS — 14 files, 140 tests
FULL TEST COUNT: 2,171 passed, 19 skipped (205 files passed, 5 skipped)
DEPLOYMENT: PASS — guarded production build and deploy; public-origin and secret scans clean; live behaviour re-verified after deploy
ADSENSE READINESS: improved, not approved and not claimed — the remaining content risk is owner-authored product copy and one indexable legacy post
REMAINING BLOCKERS: the 3 lb photograph; the owner's decisions above; the 503-class state proven by tests only
NEXT ACTION: owner review of the six drafts and the Priority 4 wording; supply the 3 lb photograph
```
