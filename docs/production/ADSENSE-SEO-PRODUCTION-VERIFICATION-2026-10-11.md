# AdSense readiness, SEO and content — implementation and production verification

Date: 2026-10-11. Branch `integration/cloudflare-workers-migration`. Every change below was
typechecked, tested, built through the guarded production build, deployed to
`himalayan-koh-ecommerce-prod`, and re-read from `https://himalayankoh.com`.

Deployed commit: **`78613ae`** (`GET /api/version` → `78613ae…`, built 2026-10-11T19:57:03Z).

## 1. Handover

| | |
|---|---|
| Repository | `https://github.com/himalayankoh/himalayankoh` (`origin`), branch `integration/cloudflare-workers-migration` |
| Local path | `C:\Users\basco\Downloads\hk\himalayan-koh` |
| Codex work found | Preview catalog replacement (6 products, retired parents 2520/2461/2446/2372/2367/2352/2321/271/281), admin lb/in conversion, delivery-day removal, cart entity decoding, mobile UX/footer/consent, Shippo weights |
| Codex work preserved | All of the above; no reset, no force-push, no rewritten history, no WordPress or catalog writes |
| Uncommitted work found | None belonging to Codex. One untracked artifact (`himalayan-koh-leados.zip`) left untracked and uncommitted |

Commits from this session:

| Commit | Change |
|---|---|
| `f5750a3` | Blog no longer prints WordPress's default `Uncategorized` bucket as a category |
| `f1660be` | Every retired product URL points at a product the catalogue still sells |
| `305a710` | Editorial policy listed in the XML sitemap |
| `85a9608` | Related-articles strip stops advertising withheld posts; no more `<img src="">` |
| `78613ae` | Pink-vs-white legacy URL sent to the post that exists |

## 2. Already resolved before this session (verified, not re-fixed)

Animal-use product copy separated from culinary copy; the colic testimonial removed from
About; `Live Stock` → `Livestock` label; empty `bulk` and `cooking-serving` targets
replaced; Guides in header, mobile drawer, footer and HTML sitemap; `/editorial-policy`
published; compact footer, cookie consent, galleries and mobile layout from the Codex
releases.

## 3. Newly fixed (each verified on production)

1. **Broken legacy product redirects — the largest defect found.** The catalog replacement
   re-slugged all six products, but the redirect map's destinations were still the
   Supabase-era slugs. Ten destinations answered **404**, so every indexed legacy product
   URL — `/product/<slug>` and the `/products/<slug>` spelling an earlier crawl actually
   indexed — redirected straight into a dead end. Each retired slug now resolves to the
   live product that replaced it (or a shelf for lines that no longer exist), in both
   spellings, in one hop.
2. **A legacy redirect to a nonexistent article.** `/himalayan-pink-vs-white-salt`
   pointed at `/blog/himalayan-pink-vs-white-salt-farmers`, which matches no post: the URL
   served a 200 page holding no article and no robots meta — a thin soft-404 at the end of
   a redirect from an indexed URL. It now names `himalayan-pink-vs-white-salt`, the slug
   WordPress publishes (post 233), which renders the article and carries the storefront's
   intentional `noindex` for livestock-era content.
3. **The blog's `Uncategorized` chip.** The live guide printed `Uncategorized` above the
   article and beside every related card (2 occurrences in the served HTML), because
   WordPress assigns its default term to any unfiled post. A default bucket now reads as
   "not filed", the rule the product model already applies.
4. **The related-articles strip advertised withheld content.** The blog index and sitemap
   filter through `lib/catalog/nicheBlog.ts`; the "keep reading" strip did not, so the live
   guide linked to the two livestock-era posts the store holds back everywhere else.
   The gate now applies to that read as well.
5. **Image elements with no source.** Posts have no featured image (the guide has none),
   so both listing cards and both related cards rendered `<img src="">` — an image element
   with no source in the HTML and a blank block in the card. Cards now fall back to a
   placeholder (verified: 1 placeholder, 0 sourceless images on `/blog`).
6. **Editorial policy missing from the XML sitemap.** It was linked from the footer and
   the HTML sitemap but absent from the index crawlers read.
7. **Both "eidible" typo redirects in `next.config.ts`** pointed at retired Supabase slugs
   (404). Retargeted to the live 3 lb fine-grain salt and the 6 lb pouch.

Regression tests added: retired-slug coverage, the app-spelling twin rule, "a redirect may
never shadow a live product slug", the corrected blog destination, the related read's niche
gate, and the sitemap's trust page.

## 4. Product content

- **Animal-use copy:** the horse lick and 6 lb pouch no longer carry the kitchen/workshop
  and cooking-slab text (fixed in the earlier batch; re-verified on the live pages).
- **Culinary copy:** the guide and the edible listing are the culinary surface; the guide
  explicitly separates livestock blocks and decorative pieces from edible salt.
- **Specifications:** 6 live products, all simple, 30/2/45/6/3 lb and 16 oz (1 lb), stock
  10, IDs 2544/2543/2539/2536/2531/2526, SKUs `HK-LB-30LBS`, `HK-LFH-2lbs`, `HK-LFC-45lbs`,
  `HK-ESF-6lbs`, `HK-ESF-3lbs`, `HK-ESF-16oz`. Prices unchanged: $49.95, $19.95, $49.95,
  $19.95, $19.95, $9.95.
- **Unsupported claims:** none found in the app's product templates; the remaining
  owner-authored instances are listed as blockers.
- **Testimonials:** the disease-related testimonial is gone from `/about`.
- **Packaging images:** unchanged; the 3 lb item's source photos still include 6 lb pouch
  packaging (owner item).

## 5. Technical SEO

- **Legacy redirects:** 25 product URLs verified 200 in one hop (12 re-verified on the final
  build); 9 page-level legacy URLs 200 in ≤2 hops; none land on a 404.
  `/why-do-dairy-cows-need-trace-minerals/` → `/products?category=live-stock`,
  `/services/fresh-dairy-products/` → the same live shelf, `/himalayan-pink-vs-white-salt/` →
  the real article.
- **Categories:** `/products?category=bulk` is no longer a destination; the shelf tabs are
  derived from live products, so only `live-stock`, `licks-blocks` and `edible-pink-salt`
  are offered — all non-empty.
- **XML sitemap:** 27 URLs — 6 products, 3 shelves, `/blog`, the guide, `/editorial-policy`,
  3 author pages, policies. No staging host, no redirecting product path, no empty category.
- **HTML sitemap:** links Guides (3×), the article, Editorial Policy (2×), the 6 products and
  the 3 shelves.
- **robots.txt:** `Allow: /`, disallows `/admin /account /orders /wishlist /checkout /api/`,
  declares Host and Sitemap.
- **ads.txt:** `google.com, pub-5473713135927706, DIRECT, f08c47fec0942fa0` (unchanged, correct).
- **Canonicals:** self-referencing on the article, the guide and the editorial policy.
- **Structured data:** article page emits Organization, WebSite, Article, BreadcrumbList.

## 6. Editorial content

- Existing article improved earlier (real author attribution by organization, publication and
  update dates, category filed, internal links to the edible collection, FAQs and contact,
  external citations to Morton's conversion and storage guidance).
- `/editorial-policy` explains research, source selection, fact checking, where AI is and is
  not used, corrections, update dates and commercial interest, and states plainly that the
  store sells what it writes about.
- New guides: none published this session. Writing more is the next content task, not a
  compliance prerequisite — there is no fixed AdSense minimum article count.

## 7. Compliance

About, contact, privacy, disclaimer, terms, shipping, returns all answer 200 with the
AdSense advertising disclosures intact in Privacy. Returns/shipping wording was corrected in
the earlier batch and re-read here. Consent: "Decline" hides the banner, persists as
`luxedge_consent_v1=declined` across a reload, and neither GA4 nor AdSense loads afterwards.
`himalayankoh.com` still serves no AdSense script and no ad slot on any page tested.

## 8. Performance and QA

- **Tests:** 202 files passed, 5 skipped; **2128 tests passed, 19 skipped, 0 failed**.
  (The 19 skipped are the credentialed integration suites.)
- **Typecheck:** passed. **Lint:** 0 errors, 246 warnings (pre-existing: `<img>`/Next
  advisories).
- **Build:** guarded production build passed every check (no staging value, live Stripe key
  only, no loopback origin, no server credential in the artifact).
- **Mobile, real Chromium:** 360×800, 390×844, 430×932, 768×1024, 1440×900 across home
  (drawer shows Home/Products/Guides/About/Contact), `/blog`, the guide, `/editorial-policy`
  and `/checkout` — no horizontal overflow on any, no overlapping controls.
- **Latency (warm cache, unthrottled):** TTFB 0.115–0.286 s for HTML; `/api/catalog` 1.48 s.
- **LCP/INP:** not re-measured this session; the last throttled lab sample was LCP 3.068 s,
  CLS 0, which exceeds the 2.5 s target. No performance pass is claimed.

## 9. Production

Pre-deploy SHA `85a9608` → deployed `78613ae`. Stripe: live mode, configured, webhook
present, charging not blocked. Shippo: configured, 8 live options (USPS/UPS) for the 2 lb
lick plus the 45 lb bag. Cart API 200; `/checkout` renders its empty-cart state; no order,
payment or customer record was created or modified. Rollback: previous Worker version and
the catalog backup remain available; no DNS or routing change was made.

## 10. Remaining blockers (owner decisions — nothing below breaks the store)

| Item | Page | Why it needs the owner | Affects functionality? |
|---|---|---|---|
| Announcement bar reads "Himalayan salt for horses, cattle and deer" on every page, including the kitchen guide | site-wide | Brand positioning; the live catalog is mostly livestock, so the line is not factually wrong | No |
| Post 233 title ends "…for Purity and Nutrients"; the linked YouTube channel is "Himalayan Koh Salt That Heals" | `/blog/himalayan-pink-vs-white-salt` (noindexed), the guide's YouTube section | Owner-authored titles carrying claim wording; the app must not rewrite the owner's post or rename their channel | No |
| Unknown `/blog/<slug>` answers 200 with an empty shell instead of 404 | `/blog/*` | The client refetch can still find a post after a slow origin read, so a hard 404 risks breaking real articles; needs a deliberate decision | No |
| Correct 3 lb packaging photograph | 3 lb product gallery | Only the owner has the genuine photo | No |
| A named author or reviewer | author pages / guides | Editorial policy states the organizational byline honestly rather than inventing a person | No |
| Media provenance register | product and blog images | Byte-identity was verified at the catalog replacement; licensing documents were not reviewed | No |
| AdSense account status | — | Only Google's account can confirm approval; ads are not enabled | No |

## 11. Verdict

- **AdSense readiness: PARTIALLY READY.** The blocking classes are addressed — no
  unsupported health claims in the app's copy, no demo content in navigation or sitemaps,
  thin/empty destinations removed, consent working and ads off, editorial responsibility
  documented. What remains is original content depth and the owner decisions above.
- **Production health: PASS.** 18 key routes 200, 34 legacy URLs resolving, sitemaps and
  robots correct, Stripe/Shippo/cart/checkout intact, 2128 tests green, no ad or analytics
  script loading without consent.

Google AdSense approval is not claimed and cannot be established from the site itself.
